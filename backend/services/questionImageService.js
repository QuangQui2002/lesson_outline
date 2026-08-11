import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getSupabaseClient, isSupabaseEnabled } from './dbService.js';

const IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || 'question-images';
const MAX_IMAGE_BYTES = Math.max(1024, Number(process.env.QUESTION_IMAGE_MAX_BYTES || 8 * 1024 * 1024));
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.QUESTION_IMAGE_FETCH_TIMEOUT_MS || 15000));
const STRICT_MODE = process.env.QUESTION_IMAGE_STRICT === 'true';
const ALLOWED_HOSTS = String(process.env.QUESTION_IMAGE_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);
const STORAGE_PUBLIC_MARKER = '/storage/v1/object/public/' + IMAGE_BUCKET + '/';

let bucketPromise = null;

function safePathPart(value = '') {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function getQuestionFolder({ subjectId, questionId, id } = {}) {
  return ['subjects', safePathPart(subjectId), 'questions', safePathPart(questionId || id)].join('/');
}

function getSubjectFolder(subjectId) {
  return ['subjects', safePathPart(subjectId)].join('/');
}

function isDuplicateStorageError(error) {
  return Boolean(error) && (
    Number(error.statusCode || error.status) === 409
    || /already exists|duplicate/i.test(error.message || '')
  );
}

function isPrivateAddress(address = '') {
  if (net.isIPv4(address)) {
    const [first, second] = address.split('.').map(Number);
    return first === 10
      || first === 127
      || first === 0
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

async function validateRemoteUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Chi ho tro link anh HTTPS.');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('Khong cho phep localhost.');
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host))) {
    throw new Error('Host anh khong nam trong danh sach cho phep.');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.some(item => isPrivateAddress(item.address))) throw new Error('Khong cho phep dia chi mang noi bo.');
  return url;
}

async function fetchRemoteImage(rawUrl, redirectCount = 0) {
  if (redirectCount > 3) throw new Error('Link anh redirect qua nhieu lan.');
  const url = await validateRemoteUrl(rawUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'lesson-outline-image-importer/1.0' }
  });
  if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    return fetchRemoteImage(new URL(response.headers.get('location'), url).toString(), redirectCount + 1);
  }
  if (!response.ok) throw new Error('Tai anh that bai: HTTP ' + response.status);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('Link khong tra ve file anh.');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error('Anh vuot qua gioi han dung luong.');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES) throw new Error('Anh vuot qua gioi han dung luong.');
  return { data, contentType };
}

function parseDataImage(source) {
  const match = String(source).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) throw new Error('Data URL anh khong hop le.');
  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES) throw new Error('Anh vuot qua gioi han dung luong.');
  return { data, contentType: match[1].toLowerCase() };
}

function getFileExtension(contentType = '') {
  const type = contentType.toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webp')) return 'webp';
  if (type.includes('svg')) return 'svg';
  if (type.includes('bmp')) return 'bmp';
  return 'img';
}

function extractImageSources(value = '') {
  const text = String(value || '');
  const sources = [];
  text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, source) => {
    sources.push(source);
    return match;
  });
  const pattern = /(?:data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+|https:\/\/[^\s<>'"]+?\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\s<>'"]*)?)/gi;
  text.match(pattern)?.forEach(source => sources.push(source));
  return [...new Set(sources.filter(Boolean))];
}

export function getManagedImagePaths(value = '') {
  const paths = [];
  const urlPattern = /https:\/\/[^\s<>'"]+/gi;
  String(value || '').match(urlPattern)?.forEach(rawUrl => {
    try {
      const url = new URL(rawUrl.replace(/[),.;]+$/, ''));
      const markerIndex = url.pathname.indexOf(STORAGE_PUBLIC_MARKER);
      if (markerIndex === -1) return;
      paths.push(decodeURIComponent(url.pathname.slice(markerIndex + STORAGE_PUBLIC_MARKER.length)));
    } catch (error) {}
  });
  return [...new Set(paths)];
}

export function getQuestionManagedImagePaths(question = {}) {
  return [...new Set([
    ...getManagedImagePaths(question.content),
    ...getManagedImagePaths(question.answer)
  ])];
}

async function ensureImageBucket() {
  if (!isSupabaseEnabled()) return false;
  if (bucketPromise) return bucketPromise;
  bucketPromise = (async () => {
    const supabase = getSupabaseClient();
    const current = await supabase.storage.getBucket(IMAGE_BUCKET);
    if (current.error) {
      const created = await supabase.storage.createBucket(IMAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: ['image/*']
      });
      if (created.error) throw new Error('Loi tao Storage bucket: ' + created.error.message);
      return true;
    }
    const updated = await supabase.storage.updateBucket(IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ['image/*']
    });
    if (updated.error) throw new Error('Loi cap nhat Storage bucket: ' + updated.error.message);
    return true;
  })().catch(error => {
    bucketPromise = null;
    throw error;
  });
  return bucketPromise;
}

async function uploadImageSource(source, { subjectId, questionId, id }) {
  const questionFolder = getQuestionFolder({ subjectId, questionId, id });
  const managedPaths = getManagedImagePaths(source);
  if (managedPaths.some(path => path.startsWith(questionFolder + '/'))) {
    return { publicUrl: source, path: null };
  }
  if (managedPaths.length > 0) {
    const sourcePath = managedPaths[0];
    const targetPath = questionFolder + '/' + sourcePath.split('/').pop();
    const storage = getSupabaseClient().storage.from(IMAGE_BUCKET);
    const copied = await storage.copy(sourcePath, targetPath);
    if (copied.error && !isDuplicateStorageError(copied.error)) {
      throw new Error('Loi di chuyen anh: ' + copied.error.message);
    }
    const publicResult = storage.getPublicUrl(targetPath);
    if (!publicResult.data?.publicUrl) throw new Error('Khong tao duoc public URL cho anh.');
    return { publicUrl: publicResult.data.publicUrl, path: copied.error ? null : targetPath };
  }
  const image = source.startsWith('data:image/') ? parseDataImage(source) : await fetchRemoteImage(source);
  const hash = createHash('sha256').update(image.data).digest('hex').slice(0, 24);
  const path = questionFolder + '/' + hash + '.' + getFileExtension(image.contentType);
  const supabase = getSupabaseClient();
  const uploaded = await supabase.storage.from(IMAGE_BUCKET).upload(path, image.data, {
    contentType: image.contentType,
    cacheControl: '31536000',
    upsert: false
  });
  const duplicate = isDuplicateStorageError(uploaded.error);
  if (uploaded.error && !duplicate) throw new Error('Loi upload anh: ' + uploaded.error.message);
  const publicResult = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  if (!publicResult.data?.publicUrl) throw new Error('Khong tao duoc public URL cho anh.');
  return { publicUrl: publicResult.data.publicUrl, path: duplicate ? null : path };
}

export async function syncQuestionImages(question = {}) {
  if (!isSupabaseEnabled()) return { question, uploadedPaths: [], failures: [] };
  await ensureImageBucket();
  let content = String(question.content || '');
  let answer = String(question.answer || '');
  const sources = [...new Set([...extractImageSources(content), ...extractImageSources(answer)])];
  const uploadedPaths = [];
  const failures = [];

  for (const source of sources) {
    try {
      const uploaded = await uploadImageSource(source, question);
      content = content.split(source).join(uploaded.publicUrl);
      answer = answer.split(source).join(uploaded.publicUrl);
      if (uploaded.path) uploadedPaths.push(uploaded.path);
    } catch (error) {
      failures.push({ source: source.slice(0, 300), message: error.message });
      if (STRICT_MODE || source.startsWith('data:image/')) {
        await deleteManagedImages(uploadedPaths);
        throw error;
      }
    }
  }

  return {
    question: { ...question, content, answer },
    uploadedPaths,
    failures
  };
}

export async function deleteManagedImages(paths = []) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!isSupabaseEnabled() || uniquePaths.length === 0) return { deletedCount: 0, error: null };
  await ensureImageBucket();
  let deletedCount = 0;
  for (let index = 0; index < uniquePaths.length; index += 1000) {
    const batch = uniquePaths.slice(index, index + 1000);
    const result = await getSupabaseClient().storage.from(IMAGE_BUCKET).remove(batch);
    if (result.error) return { deletedCount, error: result.error };
    deletedCount += batch.length;
  }
  return { deletedCount, error: null };
}

async function listManagedFolderFiles(prefix) {
  const files = [];
  const folders = [prefix];
  const storage = getSupabaseClient().storage.from(IMAGE_BUCKET);

  while (folders.length > 0) {
    const folder = folders.pop();
    for (let offset = 0; ; offset += 1000) {
      const result = await storage.list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (result.error) throw result.error;
      const entries = result.data || [];
      for (const entry of entries) {
        const entryPath = folder + '/' + entry.name;
        if (entry.id) files.push(entryPath);
        else folders.push(entryPath);
      }
      if (entries.length < 1000) break;
    }
  }

  return files;
}

export async function deleteManagedImageFolder(prefix = '') {
  if (!isSupabaseEnabled() || !prefix) return { deletedCount: 0, error: null };
  await ensureImageBucket();
  try {
    return deleteManagedImages(await listManagedFolderFiles(prefix));
  } catch (error) {
    return { deletedCount: 0, error };
  }
}

export function deleteQuestionImageFolder(question = {}) {
  return deleteManagedImageFolder(getQuestionFolder(question));
}

export function deleteSubjectImageFolder(subjectId) {
  return deleteManagedImageFolder(getSubjectFolder(subjectId));
}

export async function cleanupReplacedQuestionImages(previousQuestion, nextQuestion) {
  const previousPaths = getQuestionManagedImagePaths(previousQuestion);
  const nextPaths = new Set(getQuestionManagedImagePaths(nextQuestion));
  return deleteManagedImages(previousPaths.filter(path => !nextPaths.has(path)));
}

export function getQuestionImageStorageConfig() {
  return {
    enabled: isSupabaseEnabled(),
    bucket: IMAGE_BUCKET,
    maxImageBytes: MAX_IMAGE_BYTES,
    strictMode: STRICT_MODE
  };
}
