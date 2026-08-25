const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

function normalizeEmbedding(payload = {}) {
  const vector = payload.embedding || payload.embeddings?.[0] || payload.data?.[0]?.embedding || [];
  if (!Array.isArray(vector) || !vector.length) {
    throw new Error('Ollama did not return an embedding vector. Pull nomic-embed-text in Ollama Manager first.');
  }
  return vector.map((value) => Number(value) || 0);
}

export async function generateEmbedding(text = '', options = {}) {
  const input = String(text || '').trim();
  if (!input) {
    throw new Error('Cannot embed empty text.');
  }
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || DEFAULT_EMBED_MODEL,
      prompt: input.slice(0, options.maxChars || 8000)
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Ollama embeddings failed with ${response.status}. Pull ${DEFAULT_EMBED_MODEL} first.`);
  }
  return normalizeEmbedding(await response.json());
}

export async function generateEmbeddings(texts = [], options = {}) {
  const results = [];
  for (const text of texts) {
    if (options.signal?.aborted) throw new Error('Embedding aborted.');
    results.push(await generateEmbedding(text, options));
  }
  return results;
}

export function embeddingModelName() {
  return DEFAULT_EMBED_MODEL;
}
