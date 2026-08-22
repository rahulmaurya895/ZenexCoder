import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STORE_NAME = 'nexcode-environments.json';
let cache = null;
let runtimeCache = null;

function now() {
  return Date.now();
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function defaultData() {
  return { environments: {}, active: {} };
}

function storePath() {
  const dir = app.getPath('userData');
  fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, STORE_NAME);
}

function fallbackKey() {
  return crypto
    .createHash('sha256')
    .update(`nexcode-env:${app.getPath('userData')}:${os.userInfo().username}:${process.env.COMPUTERNAME || os.hostname()}`)
    .digest();
}

function encryptJson(value) {
  const serialized = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: 'safeStorage',
      value: safeStorage.encryptString(serialized).toString('base64')
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fallbackKey(), iv);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  return {
    encoding: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    value: encrypted.toString('base64')
  };
}

function decryptJson(payload) {
  if (!payload || typeof payload !== 'object') return defaultData();
  try {
    if (payload.encoding === 'safeStorage') {
      return JSON.parse(safeStorage.decryptString(Buffer.from(payload.value, 'base64')));
    }
    if (payload.encoding === 'aes-256-gcm') {
      const decipher = crypto.createDecipheriv('aes-256-gcm', fallbackKey(), Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.value, 'base64')), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8'));
    }
  } catch {
    return defaultData();
  }
  return defaultData();
}

function loadData() {
  if (cache) return cache;
  try {
    cache = decryptJson(JSON.parse(fsSync.readFileSync(storePath(), 'utf8')));
  } catch {
    cache = defaultData();
  }
  cache.environments ||= {};
  cache.active ||= {};
  return cache;
}

function saveData() {
  fsSync.writeFileSync(storePath(), JSON.stringify(encryptJson(loadData()), null, 2), 'utf8');
}

function projectKey(projectPath) {
  return projectPath ? path.resolve(projectPath) : '';
}

function defaultRuntimeConfig() {
  return {
    node: { mode: 'system' },
    python: { mode: 'system' },
    go: { mode: 'system' },
    java: { mode: 'system' },
    ruby: { mode: 'system' },
    rust: { mode: 'system' },
    custom: []
  };
}

function envType(type = 'custom') {
  return ['development', 'staging', 'production', 'custom'].includes(type) ? type : 'custom';
}

function isValidEnvKey(key = '') {
  return /^[A-Z_][A-Z0-9_]*$/.test(String(key || '').trim());
}

function normalizeVar(item = {}) {
  return {
    id: item.id || crypto.randomUUID(),
    key: String(item.key || '').trim(),
    value: String(item.value || ''),
    masked: Boolean(item.masked),
    source: item.source || 'manual',
    enabled: item.enabled !== false
  };
}

function normalizeEnv(env = {}) {
  return {
    id: env.id || crypto.randomUUID(),
    name: env.name || 'development',
    type: envType(env.type || 'development'),
    isActive: Boolean(env.isActive),
    vars: (env.vars || []).map(normalizeVar),
    runtimeConfig: { ...defaultRuntimeConfig(), ...(env.runtimeConfig || {}) },
    createdAt: env.createdAt || now(),
    updatedAt: env.updatedAt || now()
  };
}

function envsFor(projectPath) {
  const key = projectKey(projectPath);
  const data = loadData();
  data.environments[key] = (data.environments[key] || []).map(normalizeEnv);
  const activeId = data.active[key] || data.environments[key].find((env) => env.isActive)?.id || null;
  data.environments[key] = data.environments[key].map((env) => ({ ...env, isActive: Boolean(activeId && env.id === activeId) }));
  return data.environments[key];
}

function activeEnvFor(projectPath) {
  const key = projectKey(projectPath);
  const activeId = loadData().active[key];
  return envsFor(key).find((env) => (activeId ? env.id === activeId : env.isActive)) || null;
}

function setProjectEnvs(projectPath, environments) {
  const key = projectKey(projectPath);
  loadData().environments[key] = environments.map(normalizeEnv);
}

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, ...options });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs || 2500);
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { stdout, stderr } : { stdout, stderr, failed: true });
    });
  });
}

async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dirPath, entry.name));
  } catch {
    return [];
  }
}

async function detectSystem(command, args, parse = (text) => text.trim()) {
  const result = await run(command, args);
  if (!result) return null;
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return text ? parse(text) : null;
}

function parseJsonArray(stdout = '', key = 'envs') {
  try {
    const parsed = JSON.parse(stdout || '{}');
    return Array.isArray(parsed?.[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
}

async function detectRuntimes(projectPath = '', { force = false } = {}) {
  if (runtimeCache && !force) return runtimeCache;
  const nvmDir = process.env.NVM_DIR || process.env.NVM_HOME || '';
  const sdkmanDir = process.env.SDKMAN_DIR || '';
  const project = projectPath ? path.resolve(projectPath) : '';
  const [nodeSystem, pythonSystem, python3System, goSystem, javaSystem, rubySystem, rustSystem] = await Promise.all([
    detectSystem('node', ['--version']),
    detectSystem('python', ['--version']),
    detectSystem('python3', ['--version']),
    detectSystem('go', ['version']),
    detectSystem('java', ['-version'], (text) => text.split(/\r?\n/)[0]),
    detectSystem('ruby', ['--version']),
    detectSystem('rustc', ['--version'])
  ]);

  const [fnm, conda, pyenv, rbenv, rvm] = await Promise.all([
    run('fnm', ['list']),
    run('conda', ['env', 'list', '--json']),
    run('pyenv', ['versions']),
    run('rbenv', ['versions']),
    run('rvm', ['list'])
  ]);

  const nvmVersions = (await listDirs(path.join(nvmDir, 'versions', 'node'))).map((item) => ({
    version: path.basename(item),
    path: process.platform === 'win32' ? path.join(item, 'node.exe') : path.join(item, 'bin', 'node')
  }));
  const sdkmanJava = (await listDirs(path.join(sdkmanDir, 'candidates', 'java'))).map((item) => ({
    version: path.basename(item),
    path: process.platform === 'win32' ? path.join(item, 'bin', 'java.exe') : path.join(item, 'bin', 'java')
  }));
  const venvs = [];
  for (const name of ['.venv', 'venv', 'env']) {
    const candidate = project ? path.join(project, name) : '';
    if (candidate && fsSync.existsSync(path.join(candidate, 'pyvenv.cfg'))) {
      venvs.push(candidate);
    }
  }

  runtimeCache = {
    node: {
      ...(nodeSystem ? { system: nodeSystem } : {}),
      ...(nvmVersions.length ? { nvm: nvmVersions } : {}),
      ...(fnm?.stdout ? { fnm: fnm.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) } : {})
    },
    python: {
      ...(pythonSystem ? { system: pythonSystem } : {}),
      ...(python3System ? { python3: python3System } : {}),
      ...(conda?.stdout ? { conda: parseJsonArray(conda.stdout, 'envs') } : {}),
      ...(pyenv?.stdout ? { pyenv: pyenv.stdout.split(/\r?\n/).map((line) => line.replace('*', '').trim()).filter(Boolean) } : {}),
      ...(venvs.length ? { venvs } : {})
    },
    go: { ...(goSystem ? { system: goSystem } : {}) },
    java: { ...(javaSystem ? { system: javaSystem } : {}), ...(sdkmanJava.length ? { sdkman: sdkmanJava } : {}) },
    ruby: {
      ...(rubySystem ? { system: rubySystem } : {}),
      ...(rbenv?.stdout ? { rbenv: rbenv.stdout.split(/\r?\n/).map((line) => line.replace('*', '').trim()).filter(Boolean) } : {}),
      ...(rvm?.stdout ? { rvm: rvm.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) } : {})
    },
    rust: { ...(rustSystem ? { system: rustSystem } : {}) }
  };
  return runtimeCache;
}

function pathEnvKey(env) {
  if (process.platform !== 'win32') return 'PATH';
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
}

function prependToPath(env, binaryPath) {
  if (!binaryPath) return;
  const dir = path.dirname(binaryPath);
  const key = pathEnvKey(env);
  const delimiter = process.platform === 'win32' ? ';' : ':';
  env[key] = `${dir}${delimiter}${env[key] || ''}`;
}

function pythonFromVenv(venvPath = '') {
  return process.platform === 'win32' ? path.join(venvPath, 'Scripts', 'python.exe') : path.join(venvPath, 'bin', 'python');
}

function applyRuntimeConfig(env, runtimeConfig = defaultRuntimeConfig()) {
  ['node', 'go', 'java', 'ruby', 'rust'].forEach((runtime) => {
    const config = runtimeConfig[runtime] || {};
    if (config.mode && config.mode !== 'system' && config.resolvedPath) {
      prependToPath(env, config.resolvedPath);
    }
  });
  const python = runtimeConfig.python || {};
  if (python.mode && python.mode !== 'system') {
    const resolvedPath = python.resolvedPath || (python.venvPath ? pythonFromVenv(python.venvPath) : '');
    if (resolvedPath) prependToPath(env, resolvedPath);
    if (python.venvPath) env.VIRTUAL_ENV = python.venvPath;
    if (python.mode === 'conda' && python.venvPath) env.CONDA_PREFIX = python.venvPath;
  }
  (runtimeConfig.custom || []).forEach((item) => {
    if (item.path) {
      prependToPath(env, item.path);
      if (item.envKey) env[item.envKey] = item.path;
    }
  });
}

export function envList(projectPath) {
  return envsFor(projectPath);
}

export function envCreate(projectPath, payload = {}) {
  const key = projectKey(projectPath);
  const existing = envsFor(key);
  const source = existing.find((env) => env.id === payload.copyFromId);
  const first = existing.length === 0;
  const env = normalizeEnv({
    id: crypto.randomUUID(),
    name: payload.name || 'development',
    type: payload.type || 'development',
    isActive: first,
    vars: source ? source.vars.map((item) => ({ ...item, id: crypto.randomUUID() })) : [],
    runtimeConfig: source ? JSON.parse(JSON.stringify(source.runtimeConfig)) : defaultRuntimeConfig(),
    createdAt: now(),
    updatedAt: now()
  });
  const next = [...existing.map((item) => ({ ...item, isActive: first ? false : item.isActive })), env];
  setProjectEnvs(key, next);
  if (first) loadData().active[key] = env.id;
  saveData();
  if (first) sendToAll('env:active-changed', { projectPath: key, envId: env.id, envName: env.name });
  return env;
}

export function envUpdate(projectPath, envId, patch = {}) {
  const key = projectKey(projectPath);
  const next = envsFor(key).map((env) => {
    if (env.id !== envId) return env;
    return normalizeEnv({
      ...env,
      ...patch,
      type: patch.type ? envType(patch.type) : env.type,
      vars: patch.vars ? patch.vars.map(normalizeVar) : env.vars,
      runtimeConfig: patch.runtimeConfig ? { ...defaultRuntimeConfig(), ...patch.runtimeConfig } : env.runtimeConfig,
      updatedAt: now()
    });
  });
  setProjectEnvs(key, next);
  saveData();
  return next.find((env) => env.id === envId) || null;
}

export function envDelete(projectPath, envId) {
  const key = projectKey(projectPath);
  if (loadData().active[key] === envId || envsFor(key).find((env) => env.id === envId)?.isActive) {
    return { error: 'cannot_delete_active' };
  }
  setProjectEnvs(key, envsFor(key).filter((env) => env.id !== envId));
  saveData();
  return { ok: true };
}

export function envActivate(projectPath, envId) {
  const key = projectKey(projectPath);
  const existing = envsFor(key);
  const target = existing.find((env) => env.id === envId);
  if (!target) throw new Error('Environment not found.');
  const next = existing.map((env) => ({ ...env, isActive: env.id === envId, updatedAt: env.id === envId ? now() : env.updatedAt }));
  setProjectEnvs(key, next);
  loadData().active[key] = envId;
  saveData();
  sendToAll('env:active-changed', { projectPath: key, envId, envName: target.name });
  return next.find((env) => env.id === envId);
}

export function envGetActiveVars(projectPath, { includeMasked = true } = {}) {
  const active = activeEnvFor(projectPath);
  if (!active) return {};
  return Object.fromEntries(
    active.vars
      .filter((item) => item.enabled !== false && (includeMasked || !item.masked) && isValidEnvKey(item.key))
      .map((item) => [item.key, item.value])
  );
}

export function envPromptContext(projectPath) {
  const active = activeEnvFor(projectPath);
  if (!active) return '';
  const lines = active.vars
    .filter((item) => item.enabled !== false && isValidEnvKey(item.key))
    .map((item) => `${item.key}=${item.masked ? '<masked>' : item.value}`);
  return `## Active Environment: ${active.name}\nThe following environment variables are set:\n${lines.join('\n') || '(none)'}`;
}

export async function buildProjectEnvironment(projectPath, extraEnv = {}) {
  const env = { ...process.env, ...envGetActiveVars(projectPath), ...extraEnv };
  applyRuntimeConfig(env, activeEnvFor(projectPath)?.runtimeConfig || defaultRuntimeConfig());
  return env;
}

async function resolveRuntimePath(runtime, config = {}) {
  let resolvedPath = config.resolvedPath || '';
  if (runtime === 'python' && !resolvedPath && config.venvPath) {
    resolvedPath = pythonFromVenv(config.venvPath);
  }
  if (!resolvedPath) return { resolvedPath: '' };
  await fs.access(resolvedPath, fsSync.constants.R_OK);
  return { resolvedPath };
}

export function registerEnvironmentHandlers() {
  ipcMain.handle('env:list', async (_event, payload = {}) => envList(payload.projectPath));
  ipcMain.handle('env:create', async (_event, payload = {}) => envCreate(payload.projectPath, payload));
  ipcMain.handle('env:update', async (_event, payload = {}) => envUpdate(payload.projectPath, payload.envId, payload.patch));
  ipcMain.handle('env:delete', async (_event, payload = {}) => envDelete(payload.projectPath, payload.envId));
  ipcMain.handle('env:activate', async (_event, payload = {}) => envActivate(payload.projectPath, payload.envId));
  ipcMain.handle('env:get-active-vars', async (_event, payload = {}) => envGetActiveVars(payload.projectPath, { includeMasked: false }));
  ipcMain.handle('env:read-dot-file', async (_event, payload = {}) => fs.readFile(payload.filePath, 'utf8'));
  ipcMain.handle('env:write-dot-file', async (_event, payload = {}) => {
    await fs.mkdir(path.dirname(payload.filePath), { recursive: true });
    await fs.writeFile(payload.filePath, payload.content || '', 'utf8');
    return { ok: true, filePath: payload.filePath };
  });
  ipcMain.handle('runtime:detect', async (_event, payload = {}) => detectRuntimes(payload.projectPath, { force: payload.force }));
  ipcMain.handle('runtime:resolve', async (_event, payload = {}) => resolveRuntimePath(payload.runtime, payload.config));
}
