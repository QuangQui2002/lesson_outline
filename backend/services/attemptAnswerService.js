import { readDb } from './dbService.js';

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value = '') {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToLines(value = '') {
  return decodeEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeQuestion(question = {}, index = 0) {
  const answers = Array.isArray(question.answertext) ? question.answertext : [];
  return {
    id: question.id || null,
    slot: question.slot || index + 1,
    type: question.type || '',
    questionHtml: String(question.questiontext || question.content || '').trim(),
    questiontext: stripHtml(question.questiontext || question.content || ''),
    answers: answers.map((answer, answerIndex) => ({
      id: answer.id || null,
      label: String.fromCharCode(65 + answerIndex),
      text: stripHtml(answer.answer || answer.text || '')
    })).filter(answer => answer.text)
  };
}

function buildPrompt(questions = []) {
  const questionText = questions.map(question => {
    const answers = question.answers.map(answer => `${answer.label}. ${answer.text}`).join('\n');
    return `Cau ${question.slot} (id: ${question.id || 'N/A'}): ${question.questiontext}\n${answers}`;
  }).join('\n\n');

  return `Ban la tro ly hoc tap. Hay tra loi cac cau hoi trac nghiem sau bang tieng Viet.\n` +
    `Chi tra ve JSON hop le, khong markdown, khong chu ngoai JSON.\n` +
    `Tra loi that ngan de JSON khong bi cat. Khong dung dau phay cuoi mang/object.\n` +
    `Cau truc bat buoc: {"answers":[{"slot":1,"questionId":123,"answerLabel":"A","confidence":0.8,"explanation":"ngan gon"}]}\n` +
    `Giu nguyen slot va questionId dung nhu de bai da gui, khong danh so lai tu 1.\n` +
    `Khong can tra answerText. Khong can tra answerId. Neu khong chac, van chon dap an hop ly nhat.\n\n${questionText}`;
}

function normalizeStoredQuestionForCompare(content = '') {
  return String(content || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^\s*cau\s*\d+\s*[:.\-\)]?/i, '')
    .replace(/\b\d+\s*\/\s*\d+\s*(diem|point|points)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  const currentRow = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    currentRow[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      currentRow[j] = Math.min(insertCost, deleteCost, replaceCost);
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }
  return previousRow[b.length];
}

function calculateSimilarity(contentA, contentB) {
  const normalizedA = normalizeStoredQuestionForCompare(contentA);
  const normalizedB = normalizeStoredQuestionForCompare(contentB);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  return 1 - levenshteinDistance(normalizedA, normalizedB) / maxLength;
}

function getQuestionCompareText(question = {}) {
  return stripHtml(question.questiontext || '');
}

function extractStoredQuestionText(content = '') {
  const lines = htmlToLines(content || '');
  const questionLines = [];
  for (const line of lines) {
    if (/^[A-Z]\s*[\.)]\s+/i.test(line)) break;
    if (/^(Đáp án đúng là|Dap an dung la)\s*:/i.test(line)) break;
    if (/^Vì\s*:/i.test(line)) break;
    if (/^Vi\s*:/i.test(line)) break;
    if (/^Tham khảo\s*:/i.test(line)) break;
    if (/^Tham khao\s*:/i.test(line)) break;
    questionLines.push(line);
  }
  return (questionLines.join(' ') || stripHtml(content)).trim();
}

function extractStoredCorrectAnswer(answerText = '') {
  const cleanAnswer = stripHtml(answerText || '');
  const match = cleanAnswer.match(/(?:Đáp án đúng là|Dap an dung la)\s*:\s*([^\n]+)/i);
  return (match?.[1] || cleanAnswer.split('\n')[0] || '').trim();
}

function findMatchingOption(question = {}, correctAnswerText = '') {
  const cleanCorrect = stripHtml(correctAnswerText || '').trim();
  if (!cleanCorrect) return null;
  const normalizedCorrect = normalizeStoredQuestionForCompare(cleanCorrect);
  return question.answers?.find(option => {
    const normalizedOption = normalizeStoredQuestionForCompare(option.text);
    return normalizedOption && (
      normalizedOption === normalizedCorrect ||
      normalizedCorrect.includes(normalizedOption) ||
      normalizedOption.includes(normalizedCorrect)
    );
  }) || null;
}

function findStoredAnswer(question = {}, storedQuestions = []) {
  const questionCompareText = getQuestionCompareText(question);
  let bestMatch = null;
  for (const storedQuestion of storedQuestions) {
    const storedQuestionText = extractStoredQuestionText(storedQuestion.content || '');
    const similarity = calculateSimilarity(questionCompareText, storedQuestionText);
    if (similarity >= 0.86 && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { storedQuestion, similarity, storedQuestionText };
    }
  }
  if (!bestMatch) return null;

  const correctAnswerText = extractStoredCorrectAnswer(bestMatch.storedQuestion.answer || '');
  const matchedOption = findMatchingOption(question, correctAnswerText);
  return {
    slot: question.slot,
    questionId: question.id,
    questionText: question.questiontext,
    questionHtml: question.questionHtml || '',
    source: 'database',
    answerLabel: matchedOption?.label || '',
    answerId: matchedOption?.id || null,
    answerText: matchedOption?.text || correctAnswerText,
    confidence: Number(bestMatch.similarity.toFixed(2)),
    explanation: 'Tìm thấy câu hỏi trùng trong ngân hàng câu hỏi theo nội dung câu hỏi.'
  };
}

async function findStoredAnswers(questions = []) {
  const db = await readDb();
  const storedQuestions = Array.isArray(db.questions) ? db.questions : [];
  const matchedAnswers = [];
  const unansweredQuestions = [];
  for (const question of questions) {
    const storedAnswer = findStoredAnswer(question, storedQuestions);
    if (storedAnswer) matchedAnswers.push(storedAnswer);
    else unansweredQuestions.push(question);
  }
  return { matchedAnswers, unansweredQuestions };
}

function getGeminiModels() {
  const models = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  return models.split(',').map(model => model.trim()).filter(Boolean);
}

function getGeminiTimeoutMs() {
  const timeout = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 60000;
}

function getGeminiMaxOutputTokens() {
  const maxTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
  return Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 4096;
}

function getConfiguredProviders() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) return [];
  return getGeminiModels().map(model => ({ name: 'Gemini', model, apiKey }));
}

function removeTrailingCommas(value = '') {
  return String(value || '').replace(/,\s*([}\]])/g, '$1');
}

function extractJsonObject(text = '') {
  const cleanText = String(text || '').replace(/```json|```/gi, '').trim();
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('AI không trả về JSON hợp lệ. Nội dung nhận được: ' + cleanText.slice(0, 500));
  }
  const candidate = cleanText.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    try {
      return JSON.parse(removeTrailingCommas(candidate));
    } catch (repairError) {
      throw new Error('AI không trả về JSON hợp lệ. Nội dung nhận được: ' + cleanText.slice(0, 500));
    }
  }
}

function normalizeAiAnswers(rawAnswers = [], questions = []) {
  const bySlot = new Map(questions.map(question => [Number(question.slot), question]));
  const byId = new Map(questions.filter(question => question.id !== null).map(question => [String(question.id), question]));

  return rawAnswers.map((answer, index) => {
    const answerSlot = Number(answer.slot || 0);
    const questionById = answer.questionId !== undefined && answer.questionId !== null ? byId.get(String(answer.questionId)) : null;
    const questionBySlot = answerSlot ? bySlot.get(answerSlot) : null;
    const question = questionById || questionBySlot || questions[index] || {};
    const matchedAnswer = question.answers?.find(option =>
      String(option.id) === String(answer.answerId || '') ||
      String(option.label).toLowerCase() === String(answer.answerLabel || '').toLowerCase() ||
      option.text === answer.answerText
    );

    return {
      slot: question.slot || answerSlot || index + 1,
      questionId: question.id || answer.questionId || null,
      questionText: question.questiontext || '',
      questionHtml: question.questionHtml || '',
      source: 'ai',
      answerLabel: answer.answerLabel || matchedAnswer?.label || '',
      answerId: answer.answerId || matchedAnswer?.id || null,
      answerText: answer.answerText || matchedAnswer?.text || '',
      confidence: Number(answer.confidence) || null,
      explanation: String(answer.explanation || '').trim()
    };
  });
}

async function callGemini(provider, prompt) {
  const controller = new AbortController();
  const timeoutMs = getGeminiTimeoutMs();
  const timeoutId = setTimeout(() => controller.abort('Gemini quá thời gian phản hồi'), timeoutMs);
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          maxOutputTokens: getGeminiMaxOutputTokens()
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(provider.name + ' (' + provider.model + ') không phản hồi sau ' + timeoutMs + 'ms: ' + (error.message || 'timeout'));
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${provider.name} API lỗi ${response.status}: ${JSON.stringify(data)}`);
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
}

async function callAiProvider(provider, prompt) {
  return callGemini(provider, prompt);
}

export async function solveAttemptQuestions(payload = {}) {
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions.map(normalizeQuestion).filter(question => question.questiontext && question.answers.length > 0);
  if (questions.length === 0) throw new Error('Không có câu hỏi trắc nghiệm hợp lệ để AI trả lời.');

  const { matchedAnswers, unansweredQuestions } = await findStoredAnswers(questions);
  let aiAnswers = [];
  let usedProvider = null;

  if (unansweredQuestions.length > 0) {
    const providers = getConfiguredProviders();
    if (providers.length === 0) {
      if (matchedAnswers.length > 0) {
        return {
          totalQuestions: questions.length,
          databaseCount: matchedAnswers.length,
          aiCount: 0,
          provider: '',
          model: '',
          answers: matchedAnswers.sort((a, b) => Number(a.slot) - Number(b.slot))
        };
      }
      throw new Error('Backend chưa cấu hình GEMINI_API_KEY. Hãy thêm Gemini API key vào file .env.');
    }

    const prompt = buildPrompt(unansweredQuestions);
    const errors = [];
    let parsed = null;
    for (const provider of providers) {
      try {
        const text = await callAiProvider(provider, prompt);
        parsed = extractJsonObject(text);
        usedProvider = provider;
        break;
      } catch (error) {
        errors.push(`${provider.name} (${provider.model}): ${error.message}`);
      }
    }

    if (!parsed) {
      if (matchedAnswers.length > 0) {
        return {
          totalQuestions: questions.length,
          databaseCount: matchedAnswers.length,
          aiCount: 0,
          provider: '',
          model: '',
          aiError: `AI lỗi với ${unansweredQuestions.length} câu chưa có trong hệ thống. ${errors.join(' | ')}`,
          answers: matchedAnswers.sort((a, b) => Number(a.slot) - Number(b.slot))
        };
      }
      throw new Error(`Tất cả model AI đều lỗi. ${errors.join(' | ')}`);
    }
    aiAnswers = normalizeAiAnswers(Array.isArray(parsed.answers) ? parsed.answers : [], unansweredQuestions);
  }

  const answers = [...matchedAnswers, ...aiAnswers].sort((a, b) => Number(a.slot) - Number(b.slot));
  return {
    totalQuestions: questions.length,
    databaseCount: matchedAnswers.length,
    aiCount: aiAnswers.length,
    provider: usedProvider?.name || '',
    model: usedProvider?.model || '',
    answers
  };
}



