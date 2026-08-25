import { app, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const STORE_FILE = 'zezenexcoderr-github.json';

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function encryptedPayload(value) {
  const serialized = JSON.stringify(value ?? '');
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
  } catch {
    return null;
  }
  return null;
}

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(storePath(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(data) {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(data, null, 2), 'utf8');
}

export function parseGitHubRemote(remoteUrl = '') {
  const clean = String(remoteUrl || '').trim();
  if (!clean) return null;

  const ssh = clean.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2].replace(/\.git$/i, '') };
  }

  try {
    const url = new URL(clean);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const [owner, repo] = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/');
    return owner && repo ? { owner, repo } : null;
  } catch {
    return null;
  }
}

export async function saveGitHubToken(token = '') {
  const store = await readStore();
  const clean = String(token || '').trim();
  if (!clean) {
    delete store.token;
  } else {
    store.token = encryptedPayload(clean);
  }
  await writeStore(store);
  return { ok: true, hasToken: Boolean(clean) };
}

export async function loadGitHubToken() {
  const store = await readStore();
  return decryptedPayload(store.token) || '';
}

export async function getGitHubTokenStatus() {
  return { hasToken: Boolean(await loadGitHubToken()) };
}

export async function createGitHubPullRequest(payload = {}) {
  const token = await loadGitHubToken();
  if (!token) {
    return {
      ok: false,
      needsToken: true,
      message: 'GitHub token is required before a pull request can be created.'
    };
  }

  const owner = String(payload.owner || '').trim();
  const repo = String(payload.repo || '').trim();
  const head = String(payload.head || '').trim();
  const base = String(payload.base || 'main').trim();
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();

  if (!owner || !repo || !head || !base || !title) {
    throw new Error('GitHub owner, repo, head, base, and title are required.');
  }

  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: token });
  const response = await octokit.rest.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
    maintainer_can_modify: true
  });

  return {
    ok: true,
    url: response.data.html_url,
    number: response.data.number,
    state: response.data.state
  };
}

export function registerGithubHandlers() {
  ipcMain.handle('github:save-token', async (_event, payload = {}) => saveGitHubToken(payload.token));
  ipcMain.handle('github:token-status', async () => getGitHubTokenStatus());
  ipcMain.handle('github:create-pr', async (_event, payload = {}) => createGitHubPullRequest(payload));
}
