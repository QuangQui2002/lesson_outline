// Giới hạn độ dài khi so sánh để Levenshtein (O(n*m)) không bị lợi dụng làm treo CPU.
const MAX_COMPARE_CHARS = Math.max(500, Number(process.env.MAX_COMPARE_CHARS || 4000));

export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  let currentRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertCost, deleteCost, replaceCost);
    }
    const completedRow = previousRow;
    previousRow = currentRow;
    currentRow = completedRow;
  }

  return previousRow[b.length];
}

function truncateForCompare(value = '') {
  return value.length > MAX_COMPARE_CHARS ? value.slice(0, MAX_COMPARE_CHARS) : value;
}

/**
 * Cận trên của similarityRatio: khoảng cách Levenshtein luôn >= chênh lệch độ dài,
 * nên có thể bỏ qua cặp chuỗi mà không cần tính Levenshtein.
 */
export function similarityUpperBound(a = '', b = '') {
  const first = truncateForCompare(a);
  const second = truncateForCompare(b);
  const maxLength = Math.max(first.length, second.length);
  if (maxLength === 0) return 0;
  return Math.min(first.length, second.length) / maxLength;
}

export function similarityRatio(a = '', b = '') {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const first = truncateForCompare(a);
  const second = truncateForCompare(b);
  const maxLength = Math.max(first.length, second.length);
  return 1 - levenshteinDistance(first, second) / maxLength;
}
