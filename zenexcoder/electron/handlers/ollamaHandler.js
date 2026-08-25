import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import https from 'node:https';
import {
  ClusterOffloadError,
  isClusterOllamaEnabled,
  streamOllamaChatViaCluster,
  streamOllamaGenerateViaCluster
} from './websocketClient.js';

import { isHybridOffloaded, getHybridTunnelHost, stopSshTunnel } from './oracleCloudHandler.js';

const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const pullControllers = new Map();
const installControllers = new Map();
let managedOllamaProcess = null;

function normalizeHost(host = DEFAULT_OLLAMA_HOST) {
  const value = String(host || DEFAULT_OLLAMA_HOST).trim().replace(/\/+$/, '');
  if (!value) {
    return DEFAULT_OLLAMA_HOST;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `http://${value}`;
}

export function getOllamaHost() {
  if (isHybridOffloaded()) {
    return getHybridTunnelHost();
  }
  return normalizeHost(process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST);
}

function isLocalHost(host) {
  try {
    const hostname = new URL(normalizeHost(host)).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

export const RECOMMENDED_MODELS = [
  {
    name: 'Qwen 2.5 Coder 1.5B (4-bit)',
    id: 'qwen2.5-coder:1.5b',
    size: '980 MB',
    ram: '1.5 GB',
    badge: '8GB OPTIMIZED',
    strength: 'Ultra-lightweight fast coding model for 8GB RAM PCs',
    command: 'ollama pull qwen2.5-coder:1.5b'
  },
  {
    name: 'Llama 3.2 1B (4-bit)',
    id: 'llama3.2:1b',
    size: '1.3 GB',
    ram: '2.0 GB',
    badge: 'LIGHTWEIGHT',
    strength: 'Ultra-fast general responses on low RAM hardware',
    command: 'ollama pull llama3.2:1b'
  },
  {
    name: 'Qwen 2.5 Coder 7B',
    id: 'qwen2.5-coder:7b',
    size: '4.7 GB',
    ram: '6 GB',
    badge: 'RECOMMENDED',
    strength: 'Best coding model for 16GB+ RAM - Python, JS, Go, Rust',
    command: 'ollama pull qwen2.5-coder:7b'
  },
  {
    name: 'LLaVA 7B',
    id: 'llava:7b',
    size: '4.7 GB',
    ram: '6 GB',
    badge: 'VISION',
    strength: 'Analyze images, screenshots, diagrams locally',
    command: 'ollama pull llava:7b'
  }
];

function emit(event, channel, requestId, payload) {
  event.sender.send(`${channel}:${requestId}`, payload);
}

function execute(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function findOllamaBinary() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'),
      'ollama.exe'
    );
  } else {
    candidates.push('/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/usr/bin/ollama', 'ollama');
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.includes(path.sep)) {
      try {
        await fsp.access(candidate, fs.constants.X_OK);
        return candidate;
      } catch {}
    } else {
      const check = process.platform === 'win32' ? await execute('where', [candidate]) : await execute('which', [candidate]);
      if (!check.error && check.stdout.trim()) {
        return check.stdout.trim().split(/\r?\n/)[0];
      }
    }
  }
  return null;
}

async function ollamaFetch(endpoint, options = {}) {
  let targetHost = getOllamaHost();
  try {
    const response = await fetch(`${targetHost}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama ${endpoint} failed (${response.status}): ${text || response.statusText}`);
    }
    return response;
  } catch (error) {
    // Graceful Fallback: If remote SSH offload host fails, stop tunnel and retry local host instantly
    if (isHybridOffloaded()) {
      console.warn('Hybrid Cloud offload host failed. Degrading gracefully to local host:', error.message);
      stopSshTunnel();
      const localHost = getOllamaHost();
      const response = await fetch(`${localHost}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Ollama ${endpoint} failed (${response.status}): ${text || response.statusText}`);
      }
      return response;
    }
    throw error;
  }
}

export async function checkOllamaInstalled() {
  if (!isLocalHost(getOllamaHost())) {
    return true;
  }
  return Boolean(await findOllamaBinary());
}

export async function checkOllamaRunning() {
  try {
    const response = await fetch(`${getOllamaHost()}/api/version`);
    if (!response.ok) {
      return { running: false, version: null };
    }
    const data = await response.json();
    return { running: true, version: data.version || 'unknown' };
  } catch {
    return { running: false, version: null };
  }
}

export async function startOllama() {
  if (!isLocalHost(getOllamaHost())) {
    const running = await checkOllamaRunning();
    if (running.running) {
      return { ok: true, remote: true, version: running.version };
    }
    throw new Error(`Remote Ollama host is configured (${getOllamaHost()}). Start Ollama on that server instead.`);
  }
  const binary = await findOllamaBinary();
  if (!binary) {
    throw new Error('Ollama is not installed.');
  }
  const running = await checkOllamaRunning();
  if (running.running) {
    return { ok: true, alreadyRunning: true, version: running.version };
  }
  managedOllamaProcess = spawn(binary, ['serve'], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true
  });
  managedOllamaProcess.unref?.();

  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = await checkOllamaRunning();
    if (status.running) {
      return { ok: true, version: status.version };
    }
  }
  throw new Error('Ollama was started but did not become ready.');
}

export function stopManagedOllama() {
  if (managedOllamaProcess && !managedOllamaProcess.killed) {
    try {
      managedOllamaProcess.kill();
    } catch {}
  }
  managedOllamaProcess = null;
}

export async function autoStartOllama() {
  if (!isLocalHost(getOllamaHost())) {
    return;
  }
  if (await checkOllamaInstalled()) {
    await startOllama();
  }
}

async function streamJsonLines(response, onJson, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) {
      throw new Error('Operation cancelled.');
    }
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      onJson(JSON.parse(trimmed));
    }
  }
  if (buffer.trim()) {
    onJson(JSON.parse(buffer.trim()));
  }
}

function installerUrl() {
  if (process.platform === 'win32') {
    return 'https://ollama.com/download/OllamaSetup.exe';
  }
  if (process.platform === 'darwin') {
    return 'https://ollama.com/download/Ollama-darwin.zip';
  }
  return 'https://ollama.com/install.sh';
}

function downloadFile(url, target, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(target);
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        file.close();
        fs.rmSync(target, { force: true });
        downloadFile(response.headers.location, target, onProgress, signal).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        onProgress({ downloaded, total, percent: total ? Math.round((downloaded / total) * 100) : 0 });
      });
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(target)));
    });
    request.on('error', reject);
    signal?.addEventListener('abort', () => {
      request.destroy(new Error('Download cancelled.'));
      file.close();
      fs.rmSync(target, { force: true });
    });
  });
}

async function installForPlatform(event, requestId, signal) {
  const url = installerUrl();
  emit(event, 'ollama:install:progress', requestId, {
    step: 'download',
    message: `Downloading from ${url}`,
    percent: 0
  });

  if (process.platform === 'linux') {
    const child = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      shell: false,
      windowsHide: true
    });
    child.stdout.on('data', (data) => emit(event, 'ollama:install:progress', requestId, { step: 'install', message: data.toString() }));
    child.stderr.on('data', (data) => emit(event, 'ollama:install:progress', requestId, { step: 'install', message: data.toString() }));
    return await new Promise((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(`Installer exited with code ${code}`))));
      signal?.addEventListener('abort', () => {
        child.kill();
        reject(new Error('Installation cancelled.'));
      });
    });
  }

  const target = path.join(app.getPath('temp'), path.basename(url));
  await downloadFile(url, target, (progress) => {
    emit(event, 'ollama:install:progress', requestId, { step: 'download', ...progress });
  }, signal);

  emit(event, 'ollama:install:progress', requestId, {
    step: 'install',
    message: `Running installer: ${target}`
  });

  if (process.platform === 'win32') {
    const child = spawn(target, ['/S'], { windowsHide: true });
    await new Promise((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Installer exited with code ${code}`))));
      child.on('error', reject);
      signal?.addEventListener('abort', () => {
        child.kill();
        reject(new Error('Installation cancelled.'));
      });
    });
  } else if (process.platform === 'darwin') {
    const child = spawn('sh', ['-c', `ditto -x -k "${target}" "$HOME/Applications"`], {
      windowsHide: true
    });
    await new Promise((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`macOS install exited with code ${code}`))));
      child.on('error', reject);
    });
  }

  return { ok: true };
}

export function registerOllamaHandlers() {
  ipcMain.handle('ollama:check', async () => {
    try {
      const installed = await checkOllamaInstalled();
      const running = await checkOllamaRunning();
      return {
        installed,
        running: running.running,
        version: running.version,
        host: getOllamaHost(),
        recommendedModels: RECOMMENDED_MODELS,
        hardware: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().map((cpu) => cpu.model)[0] || 'Unknown CPU',
          totalRamGb: Math.round(os.totalmem() / 1024 / 1024 / 1024)
        }
      };
    } catch (error) {
      throw new Error(`Unable to check Ollama: ${error.message}`);
    }
  });

  ipcMain.handle('ollama:start', async () => startOllama());
  ipcMain.handle('ollama:stop', async () => {
    stopManagedOllama();
    return { ok: true };
  });

  ipcMain.handle('ollama:models', async () => {
    const response = await ollamaFetch('/api/tags');
    const data = await response.json();
    return data.models || [];
  });

  ipcMain.handle('ollama:ps', async () => {
    const response = await ollamaFetch('/api/ps');
    return await response.json();
  });

  ipcMain.handle('ollama:delete', async (_event, modelName) => {
    await ollamaFetch('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ model: modelName })
    });
    return { ok: true };
  });

  ipcMain.handle('ollama:load', async (_event, modelName) => {
    await ollamaFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: modelName, prompt: '', keep_alive: '30m', stream: false })
    });
    return { ok: true };
  });

  ipcMain.handle('ollama:pull', async (event, payload = {}) => {
    const controller = new AbortController();
    pullControllers.set(payload.requestId, controller);
    const started = Date.now();
    let lastCompleted = 0;
    let lastAt = started;
    try {
      const response = await ollamaFetch('/api/pull', {
        method: 'POST',
        body: JSON.stringify({ model: payload.modelName, stream: true }),
        signal: controller.signal
      });
      await streamJsonLines(response, (line) => {
        const currentAt = Date.now();
        const deltaBytes = Math.max(0, (line.completed || lastCompleted) - lastCompleted);
        const deltaSeconds = Math.max(0.1, (currentAt - lastAt) / 1000);
        const speed = deltaBytes / deltaSeconds;
        lastCompleted = line.completed || lastCompleted;
        lastAt = currentAt;
        emit(event, 'ollama:pull:progress', payload.requestId, {
          ...line,
          speed,
          etaSeconds: line.total && speed ? Math.round((line.total - (line.completed || 0)) / speed) : null,
          percent: line.total ? Math.round(((line.completed || 0) / line.total) * 100) : 0
        });
      }, controller.signal);
      emit(event, 'ollama:pull:done', payload.requestId, { ok: true, modelName: payload.modelName });
      return { ok: true };
    } catch (error) {
      emit(event, 'ollama:pull:error', payload.requestId, { message: error.message });
      throw error;
    } finally {
      pullControllers.delete(payload.requestId);
    }
  });

  ipcMain.handle('ollama:pull:abort', async (_event, requestId) => {
    pullControllers.get(requestId)?.abort();
    return { ok: true };
  });

  ipcMain.handle('ollama:install', async (event, payload = {}) => {
    const controller = new AbortController();
    installControllers.set(payload.requestId, controller);
    try {
      await installForPlatform(event, payload.requestId, controller.signal);
      const status = await startOllama();
      emit(event, 'ollama:install:done', payload.requestId, status);
      return status;
    } catch (error) {
      emit(event, 'ollama:install:error', payload.requestId, { message: error.message });
      throw error;
    } finally {
      installControllers.delete(payload.requestId);
    }
  });

  ipcMain.handle('ollama:install:abort', async (_event, requestId) => {
    installControllers.get(requestId)?.abort();
    return { ok: true };
  });

  ipcMain.handle('ollama:prompt', async (event, payload = {}) => {
    const body = {
      model: payload.modelName,
      prompt: payload.prompt,
      stream: true,
      options: payload.options || {}
    };
    if (isClusterOllamaEnabled({ source: 'ollama_prompt' })) {
      try {
        await streamOllamaGenerateViaCluster({
          body,
          taskContext: { source: 'ollama_prompt' },
          onJson: (line) => {
            if (line.response) {
              emit(event, 'ollama:prompt:token', payload.requestId, { token: line.response });
            }
            if (line.done) {
              emit(event, 'ollama:prompt:done', payload.requestId, line);
            }
          }
        });
        return { ok: true, offloaded: true };
      } catch (error) {
        if (!(error instanceof ClusterOffloadError) && error.code !== 'CLUSTER_OFFLOAD_DROPPED') {
          throw error;
        }
      }
    }
    const response = await ollamaFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await streamJsonLines(response, (line) => {
      if (line.response) {
        emit(event, 'ollama:prompt:token', payload.requestId, { token: line.response });
      }
      if (line.done) {
        emit(event, 'ollama:prompt:done', payload.requestId, line);
      }
    });
    return { ok: true };
  });

  ipcMain.handle('ollama:chat', async (event, payload = {}) => {
    const body = {
      model: payload.modelName,
      messages: payload.messages || [],
      stream: true,
      options: payload.options || {}
    };
    if (isClusterOllamaEnabled({ source: 'ollama_chat' })) {
      try {
        await streamOllamaChatViaCluster({
          body,
          taskContext: { source: 'ollama_chat' },
          onJson: (line) => {
            if (line.message?.content) {
              emit(event, 'ollama:chat:token', payload.requestId, { token: line.message.content });
            }
            if (line.done) {
              emit(event, 'ollama:chat:done', payload.requestId, line);
            }
          }
        });
        return { ok: true, offloaded: true };
      } catch (error) {
        if (!(error instanceof ClusterOffloadError) && error.code !== 'CLUSTER_OFFLOAD_DROPPED') {
          throw error;
        }
      }
    }
    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await streamJsonLines(response, (line) => {
      if (line.message?.content) {
        emit(event, 'ollama:chat:token', payload.requestId, { token: line.message.content });
      }
      if (line.done) {
        emit(event, 'ollama:chat:done', payload.requestId, line);
      }
    });
    return { ok: true };
  });
}

