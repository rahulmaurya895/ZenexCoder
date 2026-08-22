import { app, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const STORE_FILE = 'zenexcoder-cluster.json';
let identity = null;
let previousCpuSnapshot = null;

export const CLUSTER_SERVICE_TYPE = 'zenexcoder';
export const DEFAULT_CLUSTER_PORT = 44556;

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
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

export async function getClusterIdentity() {
  if (identity) return identity;
  const store = await readStore();
  const nodeId = store.nodeId || crypto.randomUUID();
  if (!store.nodeId) {
    await writeStore({ ...store, nodeId });
  }
  identity = {
    nodeId,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
  return identity;
}

export function getClusterIdentitySync() {
  if (identity) return identity;
  let store = {};
  const file = storePath();
  try {
    store = JSON.parse(fsSync.readFileSync(file, 'utf8'));
  } catch {}
  const nodeId = store.nodeId || crypto.randomUUID();
  if (!store.nodeId) {
    fsSync.mkdirSync(path.dirname(file), { recursive: true });
    fsSync.writeFileSync(file, JSON.stringify({ ...store, nodeId }, null, 2), 'utf8');
  }
  identity = {
    nodeId,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
  return identity;
}

export function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

export function notify(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

export function createKeyPair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    ecdh,
    publicKey: ecdh.getPublicKey('base64')
  };
}

export function deriveSessionKey({ ecdh, remotePublicKey, pin, clientNonce, serverNonce }) {
  const sharedSecret = ecdh.computeSecret(Buffer.from(remotePublicKey, 'base64'));
  return crypto
    .createHash('sha256')
    .update(sharedSecret)
    .update(String(pin || '').trim())
    .update(String(clientNonce || ''))
    .update(String(serverNonce || ''))
    .digest();
}

export function pairingProof(sessionKey) {
  return crypto.createHmac('sha256', sessionKey).update('zenexcoder-pair-proof-v1').digest('base64');
}

export function encryptEnvelope(sessionKey, type, payload = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ type, payload, timestamp: Date.now() }), 'utf8'),
    cipher.final()
  ]);
  return {
    type: 'ENCRYPTED',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  };
}

export function decryptEnvelope(sessionKey, envelope = {}) {
  if (envelope.type !== 'ENCRYPTED') {
    throw new Error('Invalid encrypted cluster envelope.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(decrypted);
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function cpuLoadPercent() {
  const current = cpuSnapshot();
  if (!previousCpuSnapshot) {
    previousCpuSnapshot = current;
    return 0;
  }
  let idleDelta = 0;
  let totalDelta = 0;
  current.forEach((times, index) => {
    const previous = previousCpuSnapshot[index] || times;
    const idle = times.idle - previous.idle;
    const total = Object.keys(times).reduce((sum, key) => sum + (times[key] - previous[key]), 0);
    idleDelta += idle;
    totalDelta += total;
  });
  previousCpuSnapshot = current;
  if (!totalDelta) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

function queryGpuStats() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total,name', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 1600 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }
        const [first] = stdout.trim().split(/\r?\n/);
        const [utilization, memoryUsed, memoryTotal, ...nameParts] = first.split(',').map((part) => part.trim());
        resolve({
          name: nameParts.join(', ') || 'NVIDIA GPU',
          gpuLoad: Number(utilization) || 0,
          gpuMemoryUsedMb: Number(memoryUsed) || 0,
          gpuMemoryTotalMb: Number(memoryTotal) || 0
        });
      }
    );
  });
}

export async function hardwareStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const gpu = await queryGpuStats();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
    cpuCores: os.cpus().length,
    cpuLoad: cpuLoadPercent(),
    ramLoad: Math.round(((totalMem - freeMem) / totalMem) * 100),
    totalRamGb: Math.round(totalMem / 1024 / 1024 / 1024),
    freeRamGb: Math.round(freeMem / 1024 / 1024 / 1024),
    uptimeSeconds: Math.round(os.uptime()),
    gpu: gpu || {
      name: '',
      gpuLoad: null,
      gpuMemoryUsedMb: null,
      gpuMemoryTotalMb: null
    },
    timestamp: Date.now()
  };
}

export function sixDigitPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function randomNonce() {
  return crypto.randomBytes(16).toString('base64');
}
