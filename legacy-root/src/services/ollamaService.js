// src/services/ollamaService.js
// Simple streaming wrapper for Ollama via its HTTP API (default localhost:11434).

import fetch from 'node-fetch';

/**
 * Streams a chat completion from Ollama.
 * @param {object} payload { model:string, messages:Array<{role:string, content:string}> }
 * @param {function} onToken Callback invoked with each token fragment.
 */
export async function stream(payload, onToken) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.message && obj.message.content) {
          onToken(obj.message.content);
        }
      } catch (_) {
        // ignore malformed lines
      }
    }
  }
}
