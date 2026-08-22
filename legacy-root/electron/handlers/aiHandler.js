// electron/handlers/aiHandler.js
// AI streaming handler – routes to provider‑specific services (OpenAI, Anthropic, Gemini, Ollama)
// Actual implementations live in `src/services`.

const { ipcMain } = require('electron');

// Import provider services (they may be lazy‑loaded to avoid unnecessary imports)
let openaiService, anthropicService, geminiService, ollamaService;

function ensureService(provider) {
  switch (provider) {
    case 'openai':
      if (!openaiService) openaiService = require('../../src/services/openaiService.js');
      return openaiService;
    case 'anthropic':
      if (!anthropicService) anthropicService = require('../../src/services/anthropicService.js');
      return anthropicService;
    case 'gemini':
      if (!geminiService) geminiService = require('../../src/services/geminiService.js');
      return geminiService;
    case 'ollama':
      if (!ollamaService) ollamaService = require('../../src/services/ollamaService.js');
      return ollamaService;
    default:
      return null;
  }
}

/**
 * IPC handler for AI streaming.
 * payload example: {
 *   provider: 'openai'|'anthropic'|'gemini'|'ollama',
 *   model: string,
 *   messages: [{role:'user'|'assistant', content:string}],
 *   stream: true
 * }
 */
async function handleAIStream(event, payload) {
  const service = ensureService(payload.provider);
  if (!service) {
    return { error: `Unsupported provider: ${payload.provider}` };
  }
  // Determine the streaming function name (different services export different names)
  const streamFn = service.streamOpenAI || service.stream;
  if (typeof streamFn !== 'function') {
    return { error: `Streaming not supported for provider: ${payload.provider}` };
  }
  try {
    await streamFn(payload, (token) => {
      event.sender.send('ai:token', { token });
    });
    return { success: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}


module.exports = { handleAIStream };
