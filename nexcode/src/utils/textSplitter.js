const DEFAULT_CHUNK_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

function normalizeText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ');
}

function hardSplit(text, maxChars) {
  const chunks = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

function splitBySeparators(text, maxChars, separators = ['\n\n', '\n', '. ', ' ']) {
  if (text.length <= maxChars) return [text];
  const [separator, ...rest] = separators;
  if (!separator) return hardSplit(text, maxChars);

  const parts = text.split(separator);
  if (parts.length === 1) {
    return splitBySeparators(text, maxChars, rest);
  }

  const chunks = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}${separator}${part}` : part;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = '';
    }
    if (part.length > maxChars) {
      chunks.push(...splitBySeparators(part, maxChars, rest));
    } else {
      current = part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function splitText(text = '', options = {}) {
  const normalized = normalizeText(text);
  if (!normalized.trim()) return [];

  const chunkTokens = options.chunkTokens || DEFAULT_CHUNK_TOKENS;
  const overlapTokens = options.overlapTokens || DEFAULT_OVERLAP_TOKENS;
  const maxChars = chunkTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const baseChunks = splitBySeparators(normalized, maxChars).map((chunk) => chunk.trim()).filter(Boolean);

  return baseChunks.map((chunk, index) => {
    const previous = index > 0 ? baseChunks[index - 1].slice(-overlapChars) : '';
    const content = previous ? `${previous}\n${chunk}`.trim() : chunk;
    return {
      index,
      content,
      tokenEstimate: Math.ceil(content.length / CHARS_PER_TOKEN)
    };
  });
}
