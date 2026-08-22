import { app, ipcMain, BrowserWindow } from 'electron';
import os from 'node:os';
import { spawn, exec } from 'node:child_process';
import net from 'node:net';

let sshTunnelProcess = null;
let monitorInterval = null;

let hybridState = {
  enabled: false,
  instanceIp: '',
  sshPort: 22,
  sshUser: 'ubuntu',
  sshKeyPath: '',
  remoteOllamaPort: 11434,
  localTunnelPort: 11435,
  criticalRamThreshold: 85,
  isOffloaded: false,
  activeTunnel: false,
  status: 'idle',
  error: ''
};

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function updateState(patch) {
  hybridState = { ...hybridState, ...patch };
  sendToAll('hybrid-cloud:state-changed', hybridState);
  return hybridState;
}

function notifyUser(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `hybrid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

function checkPortOpen(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => resolve(status));
    socket.connect(port, host);
  });
}

export async function startSshTunnel() {
  if (sshTunnelProcess) {
    const isOpen = await checkPortOpen(hybridState.localTunnelPort);
    if (isOpen) {
      return true;
    }
    stopSshTunnel();
  }

  if (!hybridState.instanceIp) {
    updateState({ isOffloaded: false, activeTunnel: false, status: 'error', error: 'No Oracle Cloud instance IP configured.' });
    return false;
  }

  const user = hybridState.sshUser || 'ubuntu';
  const ip = hybridState.instanceIp;
  const sshPort = hybridState.sshPort || 22;
  const localPort = hybridState.localTunnelPort || 11435;
  const remotePort = hybridState.remoteOllamaPort || 11434;
  const keyArg = hybridState.sshKeyPath ? ['-i', hybridState.sshKeyPath] : [];

  const sshArgs = [
    ...keyArg,
    '-p', String(sshPort),
    '-N',
    '-L', `${localPort}:127.0.0.1:${remotePort}`,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ConnectTimeout=10',
    `${user}@${ip}`
  ];

  updateState({ status: 'tunneling' });

  return new Promise((resolve) => {
    try {
      sshTunnelProcess = spawn('ssh', sshArgs, { windowsHide: true });

      sshTunnelProcess.on('error', (err) => {
        sshTunnelProcess = null;
        updateState({ isOffloaded: false, activeTunnel: false, status: 'fallback', error: `SSH Tunnel error: ${err.message}` });
        notifyUser('Hybrid Cloud Tunnel Failed', `SSH process error: ${err.message}. Falling back to local AI.`, 'error');
        resolve(false);
      });

      sshTunnelProcess.on('exit', (code) => {
        sshTunnelProcess = null;
        if (hybridState.isOffloaded) {
          updateState({ isOffloaded: false, activeTunnel: false, status: 'fallback', error: `SSH connection exited with code ${code}` });
          notifyUser('Remote Cloud Tunnel Closed', 'Oracle Cloud connection lost. Instantly degraded to local AI.', 'warning');
        } else {
          updateState({ activeTunnel: false, status: 'idle' });
        }
      });

      // Poll until port responds or times out
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        const ready = await checkPortOpen(localPort);
        if (ready) {
          clearInterval(checkInterval);
          updateState({ isOffloaded: true, activeTunnel: true, status: 'offloaded', error: '' });
          notifyUser('Oracle Cloud Engine Active', `RAM threshold exceeded. AI processing offloaded to Oracle Cloud (${ip}).`, 'info');
          resolve(true);
        } else if (attempts >= 10) {
          clearInterval(checkInterval);
          stopSshTunnel();
          updateState({ isOffloaded: false, activeTunnel: false, status: 'fallback', error: 'Tunnel port failed to open in 10s' });
          notifyUser('Oracle Cloud Connection Timeout', 'Remote host non-responsive. Preserving local AI processing.', 'warning');
          resolve(false);
        }
      }, 500);
    } catch (err) {
      updateState({ isOffloaded: false, activeTunnel: false, status: 'fallback', error: err.message });
      resolve(false);
    }
  });
}

export function stopSshTunnel() {
  if (sshTunnelProcess) {
    try {
      sshTunnelProcess.kill();
    } catch {}
    sshTunnelProcess = null;
  }
  updateState({ isOffloaded: false, activeTunnel: false, status: 'idle' });
}

export function getSystemResourceMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedRamPercent = Math.round((usedMem / totalMem) * 100);

  return {
    totalMemMb: Math.round(totalMem / (1024 * 1024)),
    freeMemMb: Math.round(freeMem / (1024 * 1024)),
    usedRamPercent,
    cpuCount: os.cpus().length
  };
}

export function checkAndAutoOffload() {
  const metrics = getSystemResourceMetrics();
  sendToAll('hybrid-cloud:metrics', metrics);

  if (!hybridState.enabled || !hybridState.instanceIp) {
    if (hybridState.isOffloaded) {
      stopSshTunnel();
    }
    return;
  }

  const threshold = hybridState.criticalRamThreshold || 85;

  if (metrics.usedRamPercent >= threshold) {
    if (!hybridState.isOffloaded && !hybridState.activeTunnel) {
      startSshTunnel();
    }
  } else if (metrics.usedRamPercent < (threshold - 10)) {
    // Grace period to return to local when RAM usage normalizes
    if (hybridState.isOffloaded) {
      stopSshTunnel();
      notifyUser('Local RAM Normalized', 'RAM dropped below threshold. Retracting AI workload to local PC.', 'info');
    }
  }
}

export function registerOracleCloudHandlers() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  // Monitor RAM/CPU every 5 seconds
  monitorInterval = setInterval(checkAndAutoOffload, 5000);

  ipcMain.handle('hybrid-cloud:get-state', () => hybridState);
  ipcMain.handle('hybrid-cloud:update-config', (_evt, config) => {
    hybridState = { ...hybridState, ...config };
    if (hybridState.enabled) {
      checkAndAutoOffload();
    } else {
      stopSshTunnel();
    }
    return hybridState;
  });
  ipcMain.handle('hybrid-cloud:trigger-offload', async () => {
    return await startSshTunnel();
  });
  ipcMain.handle('hybrid-cloud:stop-offload', () => {
    stopSshTunnel();
    return hybridState;
  });
  ipcMain.handle('hybrid-cloud:get-metrics', () => getSystemResourceMetrics());
}

export function isHybridOffloaded() {
  return hybridState.isOffloaded && hybridState.activeTunnel;
}

export function getHybridTunnelHost() {
  const localPort = hybridState.localTunnelPort || 11435;
  return `http://127.0.0.1:${localPort}`;
}
