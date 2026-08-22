const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const profile = path.join(process.env.APPDATA, 'nexcode');
const outputDir = path.join(__dirname, 'groq-production-smoke');
function decrypt(value) {
  const encoded = value?.encoding === 'safeStorage' ? value.value : value?.encrypted ? value.data : null;
  if (!encoded) return value;
  return JSON.parse(safeStorage.decryptString(Buffer.from(encoded, 'base64')));
}
async function main() {
  app.setPath('userData', profile);
  await app.whenReady();
  const raw = JSON.parse(fs.readFileSync(path.join(profile, 'nexcode-secure.json'), 'utf8'));
  const settings = decrypt(raw.settings) || {};
  const apiKey = settings.apiKeys?.groq;
  if (!apiKey) throw new Error('Groq API key is not configured in the active profile.');
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const prompt = 'Create a tiny Node.js calculator app. Return ONLY valid JSON with keys filename and content. filename must be calculator.mjs. content must be valid ESM JavaScript that defines add(a,b), prints CALC_RESULT=<value> for add(19,23), and exports add. No markdown.';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0, max_completion_tokens: 500, stream: true })
  });
  if (!response.ok) throw new Error(`Groq generation failed with HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try { text += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''; } catch {}
    }
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('Groq returned no JSON app payload.');
  const generated = JSON.parse(text.slice(first, last + 1));
  if (generated.filename !== 'calculator.mjs' || typeof generated.content !== 'string') throw new Error('Groq payload shape invalid.');
  fs.mkdirSync(outputDir, { recursive: true });
  const appPath = path.join(outputDir, generated.filename);
  fs.writeFileSync(appPath, generated.content, 'utf8');
  const run = spawnSync('node', [appPath], { encoding: 'utf8', timeout: 10000 });
  const result = { provider: 'groq', model: 'llama-3.3-70b-versatile', httpStatus: response.status, generatedFile: appPath, fileBytes: Buffer.byteLength(generated.content), executionExitCode: run.status, executionOutput: String(run.stdout || '').trim(), executionError: String(run.stderr || '').trim(), passed: run.status === 0 && /CALC_RESULT=42/.test(run.stdout || '') };
  fs.writeFileSync(path.join(outputDir, 'test-report.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result));
  app.quit();
}
main().catch((error) => { console.error(JSON.stringify({ passed: false, error: error.message })); app.quit(); process.exitCode = 1; });