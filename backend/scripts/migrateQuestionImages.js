import 'dotenv/config';
import { isSupabaseEnabled, readDb, updateQuestionById } from '../services/dbService.js';
import {
  cleanupReplacedQuestionImages,
  deleteManagedImages,
  syncQuestionImages
} from '../services/questionImageService.js';

async function main() {
  if (!isSupabaseEnabled()) {
    throw new Error('Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY.');
  }

  const db = await readDb();
  let migratedCount = 0;
  let unchangedCount = 0;
  let warningCount = 0;

  for (const question of db.questions) {
    const imageSync = await syncQuestionImages(question);
    warningCount += imageSync.failures.length;

    const changed = imageSync.question.content !== question.content
      || imageSync.question.answer !== question.answer;
    if (!changed) {
      unchangedCount += 1;
      continue;
    }

    try {
      const updatedQuestion = await updateQuestionById(question.id, {
        content: imageSync.question.content,
        answer: imageSync.question.answer
      });
      if (!updatedQuestion) throw new Error('Khong tim thay cau hoi ' + question.id);
      const cleanupResult = await cleanupReplacedQuestionImages(question, updatedQuestion);
      if (cleanupResult.error) {
        console.warn('[question-images] Khong xoa duoc anh cu cua ' + question.id + ': ' + cleanupResult.error.message);
      }
      migratedCount += 1;
    } catch (error) {
      await deleteManagedImages(imageSync.uploadedPaths);
      throw error;
    }

    if (imageSync.failures.length > 0) {
      console.warn('[question-images] ' + question.id + ': ' + imageSync.failures.map(item => item.message).join('; '));
    }
  }

  console.log(JSON.stringify({
    total: db.questions.length,
    migrated: migratedCount,
    unchanged: unchangedCount,
    warnings: warningCount
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
