import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'node:crypto';
import os from 'node:os';
import { getClusterIdentitySync } from './clusterCore.js';
import { decryptRuleDelta, encryptRuleDelta, getVaultStatus, writeSharedVault } from './vaultHandler.js';
import { listLearnedRules, muteRulesByOrigin, upsertLearnedRule } from './learningHandler.js';

let connected = false;
let projectPath = '';
let transports = [];
let peers = new Map();
let mutedOrigins = new Set();
let syncStatus = {
  connected: false,
  e2ee: false,
  lastSyncAt: 0,
  error: ''
};

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function localIdentity() {
  const identity = getClusterIdentitySync();
  return {
    userId: identity.nodeId,
    nodeId: identity.nodeId,
    name: os.userInfo().username || identity.hostname,
    hostname: identity.hostname
  };
}

function publicPeers() {
  return [...peers.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function emitPeers() {
  sendToAll('collab:peers-updated', { peers: publicPeers(), status: syncStatus });
}

function broadcast(type, payload = {}) {
  if (!connected) return;
  transports.forEach((transport) => {
    try {
      transport(type, payload);
    } catch {}
  });
}

export function registerP2pTransports(nextTransports = []) {
  transports = nextTransports.filter(Boolean);
}

function rememberPeer(origin = {}, patch = {}) {
  const id = origin.nodeId || origin.userId || patch.nodeId || patch.userId;
  if (!id || id === localIdentity().nodeId) return null;
  const previous = peers.get(id) || {};
  const next = {
    userId: id,
    nodeId: id,
    name: origin.name || patch.name || previous.name || origin.hostname || patch.hostname || 'Teammate',
    hostname: origin.hostname || patch.hostname || previous.hostname || '',
    file: patch.file ?? previous.file ?? '',
    status: patch.status || previous.status || 'Idle',
    muted: mutedOrigins.has(id),
    lastSeen: Date.now()
  };
  peers.set(id, next);
  emitPeers();
  return next;
}

async function sendLocalRules() {
  const rules = listLearnedRules({ includeMuted: false, includeDeleted: false }).filter((rule) => rule.status === 'active');
  await writeSharedVault({ projectPath, rules }).catch(() => {});
  for (const rule of rules.slice(0, 80)) {
    const vault = await encryptRuleDelta(rule, { projectPath });
    broadcast('COLLAB_RULE_DELTA', {
      origin: localIdentity(),
      projectPathHint: Boolean(projectPath),
      vault
    });
  }
  syncStatus = { ...syncStatus, lastSyncAt: Date.now(), error: '' };
}

export async function connectCollaboration(payload = {}) {
  projectPath = payload.projectPath || projectPath || '';
  connected = true;
  const vault = await getVaultStatus({ projectPath }).catch((error) => ({ ok: false, error: error.message }));
  syncStatus = {
    connected: true,
    e2ee: Boolean(vault.ok),
    lastSyncAt: Date.now(),
    error: vault.error || ''
  };
  broadcast('COLLAB_HELLO', {
    origin: localIdentity(),
    vaultProjectId: vault.projectId || '',
    status: 'Coding'
  });
  await sendLocalRules().catch((error) => {
    syncStatus = { ...syncStatus, error: error.message };
  });
  emitPeers();
  return { ok: true, peers: publicPeers(), status: syncStatus, vault };
}

export function disconnectCollaboration() {
  connected = false;
  syncStatus = { ...syncStatus, connected: false };
  broadcast('COLLAB_BYE', { origin: localIdentity() });
  emitPeers();
  return { ok: true };
}

export async function publishLearnedRule(rule) {
  if (!connected || !rule || rule.muted || rule.status === 'deleted') return;
  const vault = await encryptRuleDelta(rule, { projectPath });
  broadcast('COLLAB_RULE_DELTA', {
    origin: localIdentity(),
    vault
  });
}

export function updatePresence(payload = {}) {
  if (!connected) return { ok: false };
  const presence = {
    origin: localIdentity(),
    file: payload.file || '',
    status: payload.status || 'Coding',
    updatedAt: Date.now()
  };
  broadcast('COLLAB_PRESENCE', presence);
  return { ok: true };
}

export async function handleP2pSyncMessage(origin = {}, type, payload = {}) {
  if (!type?.startsWith('COLLAB_')) return false;
  if (type === 'COLLAB_HELLO') {
    rememberPeer(payload.origin || origin, { status: payload.status || 'Active' });
    if (connected) {
      broadcast('COLLAB_HELLO', { origin: localIdentity(), status: 'Coding' });
    }
    return true;
  }
  if (type === 'COLLAB_BYE') {
    rememberPeer(payload.origin || origin, { status: 'Idle' });
    return true;
  }
  if (type === 'COLLAB_PRESENCE') {
    const peer = rememberPeer(payload.origin || origin, {
      file: payload.file || '',
      status: payload.status || 'Coding'
    });
    if (peer) {
      sendToAll('collab:presence-update', peer);
    }
    return true;
  }
  if (type === 'COLLAB_RULE_DELTA') {
    const remote = payload.origin || origin;
    const nodeId = remote.nodeId || remote.userId || '';
    rememberPeer(remote, { status: 'Coding' });
    if (mutedOrigins.has(nodeId)) return true;
    try {
      const decrypted = await decryptRuleDelta(payload.vault, { projectPath });
      const incoming = decrypted.rule || {};
      const saved = upsertLearnedRule(
        {
          ...incoming,
          id: incoming.id || crypto.randomUUID(),
          source: 'shared',
          originNodeId: nodeId || incoming.originNodeId || 'shared',
          originName: remote.name || remote.hostname || incoming.originName || 'Teammate',
          updatedAt: Date.now()
        },
        { allowLowEvidence: true, reason: 'shared_sync' }
      );
      syncStatus = { ...syncStatus, e2ee: true, lastSyncAt: Date.now(), error: '' };
      sendToAll('collab:rule-synced', { rule: saved, origin: remote });
      emitPeers();
    } catch (error) {
      syncStatus = { ...syncStatus, error: error.message };
      emitPeers();
    }
    return true;
  }
  return false;
}

export function registerP2pSyncHandlers() {
  ipcMain.handle('collab:connect', async (_event, payload = {}) => connectCollaboration(payload));
  ipcMain.handle('collab:disconnect', async () => disconnectCollaboration());
  ipcMain.handle('collab:list', async () => ({ peers: publicPeers(), status: syncStatus }));
  ipcMain.handle('collab:update-presence', async (_event, payload = {}) => updatePresence(payload));
  ipcMain.handle('collab:sync-rules', async () => {
    await sendLocalRules();
    return { ok: true, status: syncStatus };
  });
  ipcMain.handle('collab:mute-origin', async (_event, payload = {}) => {
    const originNodeId = payload.originNodeId || payload.nodeId;
    if (!originNodeId) return { ok: false };
    if (payload.muted === false) {
      mutedOrigins.delete(originNodeId);
    } else {
      mutedOrigins.add(originNodeId);
    }
    muteRulesByOrigin(originNodeId, payload.muted !== false);
    rememberPeer({ nodeId: originNodeId }, { muted: payload.muted !== false });
    return { ok: true };
  });
}
