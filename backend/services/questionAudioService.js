import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { getSupabaseClient, isSupabaseEnabled } from './dbService.js';

const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET || 'question-audio';
const MAX_AUDIO_BYTES = Math.max(1024, Number(process.env.QUESTION_AUDIO_MAX_BYTES || 32 * 1024 * 1024));
const FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.QUESTION_AUDIO_FETCH_TIMEOUT_MS || 30000));
const STRICT_MODE = process.env.QUESTION_AUDIO_STRICT === 'true';
const ALLOWED_HOSTS = String(process.env.QUESTION_AUDIO_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);
const STORAGE_PUBLIC_MARKER = '/storage/v1/object/public/' + AUDIO_BUCKET + '/';
const AUDIO_URL_PATTERN = /https:\/\/[^\s<>'"]+?\.(?:mp3|m4a|aac|ogg|oga|wav|webm)(?:\?[^\s<>'"]*)?/gi;

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
  if (url.protocol !== 'https:') throw new Error('Chỉ hỗ trợ link âm thanh HTTPS.');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('Không cho phép localhost.');
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host))) {
    throw new Error('Host âm thanh không nằm trong danh sách cho phép.');
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.some(item => isPrivateAddress(item.address))) throw new Error('Không cho phép địa chỉ mạng nội bộ.');
  return url;
}

async function fetchRemoteAudio(rawUrl, redirectCount = 0) {
  if (redirectCount > 3) throw new Error('Link âm thanh redirect quá nhiều lần.');
  const url = await validateRemoteUrl(rawUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'lesson-outline-audio-importer/1.0' }
  });
  if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    return fetchRemoteAudio(new URL(response.headers.get('location'), url).toString(), redirectCount + 1);
  }
  if (!response.ok) throw new Error('Tải âm thanh thất bại: HTTP ' + response.status);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
    throw new Error('Link không trả về file âm thanh.');
  }
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error('Âm thanh vượt giới hạn dung lượng.');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_AUDIO_BYTES) throw new Error('Âm thanh vượt giới hạn dung lượng.');
  return { data, contentType: contentType.startsWith('audio/') ? contentType : 'audio/mpeg', url };
}

function getFileExtension(contentType = '', sourceUrl = '') {
  const type = contentType.toLowerCase();
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('aac')) return 'aac';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  if (type.includes('webm')) return 'webm';
  const match = new URL(sourceUrl).pathname.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || 'mp3';
}

function decodeAttribute(value = '') {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractAudioSources(value = '') {
  const text = String(value || '');
  const sources = [];
  text.replace(/<(?:audio|source)\b[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, source) => {
    sources.push(decodeAttribute(source));
    return match;
  });
  text.match(AUDIO_URL_PATTERN)?.forEach(source => sources.push(decodeAttribute(source)));
  return [...new Set(sources.filter(Boolean))];
}

function annotateAudioSource(value = '', source = '') {
  const encodedKey = encodeURIComponent(source);
  return String(value || '').replace(/<audio\b[^>]*>/gi, tag => {
    if (/\sdata-audio-key=["'][^"']*["']/i.test(tag)) return tag;
    const sourceMatch = tag.match(/\ssrc=["']([^"']*)["']/i);
    if (!sourceMatch || decodeAttribute(sourceMatch[1]) !== source) return tag;
    return tag.replace(/^<audio\b/i, '<audio data-audio-key="' + encodedKey + '"');
  });
}

function replaceAudioSource(value = '', source = '', replacement = '') {
  const escapedSource = source.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return String(value || '').split(source).join(replacement).split(escapedSource).join(replacement);
}

export function getManagedAudioPaths(value = '') {
  const paths = [];
  String(value || '').match(/https:\/\/[^\s<>'"]+/gi)?.forEach(rawUrl => {
    try {
      const url = new URL(rawUrl.replace(/[),.;]+$/, ''));
      const markerIndex = url.pathname.indexOf(STORAGE_PUBLIC_MARKER);
      if (markerIndex === -1) return;
      paths.push(decodeURIComponent(url.pathname.slice(markerIndex + STORAGE_PUBLIC_MARKER.length)));
    } catch (error) {}
  });
  return [...new Set(paths)];
}

function getQuestionManagedAudioPaths(question = {}) {
  return [...new Set([
    ...getManagedAudioPaths(question.content),
    ...getManagedAudioPaths(question.answer)
  ])];
}

async function ensureAudioBucket() {
  if (!isSupabaseEnabled()) return false;
  if (bucketPromise) return bucketPromise;
  bucketPromise = (async () => {
    const supabase = getSupabaseClient();
    const current = await supabase.storage.getBucket(AUDIO_BUCKET);
    const options = {
      public: true,
      fileSizeLimit: MAX_AUDIO_BYTES,
      allowedMimeTypes: ['audio/*', 'application/octet-stream']
    };
    if (current.error) {
      const created = await supabase.storage.createBucket(AUDIO_BUCKET, options);
      if (created.error) throw new Error('Lỗi tạo Storage bucket âm thanh: ' + created.error.message);
      return true;
    }
    const updated = await supabase.storage.updateBucket(AUDIO_BUCKET, options);
    if (updated.error) throw new Error('Lỗi cập nhật Storage bucket âm thanh: ' + updated.error.message);
    return true;
  })().catch(error => {
    bucketPromise = null;
    throw error;
  });
  return bucketPromise;
}

async function uploadAudioSource(source, question) {
  const questionFolder = getQuestionFolder(question);
  const managedPaths = getManagedAudioPaths(source);
  if (managedPaths.some(path => path.startsWith(questionFolder + '/'))) return { publicUrl: source, path: null };
  if (managedPaths.length > 0) {
    const sourcePath = managedPaths[0];
    const targetPath = questionFolder + '/' + sourcePath.split('/').pop();
    const storage = getSupabaseClient().storage.from(AUDIO_BUCKET);
    const copied = await storage.copy(sourcePath, targetPath);
    if (copied.error && !isDuplicateStorageError(copied.error)) throw new Error('Lỗi sao chép âm thanh: ' + copied.error.message);
    const publicResult = storage.getPublicUrl(targetPath);
    if (!publicResult.data?.publicUrl) throw new Error('Không tạo được public URL cho âm thanh.');
    return { publicUrl: publicResult.data.publicUrl, path: copied.error ? null : targetPath };
  }

  const audio = await fetchRemoteAudio(source);
  const hash = createHash('sha256').update(audio.data).digest('hex').slice(0, 24);
  const path = questionFolder + '/' + hash + '.' + getFileExtension(audio.contentType, audio.url.toString());
  const storage = getSupabaseClient().storage.from(AUDIO_BUCKET);
  const uploaded = await storage.upload(path, audio.data, {
    contentType: audio.contentType,
    cacheControl: '31536000',
    upsert: false
  });
  const duplicate = isDuplicateStorageError(uploaded.error);
  if (uploaded.error && !duplicate) throw new Error('Lỗi upload âm thanh: ' + uploaded.error.message);
  const publicResult = storage.getPublicUrl(path);
  if (!publicResult.data?.publicUrl) throw new Error('Không tạo được public URL cho âm thanh.');
  return { publicUrl: publicResult.data.publicUrl, path: duplicate ? null : path };
}

export async function syncQuestionAudio(question = {}) {
  if (!isSupabaseEnabled()) return { question, uploadedPaths: [], failures: [] };
  await ensureAudioBucket();
  let content = String(question.content || '');
  let answer = String(question.answer || '');
  const sources = [...new Set([...extractAudioSources(content), ...extractAudioSources(answer)])];
  const uploadedPaths = [];
  const failures = [];

  for (const source of sources) {
    try {
      content = annotateAudioSource(content, source);
      answer = annotateAudioSource(answer, source);
      const uploaded = await uploadAudioSource(source, question);
      content = replaceAudioSource(content, source, uploaded.publicUrl);
      answer = replaceAudioSource(answer, source, uploaded.publicUrl);
      if (uploaded.path) uploadedPaths.push(uploaded.path);
    } catch (error) {
      failures.push({ source: source.slice(0, 300), message: error.message });
      if (STRICT_MODE) {
        await deleteManagedAudio(uploadedPaths);
        throw error;
      }
    }
  }

  return { question: { ...question, content, answer }, uploadedPaths, failures };
}

export async function deleteManagedAudio(paths = []) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!isSupabaseEnabled() || uniquePaths.length === 0) return { deletedCount: 0, error: null };
  await ensureAudioBucket();
  let deletedCount = 0;
  for (let index = 0; index < uniquePaths.length; index += 1000) {
    const batch = uniquePaths.slice(index, index + 1000);
    const result = await getSupabaseClient().storage.from(AUDIO_BUCKET).remove(batch);
    if (result.error) return { deletedCount, error: result.error };
    deletedCount += batch.length;
  }
  return { deletedCount, error: null };
}

async function listManagedFolderFiles(prefix) {
  const files = [];
  const folders = [prefix];
  const storage = getSupabaseClient().storage.from(AUDIO_BUCKET);
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

async function deleteManagedAudioFolder(prefix = '') {
  if (!isSupabaseEnabled() || !prefix) return { deletedCount: 0, error: null };
  await ensureAudioBucket();
  try {
    return deleteManagedAudio(await listManagedFolderFiles(prefix));
  } catch (error) {
    return { deletedCount: 0, error };
  }
}

export function deleteQuestionAudioFolder(question = {}) {
  return deleteManagedAudioFolder(getQuestionFolder(question));
}

export function deleteSubjectAudioFolder(subjectId) {
  return deleteManagedAudioFolder(getSubjectFolder(subjectId));
}

export async function cleanupReplacedQuestionAudio(previousQuestion, nextQuestion) {
  const previousPaths = getQuestionManagedAudioPaths(previousQuestion);
  const nextPaths = new Set(getQuestionManagedAudioPaths(nextQuestion));
  return deleteManagedAudio(previousPaths.filter(path => !nextPaths.has(path)));
}
