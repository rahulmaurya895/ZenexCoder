import { ipcMain } from 'electron';
import { WebSocket } from 'ws';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import {
  createKeyPair,
  decryptEnvelope,
  deriveSessionKey,
  encryptEnvelope,
  getClusterIdentity,
  getClusterIdentitySync,
  notify,
  pairingProof,
  randomNonce,
  sendToAll
} from './clusterCore.js';
import { getLocalClusterNode } from './websocketServer.js';
import { chooseClusterRoute } from '../../src/utils/loadBalancer.js';
import { handleP2pSyncMessage } from './p2pSyncHandler.js';

const STORE_FILE = 'zezenexcoderr-cluster-routing.json';
const nodes = new Map();
const clients = new Map();
const pendingRequests = new Map();
const pendingPings = new Map();
let routing = {
  ollamaOffloadEnabled: false,
  indexingOffloadEnabled: false,
  primaryNodeId: '',
  keepArchitectLocal: true
};

export class ClusterOffloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClusterOffloadError';
    this.code = 'CLUSTER_OFFLOAD_DROPPED';
  }
}

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

async function loadRouting() {
  try {
    routing = { ...routing, ...JSON.parse(await fs.readFile(storePath(), 'utf8')) };
  } catch {}
  return routing;
}

async function saveRouting() {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(routing, null, 2), 'utf8');
}

function publicNode(node = {}) {
  return {
    id: node.nodeId,
    nodeId: node.nodeId,
    hostname: node.hostname || node.host || 'Unknown node',
    ip: node.ip || '',
    port: node.port || 0,
    platform: node.platform || '',
    arch: node.arch || '',
    role: node.role || 'worker',
    status: node.status || 'discovered',
    connected: Boolean(node.connected),
    pairing: Boolean(node.pairing),
    pingMs: node.pingMs ?? null,
    lastSeen: node.lastSeen || Date.now(),
    hardware: node.hardware || null,
    useForAI: routing.primaryNodeId === node.nodeId && routing.ollamaOffloadEnabled,
    useForIndexing: routing.primaryNodeId === node.nodeId && routing.indexingOffloadEnabled
  };
}

export function clusterState() {
  return {
    localNode: getLocalClusterNode(),
    nodes: [...nodes.values()].map(publicNode),
    routing
  };
}

function emitState() {
  sendToAll('cluster:state-update', clusterState());
}

function upsertNode(node) {
  if (!node?.nodeId || node.nodeId === getClusterIdentitySync().nodeId) return null;
  const previous = nodes.get(node.nodeId) || {};
  const next = {
    ...previous,
    ...node,
    lastSeen: Date.now()
  };
  nodes.set(next.nodeId, next);
  sendToAll('cluster:node-found', publicNode(next));
  emitState();
  return next;
}

export function registerDiscoveredNode(service = {}) {
  const txt = service.txt || {};
  const addresses = service.addresses || [];
  const ip =
    addresses.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address) && !address.startsWith('127.')) ||
    addresses.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address)) ||
    service.referer?.address ||
    '';
  const nodeId = txt.nodeId || `${service.host || ip}:${service.port}`;
  if (!ip || !service.port) return null;
  return upsertNode({
    nodeId,
    hostname: txt.hostname || service.name?.replace(/^ZenexCoder-Node-/, '') || service.host || ip,
    ip,
    port: Number(service.port),
    platform: txt.platform || '',
    arch: txt.arch || '',
    status: service.status || 'discovered',
    connected: clients.has(nodeId)
  });
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
}

function sendEncrypted(client, type, payload = {}) {
  safeSend(client.ws, encryptEnvelope(client.sessionKey, type, payload));
}

function failPendingForNode(nodeId, message) {
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (pending.nodeId === nodeId) {
      pending.reject(new ClusterOffloadError(message));
      pendingRequests.delete(requestId);
    }
  }
  for (const [requestId, pending] of pendingPings.entries()) {
    if (pending.nodeId === nodeId) {
      pending.resolve(null);
      pendingPings.delete(requestId);
    }
  }
}

function updateNode(nodeId, patch) {
  const node = nodes.get(nodeId);
  if (!node) return;
  const next = { ...node, ...patch, lastSeen: Date.now() };
  nodes.set(nodeId, next);
  sendToAll('cluster:status-update', publicNode(next));
  emitState();
}

async function handleEncrypted(client, envelope) {
  const message = decryptEnvelope(client.sessionKey, envelope);
  if (await handleP2pSyncMessage(
    { nodeId: client.nodeId, hostname: nodes.get(client.nodeId)?.hostname || '' },
    message.type,
    message.payload || {}
  )) {
    return;
  }
  if (message.type === 'HARDWARE_STATS') {
    updateNode(client.nodeId, {
      connected: true,
      status: 'connected',
      hardware: message.payload
    });
    return;
  }
  if (message.type === 'PONG') {
    const pending = pendingPings.get(message.payload?.requestId);
    if (pending) {
      const pingMs = Date.now() - pending.startedAt;
      pending.resolve(pingMs);
      pendingPings.delete(message.payload.requestId);
      updateNode(client.nodeId, { pingMs, connected: true, status: 'connected' });
    }
    return;
  }

  const requestId = message.payload?.requestId;
  const pending = requestId ? pendingRequests.get(requestId) : null;
  if (!pending) return;
  if (message.type === 'AI_STREAM_CHUNK') {
    pending.onJson?.(message.payload.payload);
  }
  if (message.type === 'AI_RESPONSE') {
    pending.response = message.payload.payload;
  }
  if (message.type === 'AI_STREAM_DONE') {
    pending.resolve(pending.response || { ok: true });
    pendingRequests.delete(requestId);
  }
  if (message.type === 'AI_STREAM_ERROR') {
    pending.reject(new ClusterOffloadError(message.payload?.message || 'Worker Ollama stream failed.'));
    pendingRequests.delete(requestId);
  }
}

function attachClient(client) {
  client.ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'PAIR_CHALLENGE') {
        client.serverPublicKey = message.publicKey;
        client.serverNonce = message.serverNonce;
        updateNode(client.nodeId, {
          hostname: message.hostname || nodes.get(client.nodeId)?.hostname,
          platform: message.platform || nodes.get(client.nodeId)?.platform,
          status: 'pairing',
          pairing: true
        });
      } else if (message.type === 'SESSION_READY') {
        client.connected = true;
        updateNode(client.nodeId, { status: 'connected', connected: true, pairing: false });
        notify('Cluster worker connected', `${nodes.get(client.nodeId)?.hostname || 'Worker'} is ready for AI offload.`, 'success');
        requestHardwareStats(client.nodeId).catch(() => {});
      } else if (message.type === 'PAIR_FAILED') {
        updateNode(client.nodeId, { status: 'pair_failed', connected: false, pairing: false });
        notify('Cluster pairing failed', message.message || 'Invalid PIN.', 'error');
      } else if (message.type === 'ENCRYPTED') {
        handleEncrypted(client, message).catch((error) => notify('Cluster sync error', error.message, 'warning'));
      }
    } catch (error) {
      notify('Cluster message error', error.message, 'warning');
    }
  });
  client.ws.on('close', () => {
    clients.delete(client.nodeId);
    failPendingForNode(client.nodeId, 'Cluster worker disconnected. Falling back to local Ollama.');
    updateNode(client.nodeId, { connected: false, status: 'disconnected', pairing: false });
  });
  client.ws.on('error', (error) => {
    failPendingForNode(client.nodeId, error.message);
    updateNode(client.nodeId, { connected: false, status: 'error', pairing: false });
  });
}

export function broadcastClusterClientEvent(type, payload = {}) {
  for (const client of clients.values()) {
    if (client?.connected && client.sessionKey) {
      sendEncrypted(client, type, payload);
    }
  }
}

export async function requestPair(payload = {}) {
  await getClusterIdentity();
  const node = nodes.get(payload.nodeId) || [...nodes.values()].find((item) => item.ip === payload.ip && item.port === Number(payload.port));
  if (!node) throw new Error('Cluster node was not found.');
  const existing = clients.get(node.nodeId);
  if (existing?.connected) return { ok: true, node: publicNode(node), alreadyConnected: true };

  const ws = new WebSocket(`ws://${node.ip}:${node.port}`);
  const keyPair = createKeyPair();
  const clientNonce = randomNonce();
  const identity = await getClusterIdentity();
  const client = {
    nodeId: node.nodeId,
    ws,
    ecdh: keyPair.ecdh,
    publicKey: keyPair.publicKey,
    clientNonce,
    serverNonce: '',
    serverPublicKey: '',
    sessionKey: null,
    connected: false
  };
  clients.set(node.nodeId, client);
  updateNode(node.nodeId, { status: 'connecting', pairing: true });
  attachClient(client);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  safeSend(ws, {
    type: 'PAIR_REQUEST',
    nodeId: identity.nodeId,
    hostname: identity.hostname,
    platform: identity.platform,
    arch: identity.arch,
    publicKey: keyPair.publicKey,
    clientNonce
  });
  return { ok: true, node: publicNode(nodes.get(node.nodeId)), needsPin: true };
}

export async function verifyPin(payload = {}) {
  const nodeId = payload.nodeId || [...nodes.values()].find((item) => item.ip === payload.ip)?.nodeId;
  const client = clients.get(nodeId);
  if (!client) throw new Error('No pending cluster pairing connection.');
  if (!client.serverPublicKey || !client.serverNonce) {
    throw new Error('Worker has not sent a pairing challenge yet.');
  }
  const sessionKey = deriveSessionKey({
    ecdh: client.ecdh,
    remotePublicKey: client.serverPublicKey,
    pin: payload.pin,
    clientNonce: client.clientNonce,
    serverNonce: client.serverNonce
  });
  client.sessionKey = sessionKey;
  safeSend(client.ws, {
    type: 'PAIR_VERIFY',
    proof: pairingProof(sessionKey)
  });
  return { ok: true };
}

export async function disconnectNode(payload = {}) {
  const nodeId = payload.nodeId || payload.id;
  const client = clients.get(nodeId);
  client?.ws.close();
  clients.delete(nodeId);
  if (routing.primaryNodeId === nodeId) {
    routing = { ...routing, ollamaOffloadEnabled: false, indexingOffloadEnabled: false, primaryNodeId: '' };
    await saveRouting();
  }
  updateNode(nodeId, { connected: false, status: 'disconnected', pairing: false });
  return { ok: true };
}

export async function setClusterRouting(payload = {}) {
  routing = {
    ...routing,
    ...payload,
    primaryNodeId: payload.primaryNodeId ?? routing.primaryNodeId
  };
  if (!routing.primaryNodeId && payload.nodeId) {
    routing.primaryNodeId = payload.nodeId;
  }
  await saveRouting();
  emitState();
  return clusterState();
}

export async function requestHardwareStats(nodeId) {
  const client = clients.get(nodeId);
  if (!client?.connected || !client.sessionKey) return { ok: false };
  sendEncrypted(client, 'HARDWARE_STATS_REQUEST', {});
  return { ok: true };
}

export async function pingNode(nodeId) {
  const client = clients.get(nodeId);
  if (!client?.connected || !client.sessionKey) return null;
  const requestId = `ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const promise = new Promise((resolve) => {
    pendingPings.set(requestId, { nodeId, startedAt: Date.now(), resolve });
    setTimeout(() => {
      if (pendingPings.has(requestId)) {
        pendingPings.delete(requestId);
        resolve(null);
      }
    }, 3000);
  });
  sendEncrypted(client, 'PING', { requestId, sentAt: Date.now() });
  return promise;
}

function selectedOllamaClient(taskContext = {}) {
  const nodeList = [...nodes.values()].map(publicNode);
  const route = chooseClusterRoute({
    taskType: 'ollama',
    personaId: taskContext.personaId || taskContext.role || '',
    nodes: nodeList,
    routing
  });
  if (route.route !== 'remote') return null;
  const client = clients.get(route.nodeId);
  if (!client?.connected || !client.sessionKey) return null;
  return client;
}

export function isClusterOllamaEnabled(taskContext = {}) {
  return Boolean(selectedOllamaClient(taskContext));
}

function remoteOllamaRequest({ endpointType, body, onJson, signal, taskContext }) {
  const client = selectedOllamaClient(taskContext);
  if (!client) {
    return Promise.reject(new ClusterOffloadError('No connected cluster worker is available.'));
  }
  const requestId = `ollama-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const type = endpointType === 'generate' ? 'OLLAMA_GENERATE' : 'OLLAMA_CHAT';
  const promise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      nodeId: client.nodeId,
      resolve,
      reject,
      onJson
    });
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new ClusterOffloadError('Cluster worker timed out. Falling back to local Ollama.'));
      }
    }, Number(taskContext?.timeoutMs || 30 * 60 * 1000));
    const previousResolve = resolve;
    const previousReject = reject;
    pendingRequests.set(requestId, {
      nodeId: client.nodeId,
      onJson,
      resolve: (value) => {
        clearTimeout(timeout);
        previousResolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        previousReject(error);
      }
    });
  });
  const abort = () => {
    sendEncrypted(client, 'OLLAMA_ABORT', { requestId });
    pendingRequests.get(requestId)?.reject(new ClusterOffloadError('Cluster offload was aborted.'));
    pendingRequests.delete(requestId);
  };
  signal?.addEventListener('abort', abort, { once: true });
  sendEncrypted(client, type, {
    requestId,
    body,
    taskContext
  });
  return promise.finally(() => signal?.removeEventListener('abort', abort));
}

export function streamOllamaChatViaCluster({ body, onJson, signal, taskContext = {} }) {
  return remoteOllamaRequest({ endpointType: 'chat', body, onJson, signal, taskContext });
}

export function streamOllamaGenerateViaCluster({ body, onJson, signal, taskContext = {} }) {
  return remoteOllamaRequest({ endpointType: 'generate', body, onJson, signal, taskContext });
}

export async function startClusterClient() {
  await getClusterIdentity();
  await loadRouting();
  emitState();
  setInterval(() => {
    for (const nodeId of clients.keys()) {
      pingNode(nodeId).catch(() => {});
    }
  }, 5000);
}

export function registerClusterClientHandlers() {
  ipcMain.handle('cluster:list', async () => clusterState());
  ipcMain.handle('cluster:request-pair', async (_event, payload = {}) => requestPair(payload));
  ipcMain.handle('cluster:verify-pin', async (_event, payload = {}) => verifyPin(payload));
  ipcMain.handle('cluster:disconnect', async (_event, payload = {}) => disconnectNode(payload));
  ipcMain.handle('cluster:set-routing', async (_event, payload = {}) => setClusterRouting(payload));
  ipcMain.handle('cluster:ping', async (_event, payload = {}) => ({ pingMs: await pingNode(payload.nodeId) }));
}
