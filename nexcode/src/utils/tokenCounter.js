export function estimateTokens(text = '') {
  if (!text) {
    return 0;
  }
  const normalized = String(text).trim();
  if (!normalized) {
    return 0;
  }
  return Math.ceil(normalized.length / 4);
}

export const MODEL_CONTEXT_WINDOWS = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'claude-3-5-sonnet-latest': 200000,
  'claude-3-haiku-20240307': 200000,
  'gemini-1.5-pro': 1000000,
  'gemini-1.5-flash': 1000000,
  'llama-3.3-70b-versatile': 131072,
  'llama-3.1-8b-instant': 131072,
  'openai/gpt-oss-120b': 131072,
  'openai/gpt-oss-20b': 131072,
  'qwen/qwen3-32b': 131072,
  'qwen2.5-coder:7b': 8192,
  'deepseek-coder-v2:lite': 8192,
  'llava:7b': 4096,
  'llama3.2:3b': 8192
};

export function getModelContextWindow(modelId = '') {
  return MODEL_CONTEXT_WINDOWS[modelId] || 8192;
}

export function estimateMessageTokens(messages = []) {
  return messages.reduce((total, message) => total + estimateTokens(message.content) + 4, 0);
}

export function trimMessagesToBudget(messages = [], maxTokens = 12000) {
  const kept = [];
  let total = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = estimateTokens(message.content) + 4;
    if (total + cost > maxTokens && kept.length) {
      break;
    }
    total += cost;
    kept.unshift(message);
  }
  return { messages: kept, tokens: total, trimmed: kept.length !== messages.length };
}

export function formatTokens(tokens = 0) {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}K`;
  }
  return String(tokens);
}
