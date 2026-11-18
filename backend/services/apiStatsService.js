import { ensureSupabaseSuccess, getSupabaseClient, isSupabaseEnabled } from './dbService.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const FLUSH_INTERVAL_MS = Math.max(5000, Number(process.env.API_STATS_FLUSH_MS || 60000));

const createEmptyStats = () => ({
  totalRequests: 0,
  uniqueUsers: new Set(),
  methods: new Map(),
  statuses: new Map(),
  endpoints: new Map()
});

let fallbackStats = createEmptyStats();
// Thống kê chưa ghi xuống Supabase, theo ngày: gom trong bộ nhớ rồi ghi định kỳ
// thay vì đọc + ghi Supabase cho từng request
let pendingByDate = new Map();
let flushQueue = Promise.resolve();
let flushTimer = null;

const getTodayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const increaseMapValue = (map, key, amount = 1) => {
  map.set(key, (map.get(key) || 0) + amount);
};

const addCounts = (object, map) => {
  const result = { ...(object || {}) };
  for (const [key, count] of map) {
    result[key] = (Number(result[key]) || 0) + count;
  }
  return result;
};

const toSortedList = (source, limit = 5) => {
  const entries = source instanceof Map ? Array.from(source.entries()) : Object.entries(source || {});

  return entries
    .sort((first, second) => Number(second[1]) - Number(first[1]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count: Number(count) }));
};

const recordInto = (stats, { method, path, statusCode, clientId }) => {
  stats.totalRequests += 1;
  stats.uniqueUsers.add(clientId);
  increaseMapValue(stats.methods, method);
  increaseMapValue(stats.statuses, String(statusCode));
  increaseMapValue(stats.endpoints, `${method} ${path}`);
};

const mergeStats = (target, source) => {
  target.totalRequests += source.totalRequests;
  source.uniqueUsers.forEach(user => target.uniqueUsers.add(user));
  source.methods.forEach((count, key) => increaseMapValue(target.methods, key, count));
  source.statuses.forEach((count, key) => increaseMapValue(target.statuses, key, count));
  source.endpoints.forEach((count, key) => increaseMapValue(target.endpoints, key, count));
};

const getFallbackStats = () => ({
  totalRequests: fallbackStats.totalRequests,
  uniqueUsers: fallbackStats.uniqueUsers.size,
  methods: toSortedList(fallbackStats.methods),
  statuses: toSortedList(fallbackStats.statuses),
  endpoints: toSortedList(fallbackStats.endpoints)
});

const resetFallbackStats = () => {
  fallbackStats = createEmptyStats();
};

const getEmptyDbStats = (date) => ({
  date,
  total_requests: 0,
  unique_users: [],
  method_counts: {},
  status_counts: {},
  endpoint_counts: {}
});

const readDbStats = async (date) => {
  const supabase = getSupabaseClient();
  const result = await supabase
    .from('api_daily_stats')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Loi doc api_daily_stats tu Supabase: ${result.error.message}`);
  }

  return result.data || getEmptyDbStats(date);
};

const writeDbStats = async (stats) => {
  const supabase = getSupabaseClient();
  ensureSupabaseSuccess(
    await supabase.from('api_daily_stats').upsert({
      ...stats,
      updated_at: new Date().toISOString()
    }, { onConflict: 'date' }),
    'Loi ghi api_daily_stats len Supabase'
  );
};

const flushOnce = async () => {
  const snapshot = pendingByDate;
  pendingByDate = new Map();

  for (const [date, pending] of snapshot) {
    try {
      const currentStats = await readDbStats(date);
      await writeDbStats({
        date,
        total_requests: Number(currentStats.total_requests || 0) + pending.totalRequests,
        unique_users: Array.from(new Set([...(currentStats.unique_users || []), ...pending.uniqueUsers])),
        method_counts: addCounts(currentStats.method_counts, pending.methods),
        status_counts: addCounts(currentStats.status_counts, pending.statuses),
        endpoint_counts: addCounts(currentStats.endpoint_counts, pending.endpoints)
      });
    } catch (error) {
      console.error('[api-stats] Failed to flush stats:', error.message);
      // Giữ lại để lần flush sau ghi tiếp
      if (!pendingByDate.has(date)) pendingByDate.set(date, createEmptyStats());
      mergeStats(pendingByDate.get(date), pending);
    }
  }
};

export const flushApiStats = () => {
  if (!isSupabaseEnabled()) return Promise.resolve();
  flushQueue = flushQueue.then(flushOnce, flushOnce);
  return flushQueue;
};

const ensureFlushTimer = () => {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (pendingByDate.size > 0) flushApiStats();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref();
};

export const recordApiRequest = ({ method, path, statusCode, clientId }) => {
  if (!isSupabaseEnabled()) {
    recordInto(fallbackStats, { method, path, statusCode, clientId });
    return;
  }

  const date = getTodayKey();
  if (!pendingByDate.has(date)) pendingByDate.set(date, createEmptyStats());
  recordInto(pendingByDate.get(date), { method, path, statusCode, clientId });
  ensureFlushTimer();
};

export const getDailyApiStats = async () => {
  if (!isSupabaseEnabled()) {
    return getFallbackStats();
  }

  await flushApiStats();
  const stats = await readDbStats(getTodayKey());

  return {
    totalRequests: Number(stats.total_requests || 0),
    uniqueUsers: (stats.unique_users || []).length,
    methods: toSortedList(stats.method_counts),
    statuses: toSortedList(stats.status_counts),
    endpoints: toSortedList(stats.endpoint_counts)
  };
};

export const resetDailyApiStats = async () => {
  if (!isSupabaseEnabled()) {
    resetFallbackStats();
  }
};
