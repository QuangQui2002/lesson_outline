function stripHtml(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestion(question = {}, index = 0) {
  const answers = Array.isArray(question.answertext) ? question.answertext : [];
  return {
    id: question.id || null,
    slot: question.slot || index + 1,
    type: question.type || '',
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
    return `Câu ${question.slot} (id: ${question.id || 'N/A'}): ${question.questiontext}\n${answers}`;
  }).join('\n\n');

  return `Bạn là trợ lý học tập. Hãy trả lời các câu hỏi trắc nghiệm sau bằng tiếng Việt.\n` +
    `Chỉ trả về JSON hợp lệ, không markdown, theo cấu trúc:\n` +
    `{"answers":[{"slot":1,"questionId":123,"answerLabel":"A","answerId":456,"answerText":"...","confidence":0.8,"explanation":"..."}]}\n` +
    `Nếu không chắc, vẫn chọn đáp án hợp lý nhất và giải thích ngắn.\n\n${questionText}`;
}

function parseModelList(value, fallback) {
  return String(value || fallback || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
}

function getConfiguredProviders() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  return parseModelList(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL, 'gemini-2.0-flash').map(model => ({
    name: 'Gemini',
    type: 'gemini',
    apiKey,
    model
  }));
}

function getGeminiTimeoutMs() {
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000;
}

function getGeminiMaxOutputTokens() {
  const maxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
  return Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 4096;
}

function extractJsonObject(text = '') {
  const cleanText = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleanText); } catch (error) {}
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return JSON.parse(cleanText.slice(start, end + 1));
  throw new Error('AI không trả về JSON hợp lệ.');
}

function normalizeAiAnswers(rawAnswers = [], questions = []) {
  const bySlot = new Map(questions.map(question => [Number(question.slot), question]));
  return rawAnswers.map((answer, index) => {
    const slot = Number(answer.slot || index + 1);
    const question = bySlot.get(slot) || questions[index] || {};
    const matchedAnswer = question.answers?.find(option => {
      return String(option.id) === String(answer.answerId || '')
        || String(option.label).toLowerCase() === String(answer.answerLabel || '').toLowerCase()
        || option.text === answer.answerText;
    });

    return {
      slot,
      questionId: answer.questionId || question.id || null,
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
    throw new Error(`${provider.name} (${provider.model}) không phản hồi sau ${timeoutMs}ms: ${error.message || 'timeout'}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${provider.name} API lỗi ${response.status}: ${JSON.stringify(data)}`);
  }

  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
}
async function callAiProvider(provider, prompt) {
  return callGemini(provider, prompt);
}

export async function solveAttemptQuestions(payload = {}) {
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions.map(normalizeQuestion).filter(question => question.questiontext && question.answers.length > 0);
  if (questions.length === 0) throw new Error('Không có câu hỏi trắc nghiệm hợp lệ để AI trả lời.');

  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    throw new Error('Backend chưa cấu hình GEMINI_API_KEY. Hãy thêm Gemini API key vào file .env.');
  }

  const prompt = buildPrompt(questions);
  const errors = [];
  let parsed = null;
  let usedProvider = null;

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
    throw new Error(`Tất cả model AI đều lỗi. ${errors.join(' | ')}`);
  }

  const answers = normalizeAiAnswers(Array.isArray(parsed.answers) ? parsed.answers : [], questions);

  return {
    totalQuestions: questions.length,
    provider: usedProvider?.name || '',
    model: usedProvider?.model || '',
    answers
  };
}


