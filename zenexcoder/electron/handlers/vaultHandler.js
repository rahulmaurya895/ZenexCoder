import { app, ipcMain, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { decryptJson, encryptJson, randomBase64 } from '../../src/utils/encryption.js';
import { listLearnedRules } from './learningHandler.js';

const KEY_STORE_FILE = 'zezenexcoderr-vault-keys.json';

function hash(value = '') {
  return crypto.createHash('sha256').update(String(value || 'global')).digest('hex');
}

function vaultRoot(projectPath = '') {
  return projectPath ? path.join(projectPath, '.zezenexcoderr') : path.join(app.getPath('userData'), 'shared-vault');
}

function vaultConfigPath(projectPath = '') {
  return path.join(vaultRoot(projectPath), 'vault-config.json');
}

function vaultFilePath(projectPath = '') {
  return path.join(vaultRoot(projectPath), 'shared_knowledge.enc');
}

function keyStorePath() {
  return path.join(app.getPath('userData'), KEY_STORE_FILE);
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function protectedPayload(secret) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Electron safeStorage is not available. Vault key was not saved.');
  }
  return {
    encoding: 'safeStorage',
    value: safeStorage.encryptString(secret).toString('base64'),
    updatedAt: Date.now()
  };
}

function unprotectPayload(payload) {
  if (!payload?.value || payload.encoding !== 'safeStorage') return '';
  return safeStorage.decryptString(Buffer.from(payload.value, 'base64'));
}

async function loadKeyStore() {
  return readJson(keyStorePath(), {});
}

async function saveKeyStore(store) {
  await writeJson(keyStorePath(), store);
}

async function ensureConfig(projectPath = '') {
  const filePath = vaultConfigPath(projectPath);
  const existing = await readJson(filePath, null);
  if (existing?.salt) return existing;
  const config = {
    version: 1,
    projectId: hash(projectPath || app.getPath('userData')),
    salt: randomBase64(16),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await writeJson(filePath, config);
  return config;
}

async function loadSecret(projectPath = '') {
  const config = await ensureConfig(projectPath);
  const keyStore = await loadKeyStore();
  const payload = keyStore[config.projectId];
  if (!payload) return '';
  return unprotectPayload(payload);
}

export async function setVaultSecret({ projectPath = '', secret = '' } = {}) {
  const cleanSecret = String(secret || '').trim();
  if (cleanSecret.length < 10) {
    throw new Error('Vault secret must be at least 10 characters.');
  }
  const config = await ensureConfig(projectPath);
  const store = await loadKeyStore();
  store[config.projectId] = protectedPayload(cleanSecret);
  await saveKeyStore(store);
  return getVaultStatus({ projectPath });
}

export async function ensureVaultSecret({ projectPath = '' } = {}) {
  const config = await ensureConfig(projectPath);
  const existing = await loadSecret(projectPath);
  if (existing) return existing;
  const generated = randomBase64(32);
  const store = await loadKeyStore();
  store[config.projectId] = protectedPayload(generated);
  await saveKeyStore(store);
  return generated;
}

export async function encryptRuleDelta(rule, { projectPath = '' } = {}) {
  const config = await ensureConfig(projectPath);
  const secret = await ensureVaultSecret({ projectPath });
  return encryptJson(
    {
      schema: 'zezenexcoderr.shared-rule.v1',
      rule,
      exportedAt: Date.now()
    },
    secret,
    config.salt
  );
}

export async function decryptRuleDelta(envelope, { projectPath = '' } = {}) {
  const secret = await loadSecret(projectPath);
  if (!secret) {
    throw new Error('Vault secret missing. Set the same team vault secret on this machine.');
  }
  return decryptJson(envelope, secret);
}

export async function writeSharedVault({ projectPath = '', rules = null } = {}) {
  const config = await ensureConfig(projectPath);
  const secret = await ensureVaultSecret({ projectPath });
  const activeRules = rules || listLearnedRules({ includeMuted: true, includeDeleted: false });
  const envelope = await encryptJson(
    {
      schema: 'zezenexcoderr.shared-knowledge.v1',
      rules: activeRules,
      exportedAt: Date.now()
    },
    secret,
    config.salt
  );
  const filePath = vaultFilePath(projectPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  return { ok: true, filePath, count: activeRules.length };
}

export async function readSharedVault({ projectPath = '' } = {}) {
  const filePath = vaultFilePath(projectPath);
  const envelope = await readJson(filePath, null);
  if (!envelope) return { rules: [], filePath, exists: false };
  const secret = await loadSecret(projectPath);
  if (!secret) {
    throw new Error('Vault secret missing. Set the same team vault secret on this machine.');
  }
  const payload = await decryptJson(envelope, secret);
  return { ...payload, filePath, exists: true };
}

export async function getVaultStatus({ projectPath = '' } = {}) {
  const config = await ensureConfig(projectPath);
  const hasSecret = Boolean(await loadSecret(projectPath).catch(() => ''));
  const filePath = vaultFilePath(projectPath);
  const exists = fsSync.existsSync(filePath);
  return {
    ok: hasSecret,
    projectId: config.projectId,
    hasSecret,
    safeStorage: safeStorage.isEncryptionAvailable(),
    vaultPath: filePath,
    exists,
    updatedAt: Date.now()
  };
}

export function registerVaultHandlers() {
  ipcMain.handle('vault:status', async (_event, payload = {}) => getVaultStatus(payload));
  ipcMain.handle('vault:set-secret', async (_event, payload = {}) => setVaultSecret(payload));
  ipcMain.handle('vault:export', async (_event, payload = {}) => writeSharedVault(payload));
  ipcMain.handle('vault:read', async (_event, payload = {}) => readSharedVault(payload));
}
