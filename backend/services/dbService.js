import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/db.json');
const CACHE_TTL_MS = Number(process.env.DB_CACHE_TTL_MS || 60000);
const QUESTION_COLUMNS = 'id,subjectId,content,answer,quizName,tags,createdAt,sourceId,sourceSlot';
const SUBJECT_COLUMNS = 'id,name,createdAt';

function normalizeSupabaseUrl(url = '') {
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

let writePromise = Promise.resolve();
const cache = new Map();

export function isSupabaseEnabled() { return Boolean(supabase); }
export function getSupabaseClient() { return supabase; }

async function readJsonDb() {
  try {
    return JSON.parse(await fs.readFile(dbPath, 'utf8'));
  } catch (error) {
    console.error('Loi doc database JSON, khoi tao du lieu rong:', error.message);
    return { subjects: [], questions: [] };
  }
}

async function writeJsonDb(data) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureSupabaseSuccess(result, action) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}

function normalizeQuizName(quizName = '') {
  return String(quizName || '').trim() || 'Khac';
}

function normalizeQuestion(question) {
  return { ...question, quizName: normalizeQuizName(question.quizName) };
}

export function normalizeQuestionSearchText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, entity => ({
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    })[entity.toLowerCase()] || ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const numericCode = code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isInteger(numericCode) && numericCode >= 0 && numericCode <= 0x10ffff
        ? String.fromCodePoint(numericCode)
        : ' ';
    })
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function questionMatchesSearch(question = {}, search = '') {
  const tokens = normalizeQuestionSearchText(search).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const searchableText = normalizeQuestionSearchText([
    question.content,
    question.answer
  ].filter(Boolean).join(' '));
  return tokens.every(token => searchableText.includes(token));
}

function toQuestionPayload(question) {
  return {
    id: question.id,
    subjectId: question.subjectId,
    content: question.content,
    answer: question.answer,
    quizName: normalizeQuizName(question.quizName),
    tags: Array.isArray(question.tags) ? question.tags : [],
    createdAt: question.createdAt || new Date().toISOString(),
    sourceId: question.sourceId ?? null,
    sourceSlot: question.sourceSlot ?? null
  };
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateDbCache() { cache.clear(); }

export async function listSubjectsWithCounts() {
  const cached = getCached('subjects-with-counts');
  if (cached) return cached;
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    const counts = db.questions.reduce((result, question) => {
      result[question.subjectId] = (result[question.subjectId] || 0) + 1;
      return result;
    }, {});
    return setCached('subjects-with-counts', db.subjects.map(subject => ({
      ...subject,
      questionCount: counts[subject.id] || 0
    })));
  }

  const rpcResult = await supabase.rpc('get_subjects_with_question_counts');
  if (!rpcResult.error) {
    return setCached('subjects-with-counts', rpcResult.data.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      questionCount: Number(row.questionCount) || 0
    })));
  }

  const [subjectsResult, countsResult] = await Promise.all([
    supabase.from('subjects').select(SUBJECT_COLUMNS).order('createdAt', { ascending: true }),
    supabase.from('questions').select('subjectId')
  ]);
  const subjects = ensureSupabaseSuccess(subjectsResult, 'Loi doc subjects tu Supabase');
  const counts = ensureSupabaseSuccess(countsResult, 'Loi dem questions tu Supabase').reduce((value, row) => {
    value[row.subjectId] = (value[row.subjectId] || 0) + 1;
    return value;
  }, {});
  return setCached('subjects-with-counts', subjects.map(subject => ({
    ...subject,
    questionCount: counts[subject.id] || 0
  })));
}

export async function getSubjectById(id) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    return db.subjects.find(subject => subject.id === id) || null;
  }
  return ensureSupabaseSuccess(
    await supabase.from('subjects').select(SUBJECT_COLUMNS).eq('id', id).maybeSingle(),
    'Loi doc subject tu Supabase'
  );
}

export async function getSubjectByName(name) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    return db.subjects.find(subject => subject.name.toLowerCase() === name.toLowerCase()) || null;
  }
  return ensureSupabaseSuccess(
    await supabase.from('subjects').select(SUBJECT_COLUMNS).ilike('name', name).maybeSingle(),
    'Loi kiem tra subject trung ten'
  );
}

export async function insertSubject(subject) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    db.subjects.push(subject);
    await writeJsonDb(db);
    invalidateDbCache();
    return subject;
  }
  const inserted = ensureSupabaseSuccess(
    await supabase.from('subjects').insert(subject).select(SUBJECT_COLUMNS).single(),
    'Loi tao subject tren Supabase'
  );
  invalidateDbCache();
  return inserted;
}

export async function removeSubject(id) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    if (!db.subjects.some(subject => subject.id === id)) return false;
    db.subjects = db.subjects.filter(subject => subject.id !== id);
    db.questions = db.questions.filter(question => question.subjectId !== id);
    await writeJsonDb(db);
    invalidateDbCache();
    return true;
  }
  const deleted = ensureSupabaseSuccess(
    await supabase.from('subjects').delete().eq('id', id).select('id').maybeSingle(),
    'Loi xoa subject tren Supabase'
  );
  invalidateDbCache();
  return Boolean(deleted);
}

export async function listQuestions({ subjectId = '', quizName = '', search = '', limit = 0, offset = 0 } = {}) {
  const pageLimit = Math.max(0, Number(limit) || 0);
  const pageOffset = Math.max(0, Number(offset) || 0);

  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    const questions = db.questions
      .filter(question => !subjectId || question.subjectId === subjectId)
      .filter(question => !quizName || normalizeQuizName(question.quizName) === normalizeQuizName(quizName))
      .filter(question => questionMatchesSearch(question, search))
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));

    if (!pageLimit) return questions;
    return {
      items: questions.slice(pageOffset, pageOffset + pageLimit),
      total: questions.length
    };
  }

  let rpcQuery = supabase.rpc('search_questions_v2', {
    p_subject_id: subjectId || null,
    p_quiz_name: quizName ? normalizeQuizName(quizName) : null,
    p_search: search.trim() || null
  }, pageLimit ? { count: 'exact' } : undefined);
  if (pageLimit) rpcQuery = rpcQuery.range(pageOffset, pageOffset + pageLimit - 1);
  const rpcResult = await rpcQuery;
  if (!rpcResult.error) {
    const items = rpcResult.data.map(normalizeQuestion);
    return pageLimit ? { items, total: rpcResult.count ?? items.length } : items;
  }

  if (search.trim()) {
    const rows = [];
    const batchSize = 1000;
    let batchOffset = 0;
    while (true) {
      let batchQuery = supabase.from('questions').select(QUESTION_COLUMNS);
      if (subjectId) batchQuery = batchQuery.eq('subjectId', subjectId);
      if (quizName) batchQuery = batchQuery.eq('quizName', normalizeQuizName(quizName));
      batchQuery = batchQuery
        .order('createdAt', { ascending: false })
        .range(batchOffset, batchOffset + batchSize - 1);
      const batch = ensureSupabaseSuccess(await batchQuery, 'Loi doc questions de tim kiem tu Supabase')
        .map(normalizeQuestion);
      rows.push(...batch);
      if (batch.length < batchSize) break;
      batchOffset += batch.length;
    }
    const matchedRows = rows
      .filter(question => questionMatchesSearch(question, search));
    if (!pageLimit) return matchedRows;
    return {
      items: matchedRows.slice(pageOffset, pageOffset + pageLimit),
      total: matchedRows.length
    };
  }

  let query = supabase.from('questions').select(
    QUESTION_COLUMNS,
    pageLimit ? { count: 'exact' } : undefined
  );
  if (subjectId) query = query.eq('subjectId', subjectId);
  if (quizName) query = query.eq('quizName', normalizeQuizName(quizName));
  query = query.order('createdAt', { ascending: false });
  if (pageLimit) query = query.range(pageOffset, pageOffset + pageLimit - 1);
  const result = await query;
  const items = ensureSupabaseSuccess(result, 'Loi doc questions tu Supabase').map(normalizeQuestion);
  return pageLimit ? { items, total: result.count ?? items.length } : items;
}

export async function listQuestionCandidates(excludeId = '') {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    return db.questions.filter(question => question.id !== excludeId).map(({ id, content }) => ({ id, content }));
  }
  let query = supabase.from('questions').select('id,content');
  if (excludeId) query = query.neq('id', excludeId);
  return ensureSupabaseSuccess(await query, 'Loi doc noi dung questions tu Supabase');
}

export async function getQuestionById(id) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    return db.questions.find(question => question.id === id) || null;
  }
  const question = ensureSupabaseSuccess(
    await supabase.from('questions').select(QUESTION_COLUMNS).eq('id', id).maybeSingle(),
    'Loi doc question tu Supabase'
  );
  return question ? normalizeQuestion(question) : null;
}

export async function insertQuestion(question) {
  const payload = toQuestionPayload(question);
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    db.questions.push(payload);
    await writeJsonDb(db);
    invalidateDbCache();
    return payload;
  }
  const inserted = ensureSupabaseSuccess(
    await supabase.from('questions').insert(payload).select(QUESTION_COLUMNS).single(),
    'Loi tao question tren Supabase'
  );
  invalidateDbCache();
  return normalizeQuestion(inserted);
}

export async function updateQuestionById(id, changes) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    const index = db.questions.findIndex(question => question.id === id);
    if (index === -1) return null;
    db.questions[index] = { ...db.questions[index], ...changes };
    await writeJsonDb(db);
    invalidateDbCache();
    return db.questions[index];
  }
  const updated = ensureSupabaseSuccess(
    await supabase.from('questions').update(changes).eq('id', id).select(QUESTION_COLUMNS).maybeSingle(),
    'Loi cap nhat question tren Supabase'
  );
  invalidateDbCache();
  return updated ? normalizeQuestion(updated) : null;
}

export async function removeQuestion(id) {
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    if (!db.questions.some(question => question.id === id)) return false;
    db.questions = db.questions.filter(question => question.id !== id);
    await writeJsonDb(db);
    invalidateDbCache();
    return true;
  }
  const deleted = ensureSupabaseSuccess(
    await supabase.from('questions').delete().eq('id', id).select('id').maybeSingle(),
    'Loi xoa question tren Supabase'
  );
  invalidateDbCache();
  return Boolean(deleted);
}

function buildQuestionStats(questions) {
  const countsBySubject = {};
  const quizSets = {};
  for (const question of questions) {
    countsBySubject[question.subjectId] = (countsBySubject[question.subjectId] || 0) + 1;
    if (!quizSets[question.subjectId]) quizSets[question.subjectId] = new Set();
    quizSets[question.subjectId].add(normalizeQuizName(question.quizName));
  }
  return {
    total: questions.length,
    countsBySubject,
    quizNamesBySubject: Object.fromEntries(Object.entries(quizSets).map(([subjectId, names]) => [
      subjectId,
      Array.from(names).sort((first, second) => first.localeCompare(second, 'vi'))
    ]))
  };
}

export async function getQuestionStatsData() {
  const cached = getCached('question-stats');
  if (cached) return cached;
  if (isSupabaseEnabled()) {
    const rpcResult = await supabase.rpc('get_question_stats');
    if (!rpcResult.error && rpcResult.data) return setCached('question-stats', rpcResult.data);
    const rows = ensureSupabaseSuccess(
      await supabase.from('questions').select('subjectId,quizName'),
      'Loi thong ke questions tu Supabase'
    );
    return setCached('question-stats', buildQuestionStats(rows));
  }
  const db = await readJsonDb();
  return setCached('question-stats', buildQuestionStats(db.questions));
}

export async function readDb() {
  if (!isSupabaseEnabled()) return readJsonDb();
  const [subjectsResult, questionsResult] = await Promise.all([
    supabase.from('subjects').select(SUBJECT_COLUMNS).order('createdAt', { ascending: true }),
    supabase.from('questions').select(QUESTION_COLUMNS).order('createdAt', { ascending: true })
  ]);
  return {
    subjects: ensureSupabaseSuccess(subjectsResult, 'Loi doc subjects tu Supabase'),
    questions: ensureSupabaseSuccess(questionsResult, 'Loi doc questions tu Supabase').map(normalizeQuestion)
  };
}

export async function readSubjectImportDb(subjectId) {
  const [subject, questions] = await Promise.all([getSubjectById(subjectId), listQuestions({ subjectId })]);
  return { subjects: subject ? [subject] : [], questions };
}

export async function appendQuestions(questions = []) {
  const payload = Array.isArray(questions) ? questions.map(toQuestionPayload) : [];
  if (payload.length === 0) return [];
  if (!isSupabaseEnabled()) {
    const db = await readJsonDb();
    db.questions = [...db.questions, ...payload];
    await writeJsonDb(db);
    invalidateDbCache();
    return payload;
  }
  const inserted = ensureSupabaseSuccess(
    await supabase.from('questions').upsert(payload, { onConflict: 'id' }).select(QUESTION_COLUMNS),
    'Loi import questions len Supabase'
  ).map(normalizeQuestion);
  invalidateDbCache();
  return inserted;
}

export async function writeDb(data) {
  writePromise = writePromise.catch(() => {}).then(() => writeJsonDb(data));
  return writePromise;
}

export async function getDbHealth() {
  if (!isSupabaseEnabled()) return {
    storage: 'json', connected: false,
    message: 'SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY chua duoc cau hinh, dang dung db.json.'
  };
  const result = await supabase.from('subjects').select('id', { count: 'exact', head: true });
  return result.error
    ? { storage: 'supabase', connected: false, message: result.error.message }
    : { storage: 'supabase', connected: true, message: 'Da ket noi Supabase thanh cong.' };
}
