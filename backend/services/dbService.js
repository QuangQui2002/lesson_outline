import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../data/db.json');

// Biến giữ hàng đợi ghi file tránh ghi đè đồng thời
let writePromise = Promise.resolve();

/**
 * Đọc dữ liệu từ file db.json
 * @returns {Promise<{subjects: Array, questions: Array}>}
 */
export async function readDb() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Nếu file chưa tồn tại hoặc rỗng, trả về cấu trúc rỗng
    console.error('Lỗi đọc database, khởi tạo dữ liệu rỗng:', error.message);
    return { subjects: [], questions: [] };
  }
}

/**
 * Ghi dữ liệu vào file db.json (được xếp hàng đợi ghi để tránh tranh chấp)
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function writeDb(data) {
  writePromise = writePromise.then(async () => {
    try {
      // Đảm bảo thư mục cha tồn tại
      await fs.mkdir(path.dirname(dbPath), { recursive: true });
      await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Lỗi ghi database:', error);
      throw error;
    }
  });
  return writePromise;
}
