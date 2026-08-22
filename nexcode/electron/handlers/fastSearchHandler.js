import { app, safeStorage, BrowserWindow, ipcMain } from 'electron';
import fsSync from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = 'nexcode-serpapi-config.json';

function storePath() {
  const dir = app.getPath('userData');
  fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, CONFIG_FILE);
}

function encryptedPayload(value) {
  const serialized = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: 'safeStorage',
      value: safeStorage.encryptString(serialized).toString('base64')
    };
  }
  return {
    encoding: 'base64',
    value: Buffer.from(serialized, 'utf8').toString('base64')
  };
}

function decryptedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  try {
    if (payload.encoding === 'safeStorage') {
      return JSON.parse(safeStorage.decryptString(Buffer.from(payload.value, 'base64')));
    }
    if (payload.encoding === 'base64') {
      return JSON.parse(Buffer.from(payload.value, 'base64').toString('utf8'));
    }
    return payload;
  } catch {
    return null;
  }
}

export function getSerpApiKey() {
  try {
    const filePath = storePath();
    if (!fsSync.existsSync(filePath)) {
      return process.env.SERPAPI_API_KEY || '';
    }
    const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
    const data = decryptedPayload(raw);
    return data?.apiKey || process.env.SERPAPI_API_KEY || '';
  } catch {
    return process.env.SERPAPI_API_KEY || '';
  }
}

export function saveSerpApiKey(apiKey) {
  const filePath = storePath();
  const encrypted = encryptedPayload({ apiKey: String(apiKey || '').trim() });
  fsSync.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf8');
  return { ok: true };
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function formatResultsToMarkdown(data = {}, query = '') {
  const sections = [];
  sections.push(`### Fast Web Search Results for: "${query}"\n`);

  // Answer Box
  if (data.answer_box) {
    const box = data.answer_box;
    const title = box.title || box.type || 'Quick Answer';
    const answer = box.answer || box.snippet || box.result || '';
    if (answer) {
      sections.push(`**[Answer Box: ${title}]**\n${answer}\n`);
    }
  }

  // Organic Results (Top 5 minified)
  if (Array.isArray(data.organic_results) && data.organic_results.length > 0) {
    sections.push(`**Top Search Results:**`);
    data.organic_results.slice(0, 5).forEach((item, idx) => {
      const title = item.title || 'No Title';
      const link = item.link || '';
      const snippet = item.snippet || item.snippet_highlighted_words?.join(', ') || '';
      sections.push(`${idx + 1}. [${title}](${link})\n   ${snippet}`);
    });
  }

  // Related Questions
  if (Array.isArray(data.related_questions) && data.related_questions.length > 0) {
    sections.push(`\n**Related Developer Questions:**`);
    data.related_questions.slice(0, 3).forEach((item) => {
      const q = item.question || '';
      const s = item.snippet || '';
      if (q) {
        sections.push(`- **Q: ${q}**\n  ${s}`);
      }
    });
  }

  if (sections.length <= 1) {
    return `No fast web search results found for query: "${query}".`;
  }

  return sections.join('\n');
}

export async function executeFastSearch(query = '') {
  const apiKey = getSerpApiKey();
  const startTime = Date.now();

  if (!query || !query.trim()) {
    throw new Error('Search query cannot be empty.');
  }

  if (!apiKey) {
    throw new Error('SerpApi Key is missing. Configure your SerpApi Key in Settings > Fast Search Integration.');
  }

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query.trim())}&api_key=${apiKey}&engine=google&num=6`;

  sendToAll('fast-search:status', { status: 'searching', query, startTime });

  const response = await fetch(url, { headers: { 'User-Agent': 'NexCode-FastSearch/2.0' } });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = `SerpApi HTTP ${response.status}: ${text || response.statusText}`;
    sendToAll('fast-search:status', { status: 'error', query, error: err, elapsedMs: Date.now() - startTime });
    throw new Error(err);
  }

  const data = await response.json();
  const markdown = formatResultsToMarkdown(data, query);
  const elapsedMs = Date.now() - startTime;

  sendToAll('fast-search:status', {
    status: 'success',
    query,
    elapsedMs,
    resultsCount: data.organic_results?.length || 0
  });

  return {
    ok: true,
    query,
    elapsedMs,
    markdown
  };
}

export function registerFastSearchHandlers() {
  ipcMain.handle('serpapi:get-key', async () => ({ apiKey: getSerpApiKey() }));
  ipcMain.handle('serpapi:save-key', async (_evt, key) => saveSerpApiKey(key));
  ipcMain.handle('fast-search:execute', async (_evt, query) => executeFastSearch(query));
}
