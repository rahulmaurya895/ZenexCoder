import { app, safeStorage, BrowserWindow, ipcMain } from 'electron';
import fsSync from 'node:fs';
import path from 'node:path';

const PROFILE_FILE = 'nexcode-shadow-style-profile.json';

function storePath() {
  const dir = app.getPath('userData');
  fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, PROFILE_FILE);
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

export function getStyleProfile() {
  try {
    const filePath = storePath();
    if (!fsSync.existsSync(filePath)) {
      return defaultStyleProfile();
    }
    const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
    return decryptedPayload(raw) || defaultStyleProfile();
  } catch {
    return defaultStyleProfile();
  }
}

export function saveStyleProfile(profile) {
  const filePath = storePath();
  const encrypted = encryptedPayload(profile);
  fsSync.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf8');
  return { ok: true };
}

function defaultStyleProfile() {
  return {
    indentStyle: '2 spaces',
    quoteStyle: 'single',
    namingConvention: 'camelCase',
    commentStyle: 'jsdoc',
    indexedRepos: [],
    lastTrainedAt: null,
    heuristics: {
      singleQuoteRatio: 0.85,
      spacesRatio: 0.9,
      camelCaseRatio: 0.8,
      jsdocRatio: 0.7
    }
  };
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function parseStyleHeuristicsFromCode(codeSnippet = '') {
  let singleQuotes = (codeSnippet.match(/'[^'\\]*(?:\\.[^'\\]*)*'/g) || []).length;
  let doubleQuotes = (codeSnippet.match(/"[^"\\]*(?:\\.[^"\\]*)*"/g) || []).length;
  
  let spacesIndent = (codeSnippet.match(/^[ ]{2,4}[^\s*]/gm) || []).length;
  let tabsIndent = (codeSnippet.match(/^\t+[^\s*]/gm) || []).length;
  
  let camelCases = (codeSnippet.match(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  let snakeCases = (codeSnippet.match(/\b[a-z]+_[a-z0-9_]+\b/g) || []).length;

  return { singleQuotes, doubleQuotes, spacesIndent, tabsIndent, camelCases, snakeCases };
}

export async function trainShadowAI(selectedRepos = [], githubToken = '') {
  const startTime = Date.now();
  sendToAll('shadow-ai:status', { status: 'training_started', repos: selectedRepos });

  let aggregate = {
    singleQuotes: 0,
    doubleQuotes: 0,
    spacesIndent: 0,
    tabsIndent: 0,
    camelCases: 0,
    snakeCases: 0,
    filesAnalyzed: 0
  };

  const headers = { 'User-Agent': 'NexCode-ShadowAI/2.0' };
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  for (const repoFullName of selectedRepos) {
    try {
      sendToAll('shadow-ai:status', { status: 'analyzing_repo', repo: repoFullName });

      // Fetch latest commits
      const commitsUrl = `https://api.github.com/repos/${repoFullName}/commits?per_page=10`;
      const res = await fetch(commitsUrl, { headers });
      if (!res.ok) continue;

      const commits = await res.json();
      for (const commitItem of commits.slice(0, 5)) {
        const detailUrl = commitItem.url;
        const detailRes = await fetch(detailUrl, { headers });
        if (!detailRes.ok) continue;

        const detail = await detailRes.json();
        const files = detail.files || [];

        for (const f of files.slice(0, 5)) {
          if (f.patch && (f.filename.endsWith('.js') || f.filename.endsWith('.jsx') || f.filename.endsWith('.ts') || f.filename.endsWith('.py'))) {
            const h = parseStyleHeuristicsFromCode(f.patch);
            aggregate.singleQuotes += h.singleQuotes;
            aggregate.doubleQuotes += h.doubleQuotes;
            aggregate.spacesIndent += h.spacesIndent;
            aggregate.tabsIndent += h.tabsIndent;
            aggregate.camelCases += h.camelCases;
            aggregate.snakeCases += h.snakeCases;
            aggregate.filesAnalyzed += 1;
          }
        }
      }
    } catch (err) {
      console.warn(`[ShadowAI] Skipped repo ${repoFullName}:`, err.message);
    }
  }

  const profile = {
    indentStyle: aggregate.spacesIndent >= aggregate.tabsIndent ? '2 spaces' : 'tabs',
    quoteStyle: aggregate.singleQuotes >= aggregate.doubleQuotes ? 'single' : 'double',
    namingConvention: aggregate.camelCases >= aggregate.snakeCases ? 'camelCase' : 'snake_case',
    commentStyle: 'clean inline & JSDoc',
    indexedRepos: selectedRepos,
    lastTrainedAt: new Date().toISOString(),
    heuristics: {
      filesAnalyzed: aggregate.filesAnalyzed,
      singleQuoteRatio: aggregate.singleQuotes / Math.max(1, aggregate.singleQuotes + aggregate.doubleQuotes),
      spacesRatio: aggregate.spacesIndent / Math.max(1, aggregate.spacesIndent + aggregate.tabsIndent),
      camelCaseRatio: aggregate.camelCases / Math.max(1, aggregate.camelCases + aggregate.snakeCases)
    }
  };

  saveStyleProfile(profile);

  sendToAll('shadow-ai:status', {
    status: 'training_completed',
    profile,
    elapsedMs: Date.now() - startTime
  });

  return { ok: true, profile };
}

export function buildStylePromptPrefix(profile = getStyleProfile()) {
  return [
    `[HYPER-PERSONALIZED SHADOW AI STYLE DIRECTIVE]`,
    `Strictly follow the user's historical coding conventions extracted from GitHub analysis:`,
    `- Indentation: Use ${profile.indentStyle || '2 spaces'}.`,
    `- Quote Style: Use ${profile.quoteStyle === 'double' ? 'double quotes (")' : "single quotes (')"} for string literals.`,
    `- Variable & Function Naming: Use ${profile.namingConvention || 'camelCase'}.`,
    `- Commenting Style: ${profile.commentStyle || 'JSDoc / Clean inline'}.`,
    `Generate output code that seamlessly matches the active file without deviating from these heuristics.`
  ].join('\n');
}

export function registerShadowAIHandlers() {
  ipcMain.handle('shadow-ai:get-profile', async () => getStyleProfile());
  ipcMain.handle('shadow-ai:save-profile', async (_evt, profile) => saveStyleProfile(profile));
  ipcMain.handle('shadow-ai:train', async (_evt, { repos, token }) => trainShadowAI(repos, token));
}
