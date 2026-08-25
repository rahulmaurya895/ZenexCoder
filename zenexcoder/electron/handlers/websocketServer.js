import { WebSocketServer } from 'ws';
import {
  DEFAULT_CLUSTER_PORT,
  createKeyPair,
  decryptEnvelope,
  deriveSessionKey,
  encryptEnvelope,
  getClusterIdentity,
  getClusterIdentitySync,
  hardwareStats,
  notify,
  pairingProof,
  randomNonce,
  sendToAll,
  sixDigitPin
} from './clusterCore.js';
import { handleP2pSyncMessage } from './p2pSyncHandler.js';

const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

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

function getOllamaHost() {
  return normalizeHost(process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST);
}

let server = null;
let serverPort = DEFAULT_CLUSTER_PORT;
let localStatsTimer = null;
const peers = new Map();
const activeRemoteRequests = new Map();

function safeSend(ws, data) {
  if (ws.readyState === 1) {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  }
}

function sendEncrypted(peer, type, payload = {}) {
  safeSend(peer.ws, encryptEnvelope(peer.sessionKey, type, payload));
}

async function parseJsonLines(response, onJson, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) throw new Error('Remote Ollama request aborted.');
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) onJson(JSON.parse(line));
    }
  }
  if (buffer.trim()) onJson(JSON.parse(buffer.trim()));
}

async function handleOllamaRequest(peer, message, endpoint) {
  const requestId = message.payload?.requestId;
  const body = message.payload?.body || {};
  if (!requestId) return;
  const controller = new AbortController();
  activeRemoteRequests.set(requestId, controller);
  try {
    const response = await fetch(`${getOllamaHost()}${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Worker Ollama failed with ${response.status}`);
    }

    if (body.stream === false) {
      const json = await response.json();
      sendEncrypted(peer, 'AI_RESPONSE', { requestId, payload: json });
    } else {
      await parseJsonLines(response, (line) => {
        sendEncrypted(peer, 'AI_STREAM_CHUNK', { requestId, payload: line });
      }, controller.signal);
    }
    sendEncrypted(peer, 'AI_STREAM_DONE', { requestId });
  } catch (error) {
    sendEncrypted(peer, 'AI_STREAM_ERROR', { requestId, message: error.message });
  } finally {
    activeRemoteRequests.delete(requestId);
  }
}

function startStatsForPeer(peer) {
  clearInterval(peer.statsTimer);
  const sendStats = async () => {
    try {
      sendEncrypted(peer, 'HARDWARE_STATS', await hardwareStats());
    } catch {}
  };
  sendStats();
  peer.statsTimer = setInterval(sendStats, 5000);
}

async function pairRequest(ws, message = {}) {
  const identity = await getClusterIdentity();
  const pin = sixDigitPin();
  const keyPair = createKeyPair();
  const serverNonce = randomNonce();
  const peer = {
    ws,
    paired: false,
    peerNodeId: message.nodeId || `${message.hostname || 'unknown'}-${Date.now()}`,
    peerHostname: message.hostname || 'Unknown node',
    peerPlatform: message.platform || '',
    clientPublicKey: message.publicKey,
    clientNonce: message.clientNonce,
    serverNonce,
    ecdh: keyPair.ecdh,
    pin,
    sessionKey: null,
    statsTimer: null
  };
  peers.set(ws, peer);
  safeSend(ws, {
    type: 'PAIR_CHALLENGE',
    nodeId: identity.nodeId,
    hostname: identity.hostname,
    platform: identity.platform,
    publicKey: keyPair.publicKey,
    serverNonce
  });
  notify('ZenexCoder cluster pairing', `${peer.peerHostname} is trying to connect. PIN: ${pin}`, 'warning');
  sendToAll('cluster:pair-request', {
    nodeId: peer.peerNodeId,
    hostname: peer.peerHostname,
    pin,
    createdAt: Date.now()
  });
}

function verifyPair(ws, message = {}) {
  const peer = peers.get(ws);
  if (!peer?.clientPublicKey || !peer?.pin) {
    safeSend(ws, { type: 'PAIR_FAILED', message: 'No pending pair request.' });
    return;
  }
  try {
    const sessionKey = deriveSessionKey({
      ecdh: peer.ecdh,
      remotePublicKey: peer.clientPublicKey,
      pin: peer.pin,
      clientNonce: peer.clientNonce,
      serverNonce: peer.serverNonce
    });
    if (message.proof !== pairingProof(sessionKey)) {
      safeSend(ws, { type: 'PAIR_FAILED', message: 'Invalid pairing PIN.' });
      ws.close();
      return;
    }
    peer.sessionKey = sessionKey;
    peer.paired = true;
    safeSend(ws, { type: 'SESSION_READY', ok: true });
    notify('Cluster node paired', `${peer.peerHostname} is now connected.`, 'success');
    startStatsForPeer(peer);
  } catch (error) {
    safeSend(ws, { type: 'PAIR_FAILED', message: error.message });
    ws.close();
  }
}

async function handleEncrypted(ws, envelope) {
  const peer = peers.get(ws);
  if (!peer?.paired || !peer.sessionKey) {
    ws.close();
    return;
  }
  const message = decryptEnvelope(peer.sessionKey, envelope);
  if (await handleP2pSyncMessage(
    { nodeId: peer.peerNodeId, hostname: peer.peerHostname, platform: peer.peerPlatform },
    message.type,
    message.payload || {}
  )) {
    return;
  }
  if (message.type === 'PING') {
    sendEncrypted(peer, 'PONG', { sentAt: message.payload?.sentAt || Date.now() });
  }
  if (message.type === 'HARDWARE_STATS_REQUEST') {
    sendEncrypted(peer, 'HARDWARE_STATS', await hardwareStats());
  }
  if (message.type === 'OLLAMA_CHAT') {
    handleOllamaRequest(peer, message, '/api/chat');
  }
  if (message.type === 'OLLAMA_GENERATE') {
    handleOllamaRequest(peer, message, '/api/generate');
  }
  if (message.type === 'OLLAMA_ABORT') {
    activeRemoteRequests.get(message.payload?.requestId)?.abort();
  }
}

export function broadcastClusterServerEvent(type, payload = {}) {
  for (const peer of peers.values()) {
    if (peer?.paired && peer.sessionKey) {
      sendEncrypted(peer, type, payload);
    }
  }
}

function attachConnection(ws) {
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'PAIR_REQUEST') {
        await pairRequest(ws, message);
        return;
      }
      if (message.type === 'PAIR_VERIFY') {
        verifyPair(ws, message);
        return;
      }
      if (message.type === 'ENCRYPTED') {
        await handleEncrypted(ws, message);
      }
    } catch (error) {
      safeSend(ws, { type: 'PAIR_FAILED', message: error.message });
    }
  });
  ws.on('close', () => {
    const peer = peers.get(ws);
    if (peer?.statsTimer) clearInterval(peer.statsTimer);
    peers.delete(ws);
  });
}

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const candidate = new WebSocketServer({ port });
    candidate.once('listening', () => resolve(candidate));
    candidate.once('error', reject);
  });
}

async function startLocalStatsTimer() {
  clearInterval(localStatsTimer);
  const identity = await getClusterIdentity();
  const emitStats = async () => {
    sendToAll('cluster:status-update', {
      nodeId: identity.nodeId,
      role: 'master',
      connected: true,
      hardware: await hardwareStats()
    });
  };
  emitStats();
  localStatsTimer = setInterval(() => emitStats().catch(() => {}), 5000);
}

export async function startWebSocketServer() {
  if (server) return { ok: true, port: serverPort };
  await getClusterIdentity();
  let lastError = null;
  for (let port = DEFAULT_CLUSTER_PORT; port < DEFAULT_CLUSTER_PORT + 12; port += 1) {
    try {
      server = await listenOnPort(port);
      serverPort = port;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!server) {
    throw lastError || new Error('Unable to start cluster WebSocket server.');
  }
  server.on('connection', attachConnection);
  await startLocalStatsTimer();
  return { ok: true, port: serverPort };
}

export function getWebSocketServerPort() {
  return serverPort;
}

export function getLocalClusterNode() {
  const identity = getClusterIdentitySync();
  return {
    ...identity,
    id: identity.nodeId,
    nodeId: identity.nodeId,
    hostname: identity.hostname,
    port: serverPort,
    role: 'master',
    connected: true,
    status: 'local'
  };
}

export function stopWebSocketServer() {
  clearInterval(localStatsTimer);
  localStatsTimer = null;
  for (const peer of peers.values()) {
    clearInterval(peer.statsTimer);
    peer.ws.close();
  }
  peers.clear();
  for (const controller of activeRemoteRequests.values()) {
    controller.abort();
  }
  activeRemoteRequests.clear();
  if (server) {
    server.close();
    server = null;
  }
}
