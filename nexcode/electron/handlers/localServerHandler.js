import http from 'node:http';
import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';

const pendingTriggers = new Map();
let server = null;
let serverPort = 0;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 256) {
        request.destroy(new Error('Payload too large.'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

export function getHookServerPort() {
  return serverPort;
}

export function getHookServerState() {
  return {
    running: Boolean(server && serverPort),
    host: '127.0.0.1',
    port: serverPort,
    url: serverPort ? `http://127.0.0.1:${serverPort}/webhook` : ''
  };
}

export async function startLocalHookServer() {
  if (server) {
    return getHookServerState();
  }

  server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/webhook') {
      writeJson(response, 404, { ok: false, error: 'Not found' });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      if (payload.smokeTest) {
        writeJson(response, 200, { ok: true, status: 'allow', smokeTest: true });
        return;
      }
      const triggerId = crypto.randomUUID();
      const trigger = {
        triggerId,
        event: payload.event || payload.hookType || 'external',
        projectPath: payload.projectPath || '',
        payload,
        source: 'git-hook',
        receivedAt: Date.now(),
        waiting: true
      };

      const timeout = setTimeout(() => {
        if (!pendingTriggers.has(triggerId)) return;
        pendingTriggers.delete(triggerId);
        writeJson(response, 200, {
          ok: true,
          status: 'allow',
          reason: 'ZezenexCoderr hook timed out; failing open.'
        });
      }, 180000);

      pendingTriggers.set(triggerId, { response, timeout });
      sendToAll('hook:external-trigger', trigger);
    } catch (error) {
      writeJson(response, 200, {
        ok: true,
        status: 'allow',
        reason: `ZezenexCoderr hook payload error; failing open: ${error.message}`
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      serverPort = server.address().port;
      resolve();
    });
  });

  return getHookServerState();
}

export function emitLocalHookEvent(event, projectPath, payload = {}) {
  const trigger = {
    triggerId: null,
    event,
    projectPath: projectPath || payload.projectPath || '',
    payload,
    source: 'app',
    receivedAt: Date.now(),
    waiting: false
  };
  sendToAll('hook:external-trigger', trigger);
  return trigger;
}

export function resolveHookTrigger(triggerId, status = 'allow', details = {}) {
  if (!triggerId) {
    return { ok: true, ignored: true };
  }
  const pending = pendingTriggers.get(triggerId);
  if (!pending) {
    return { ok: false, error: 'Hook trigger is no longer waiting.' };
  }

  clearTimeout(pending.timeout);
  pendingTriggers.delete(triggerId);
  const allowed = status !== 'block';
  writeJson(pending.response, allowed ? 200 : 400, {
    ok: allowed,
    status: allowed ? 'allow' : 'block',
    ...details
  });
  return { ok: true, status: allowed ? 'allow' : 'block' };
}

export async function stopLocalHookServer() {
  for (const [triggerId, pending] of pendingTriggers.entries()) {
    clearTimeout(pending.timeout);
    writeJson(pending.response, 200, {
      ok: true,
      status: 'allow',
      reason: 'ZezenexCoderr is shutting down; failing open.'
    });
    pendingTriggers.delete(triggerId);
  }
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  serverPort = 0;
}
