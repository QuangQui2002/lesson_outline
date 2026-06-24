import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/db.json');

function normalizeSupabaseUrl(url = '') {
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

let writePromise = Promise.resolve();

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

export function getSupabaseClient() {
  return supabase;
}

async function readJsonDb() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
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
  if (result.error) {
    throw new Error(`${action}: ${result.error.message}`);
  }
  return result.data;
}

function normalizeQuestion(question) {
  return {
    ...question,
    quizName: normalizeQuizName(question.quizName)
  };
}

function normalizeQuizName(quizName = '') {
  const normalized = String(quizName || '').trim();
  return normalized || 'Khac';
}

function toSupabaseQuestionPayload(question) {
  const normalized = normalizeQuestion(question);
  return {
    id: normalized.id,
    subjectId: normalized.subjectId,
    content: normalized.content,
    answer: normalized.answer,
    quizName: normalizeQuizName(normalized.quizName),
    tags: Array.isArray(normalized.tags) ? normalized.tags : [],
    createdAt: normalized.createdAt || new Date().toISOString(),
    sourceId: normalized.sourceId ?? null,
    sourceSlot: normalized.sourceSlot ?? null
  };
}

function normalizeSubject(subject) {
  return {
    ...subject,
    createdAt: subject.createdAt || new Date().toISOString()
  };
}

async function deleteRowsMissingFromSnapshot(table, desiredIds, action) {
  const existingRows = ensureSupabaseSuccess(
    await supabase.from(table).select('id'),
    action
  );
  const staleIds = existingRows
    .map(row => row.id)
    .filter(id => !desiredIds.has(id));

  for (const id of staleIds) {
    ensureSupabaseSuccess(
      await supabase.from(table).delete().eq('id', id),
      action
    );
  }
}

async function readSupabaseDb() {
  const [subjectsResult, questionsResult] = await Promise.all([
    supabase.from('subjects').select('*').order('createdAt', { ascending: true }),
    supabase.from('questions').select('*').order('createdAt', { ascending: true })
  ]);

  const subjects = ensureSupabaseSuccess(subjectsResult, 'Loi doc subjects tu Supabase');
  const questions = ensureSupabaseSuccess(questionsResult, 'Loi doc questions tu Supabase').map(normalizeQuestion);

  return { subjects, questions };
}

async function writeSupabaseDb(data) {
  const subjects = Array.isArray(data.subjects) ? data.subjects.map(normalizeSubject) : [];
  const questions = Array.isArray(data.questions) ? data.questions.map(toSupabaseQuestionPayload) : [];

  if (subjects.length > 0) {
    ensureSupabaseSuccess(
      await supabase.from('subjects').upsert(subjects, { onConflict: 'id' }),
      'Loi ghi subjects len Supabase'
    );
  }

  if (questions.length > 0) {
    ensureSupabaseSuccess(
      await supabase.from('questions').upsert(questions, { onConflict: 'id' }),
      'Loi ghi questions len Supabase'
    );
  }

  await deleteRowsMissingFromSnapshot(
    'questions',
    new Set(questions.map(question => question.id)),
    'Loi dong bo questions tren Supabase'
  );
  await deleteRowsMissingFromSnapshot(
    'subjects',
    new Set(subjects.map(subject => subject.id)),
    'Loi dong bo subjects tren Supabase'
  );
}

export async function readDb() {
  if (isSupabaseEnabled()) {
    return readSupabaseDb();
  }

  return readJsonDb();
}


export async function appendQuestions(questions = []) {
  const newQuestions = Array.isArray(questions) ? questions.map(toSupabaseQuestionPayload) : [];
  if (newQuestions.length === 0) return [];

  if (isSupabaseEnabled()) {
    const result = await supabase
      .from('questions')
      .upsert(newQuestions, { onConflict: 'id' })
      .select('*');
    return ensureSupabaseSuccess(result, 'Loi import questions len Supabase').map(normalizeQuestion);
  }

  const db = await readJsonDb();
  db.questions = [...(Array.isArray(db.questions) ? db.questions : []), ...newQuestions];
  await writeJsonDb(db);
  return newQuestions;
}
export async function writeDb(data) {
  writePromise = writePromise.catch(() => {}).then(async () => {
    if (isSupabaseEnabled()) {
      await writeSupabaseDb(data);
      return;
    }

    await writeJsonDb(data);
  });

  return writePromise;
}
export async function getDbHealth() {
  if (!isSupabaseEnabled()) {
    return {
      storage: 'json',
      connected: false,
      message: 'SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY chua duoc cau hinh, dang dung db.json.'
    };
  }

  const result = await supabase.from('subjects').select('id', { count: 'exact', head: true });
  if (result.error) {
    return {
      storage: 'supabase',
      connected: false,
      message: result.error.message
    };
  }

  return {
    storage: 'supabase',
    connected: true,
    message: 'Da ket noi Supabase thanh cong.'
  };
}


