import { BrowserWindow } from 'electron';

const monitors = new Map();
let rollbackHandler = null;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function emitLog(deploymentId, phase, message, level = 'info') {
  sendToAll('cicd:logs-stream', { deploymentId, phase, message, level, time: Date.now() });
}

async function probe(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - started, time: Date.now() };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: error.message, time: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(samples = []) {
  const recent = samples.slice(-20);
  const errors = recent.filter((item) => !item.ok).length;
  const avgLatency = recent.reduce((sum, item) => sum + item.latencyMs, 0) / Math.max(recent.length, 1);
  return {
    samples: recent.length,
    errorRate: recent.length ? errors / recent.length : 0,
    avgLatencyMs: Math.round(avgLatency),
    status: errors / Math.max(recent.length, 1) > 0.05 || avgLatency > 2000 ? 'unhealthy' : 'healthy'
  };
}

export function registerRollbackHandler(handler) {
  rollbackHandler = handler;
}

export async function runOneHealthCheck(url) {
  const sample = await probe(url);
  return { ...sample, ...summarize([sample]) };
}

export function registerDeploymentMonitor(deployment = {}) {
  if (!deployment.id || !deployment.healthUrl) return null;
  stopHealthMonitor(deployment.id);
  const state = { deployment, samples: [] };
  const tick = async () => {
    const sample = await probe(deployment.healthUrl);
    state.samples.push(sample);
    const health = summarize(state.samples);
    sendToAll('cicd:status-update', {
      status: health.status === 'healthy' ? 'monitoring' : 'unhealthy',
      phase: 'health-monitor',
      deployment: { ...deployment, status: health.status === 'healthy' ? 'monitoring' : 'unhealthy', health }
    });
    emitLog(deployment.id, 'health', `${deployment.healthUrl} ${sample.status || 'ERR'} in ${sample.latencyMs}ms`, sample.ok ? 'info' : 'warning');
    if (health.status === 'unhealthy') {
      emitLog(deployment.id, 'health', 'Health threshold failed; triggering rollback.', 'error');
      stopHealthMonitor(deployment.id);
      await rollbackHandler?.(deployment.id, 'health-monitor').catch((error) => {
        emitLog(deployment.id, 'rollback', error.message, 'error');
      });
    }
  };
  state.timer = setInterval(() => tick().catch(() => {}), 30000);
  state.timer.unref?.();
  monitors.set(deployment.id, state);
  tick().catch(() => {});
  return { ok: true, deploymentId: deployment.id };
}

export function stopHealthMonitor(deploymentId) {
  if (deploymentId) {
    const state = monitors.get(deploymentId);
    if (state?.timer) clearInterval(state.timer);
    monitors.delete(deploymentId);
    return;
  }
  for (const state of monitors.values()) {
    if (state.timer) clearInterval(state.timer);
  }
  monitors.clear();
}
