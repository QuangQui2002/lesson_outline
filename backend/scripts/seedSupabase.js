import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/db.json');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function ensureSuccess(result, action) {
  if (result.error) {
    throw new Error(`${action}: ${result.error.message}`);
  }
  return result.data;
}

function normalizeSubject(subject) {
  return {
    ...subject,
    createdAt: subject.createdAt || new Date().toISOString()
  };
}

async function main() {
  const rawData = await fs.readFile(dbPath, 'utf8');
  const db = JSON.parse(rawData);
  const subjects = Array.isArray(db.subjects) ? db.subjects.map(normalizeSubject) : [];
  const questions = Array.isArray(db.questions) ? db.questions : [];

  ensureSuccess(
    await supabase.from('questions').delete().not('id', 'is', null),
    'Loi xoa questions cu'
  );
  ensureSuccess(
    await supabase.from('subjects').delete().not('id', 'is', null),
    'Loi xoa subjects cu'
  );

  if (subjects.length > 0) {
    ensureSuccess(await supabase.from('subjects').insert(subjects), 'Loi import subjects');
  }

  if (questions.length > 0) {
    ensureSuccess(await supabase.from('questions').insert(questions), 'Loi import questions');
  }

  console.log(`Da import ${subjects.length} subjects va ${questions.length} questions len Supabase.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
