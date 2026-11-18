import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';

function ipv4FromMappedIpv6(address) {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function isPrivateAddress(rawAddress = '') {
  let address = String(rawAddress || '').toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  address = ipv4FromMappedIpv6(address) || address;

  if (net.isIPv4(address)) {
    const [first, second] = address.split('.').map(Number);
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || first >= 224;
  }
  if (net.isIPv6(address)) {
    return address.startsWith('::')
      || /^f[cd]/.test(address)
      || /^fe[89ab]/.test(address)
      || address.startsWith('ff')
      || address.startsWith('64:ff9b:')
      || address.startsWith('2001:db8:');
  }
  return true;
}

function createPrivateAddressError() {
  return Object.assign(new Error('Không cho phép địa chỉ mạng nội bộ.'), { code: 'EPRIVATEADDR' });
}

// Kiểm tra IP ngay lúc kết nối để tránh DNS rebinding (kiểm tra xong rồi resolve lại ra IP khác).
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [];
    if (list.length === 0) return callback(new Error('Không phân giải được tên miền: ' + hostname));
    if (list.some(item => isPrivateAddress(item.address))) return callback(createPrivateAddressError());
    if (options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function validateUrl(rawUrl, allowedHosts = []) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Chỉ hỗ trợ link HTTPS.');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('Không cho phép localhost.');
  if (allowedHosts.length > 0 && !allowedHosts.some(host => hostname === host || hostname.endsWith('.' + host))) {
    throw new Error('Host không nằm trong danh sách cho phép.');
  }
  if (net.isIP(hostname) && isPrivateAddress(hostname)) throw createPrivateAddressError();
  return url;
}

function requestOnce(url, { maxBytes, timeoutMs, userAgent, isAllowedContentType }) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: safeLookup,
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs)
    }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        resolve({ redirectTo: response.headers.location });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error('Tải file thất bại: HTTP ' + status));
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (isAllowedContentType && !isAllowedContentType(contentType)) {
        response.resume();
        reject(new Error('Link không trả về đúng loại file (' + (contentType || 'không rõ') + ').'));
        return;
      }
      if (Number(response.headers['content-length'] || 0) > maxBytes) {
        response.resume();
        reject(new Error('File vượt quá giới hạn dung lượng.'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          request.destroy(new Error('File vượt quá giới hạn dung lượng.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ data: Buffer.concat(chunks), contentType }));
      response.on('error', reject);
    });
    request.on('error', error => {
      if (error.name === 'AbortError') reject(new Error('Quá thời gian tải file sau ' + timeoutMs + 'ms.'));
      else reject(error);
    });
  });
}

/**
 * Tải file từ URL HTTPS công khai: chặn IP nội bộ (kể cả qua redirect/DNS rebinding)
 * và dừng ngay khi dữ liệu vượt maxBytes thay vì đọc hết vào bộ nhớ.
 */
export async function safeFetchBuffer(rawUrl, {
  maxBytes,
  timeoutMs = 15000,
  allowedHosts = [],
  userAgent = 'lesson-outline-importer/1.0',
  maxRedirects = 3,
  isAllowedContentType
} = {}) {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const url = validateUrl(currentUrl, allowedHosts);
    const result = await requestOnce(url, { maxBytes, timeoutMs, userAgent, isAllowedContentType });
    if (!result.redirectTo) return { ...result, url };
    currentUrl = new URL(result.redirectTo, url).toString();
  }
  throw new Error('Link redirect quá nhiều lần.');
}
