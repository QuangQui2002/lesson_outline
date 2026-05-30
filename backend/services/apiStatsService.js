import { ensureSupabaseSuccess, getSupabaseClient, isSupabaseEnabled } from './dbService.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const createEmptyStats = () => ({
  totalRequests: 0,
  uniqueUsers: new Set(),
  methods: new Map(),
  statuses: new Map(),
  endpoints: new Map()
});

let fallbackStats = createEmptyStats();
let writeQueue = Promise.resolve();

const getTodayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const increaseMapValue = (map, key) => {
  map.set(key, (map.get(key) || 0) + 1);
};

const increaseObjectValue = (object, key) => ({
  ...object,
  [key]: (Number(object?.[key]) || 0) + 1
});

const toSortedList = (source, limit = 5) => {
  const entries = source instanceof Map ? Array.from(source.entries()) : Object.entries(source || {});

  return entries
    .sort((first, second) => Number(second[1]) - Number(first[1]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count: Number(count) }));
};

const recordFallbackStats = ({ method, path, statusCode, clientId }) => {
  fallbackStats.totalRequests += 1;
  fallbackStats.uniqueUsers.add(clientId);
  increaseMapValue(fallbackStats.methods, method);
  increaseMapValue(fallbackStats.statuses, String(statusCode));
  increaseMapValue(fallbackStats.endpoints, `${method} ${path}`);
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

export const recordApiRequest = ({ method, path, statusCode, clientId }) => {
  if (!isSupabaseEnabled()) {
    recordFallbackStats({ method, path, statusCode, clientId });
    return;
  }

  writeQueue = writeQueue.then(async () => {
    const date = getTodayKey();
    const currentStats = await readDbStats(date);
    const uniqueUsers = new Set(currentStats.unique_users || []);
    uniqueUsers.add(clientId);

    await writeDbStats({
      date,
      total_requests: Number(currentStats.total_requests || 0) + 1,
      unique_users: Array.from(uniqueUsers),
      method_counts: increaseObjectValue(currentStats.method_counts, method),
      status_counts: increaseObjectValue(currentStats.status_counts, String(statusCode)),
      endpoint_counts: increaseObjectValue(currentStats.endpoint_counts, `${method} ${path}`)
    });
  }).catch((error) => {
    console.error('[api-stats] Failed to record request:', error.message);
  });
};

export const getDailyApiStats = async () => {
  if (!isSupabaseEnabled()) {
    return getFallbackStats();
  }

  await writeQueue;
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
