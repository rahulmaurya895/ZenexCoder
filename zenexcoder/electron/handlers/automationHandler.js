import { app, safeStorage, BrowserWindow, ipcMain } from 'electron';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CONFIG_FILE = 'zezenexcoderr-n8n-config.json';

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

export function getN8nConfig() {
  try {
    const filePath = storePath();
    if (!fsSync.existsSync(filePath)) {
      return { workspaceUrl: '', webhookPath: '', authHeader: '', authToken: '', active: false };
    }
    const raw = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
    return decryptedPayload(raw) || { workspaceUrl: '', webhookPath: '', authHeader: '', authToken: '', active: false };
  } catch {
    return { workspaceUrl: '', webhookPath: '', authHeader: '', authToken: '', active: false };
  }
}

export function saveN8nConfig(config) {
  const filePath = storePath();
  const encrypted = encryptedPayload(config);
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

function notify(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `n8n-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

export async function dispatchN8nWebhook(payload = {}) {
  const config = getN8nConfig();
  if (!config.workspaceUrl || !config.webhookPath) {
    throw new Error('n8n Webhook is not configured. Please set the workspace URL and webhook path in Connections Hub.');
  }

  const baseUrl = config.workspaceUrl.replace(/\/+$/, '');
  const pathPart = config.webhookPath.replace(/^\/+/, '');
  const fullUrl = `${baseUrl}/${pathPart}`;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'ZenexCoder-Swarm-Architect/2.0'
  };

  if (config.authHeader && config.authToken) {
    headers[config.authHeader] = config.authToken;
  }

  const requestBody = {
    source: 'ZenexCoder Swarm Architect',
    timestamp: new Date().toISOString(),
    executionId: payload.executionId || `n8n-exec-${crypto.randomUUID()}`,
    task: payload.task || 'Cloud Automation Trigger',
    consensus: payload.consensus || {},
    workflowParams: payload.params || {},
    environment: {
      platform: process.platform,
      arch: process.arch,
      appVersion: '2.0.0'
    }
  };

  sendToAll('n8n:webhook:status', {
    status: 'sending',
    url: fullUrl,
    timestamp: Date.now()
  });

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const errorMsg = `n8n Webhook HTTP ${response.status}: ${text || response.statusText}`;
    sendToAll('n8n:webhook:status', {
      status: 'error',
      url: fullUrl,
      error: errorMsg,
      timestamp: Date.now()
    });
    notify('n8n Webhook Failed', errorMsg, 'error');
    throw new Error(errorMsg);
  }

  let responseData = {};
  try {
    responseData = await response.json();
  } catch {
    responseData = { message: 'Webhook triggered successfully (non-JSON response).' };
  }

  sendToAll('n8n:webhook:status', {
    status: 'success',
    url: fullUrl,
    response: responseData,
    timestamp: Date.now()
  });

  notify('n8n Cloud Automation Triggered', `Successfully dispatched webhook to ${fullUrl} (HTTP 200 OK)`, 'info');

  return {
    ok: true,
    status: response.status,
    url: fullUrl,
    data: responseData
  };
}

export function registerAutomationHandlers() {
  ipcMain.handle('n8n:get-config', async () => getN8nConfig());
  ipcMain.handle('n8n:save-config', async (_evt, config) => saveN8nConfig(config));
  ipcMain.handle('n8n:trigger-webhook', async (_evt, payload) => dispatchN8nWebhook(payload));
}
