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

function isSupabaseEnabled() {
  return Boolean(supabase);
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

function ensureSupabaseSuccess(result, action) {
  if (result.error) {
    throw new Error(`${action}: ${result.error.message}`);
  }
  return result.data;
}

async function readSupabaseDb() {
  const [subjectsResult, questionsResult] = await Promise.all([
    supabase.from('subjects').select('*').order('createdAt', { ascending: true }),
    supabase.from('questions').select('*').order('createdAt', { ascending: true })
  ]);

  const subjects = ensureSupabaseSuccess(subjectsResult, 'Loi doc subjects tu Supabase');
  const questions = ensureSupabaseSuccess(questionsResult, 'Loi doc questions tu Supabase');

  return { subjects, questions };
}

async function writeSupabaseDb(data) {
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const questions = Array.isArray(data.questions) ? data.questions : [];

  ensureSupabaseSuccess(
    await supabase.from('questions').delete().not('id', 'is', null),
    'Loi xoa questions tren Supabase'
  );
  ensureSupabaseSuccess(
    await supabase.from('subjects').delete().not('id', 'is', null),
    'Loi xoa subjects tren Supabase'
  );

  if (subjects.length > 0) {
    ensureSupabaseSuccess(
      await supabase.from('subjects').insert(subjects),
      'Loi ghi subjects len Supabase'
    );
  }

  if (questions.length > 0) {
    ensureSupabaseSuccess(
      await supabase.from('questions').insert(questions),
      'Loi ghi questions len Supabase'
    );
  }
}

export async function readDb() {
  if (isSupabaseEnabled()) {
    return readSupabaseDb();
  }

  return readJsonDb();
}

export async function writeDb(data) {
  writePromise = writePromise.then(async () => {
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