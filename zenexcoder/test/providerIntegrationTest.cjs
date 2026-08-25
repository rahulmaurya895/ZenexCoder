const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const profileDirectories = [
  path.join(process.env.APPDATA, 'zezenexcoderr'),
  path.join(process.env.APPDATA, 'ZenexCoder-TestProfile')
];
const userDataDir = profileDirectories[0];

function decryptValue(value) {
  if (!value || typeof value !== 'object') return value;
  const encoded = value.encoding === 'safeStorage' ? value.value : value.encrypted ? value.data : null;
  if (!encoded) return value;
  const text = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  return JSON.parse(text);
}

async function consume(response) {
  if (!response.body) return 0;
  const reader = response.body.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return bytes;
    bytes += value?.byteLength || 0;
  }
}

async function testGroq(apiKey) {
  if (!apiKey) return { configured: false };
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const validation = await fetch('https://api.groq.com/openai/v1/models', { headers });
  if (!validation.ok) return { configured: true, validated: false, stream: false, status: validation.status };
  const stream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Reply exactly with OK.' }],
      max_completion_tokens: 16,
      temperature: 0,
      stream: true
    })
  });
  return { configured: true, validated: true, stream: stream.ok, bytes: stream.ok ? await consume(stream) : 0, status: stream.status };
}

async function testGemini(apiKey, modelId) {
  if (!apiKey) return { configured: false, modelId };
  const validation = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!validation.ok) return { configured: true, validated: false, stream: false, modelId, status: validation.status };
  const stream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply exactly with OK.' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 }
    })
  });
  return { configured: true, validated: true, stream: stream.ok, bytes: stream.ok ? await consume(stream) : 0, modelId, status: stream.status };
}

app.setPath('userData', userDataDir);
app.whenReady().then(async () => {
  try {
    let settings = {};
    for (const profileDirectory of profileDirectories) {
      const settingsPath = path.join(profileDirectory, 'zezenexcoderr-secure.json');
      if (!fs.existsSync(settingsPath)) continue;
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const candidate = decryptValue(raw.settings) || {};
      if (candidate.apiKeys?.groq || candidate.apiKeys?.google) {
        settings = candidate;
        break;
      }
    }
    const apiKeys = settings.apiKeys || {};
    const geminiModel = settings.defaultModels?.chat?.provider === 'google'
      ? settings.defaultModels.chat.modelId
      : 'gemini-2.0-flash';
    const result = {
      groq: await testGroq(apiKeys.groq),
      google: await testGemini(apiKeys.google, geminiModel)
    };
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ testError: error.message }));
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});