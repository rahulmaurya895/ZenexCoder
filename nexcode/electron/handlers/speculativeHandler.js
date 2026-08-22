import { ipcMain } from 'electron';
import os from 'node:os';
import crypto from 'node:crypto';
import { abortSwarmRun, startSwarmRun } from './swarmHandler.js';
import { buildStylePromptPrefix, getStyleProfile } from './shadowAIHandler.js';

const activeShadowRuns = new Map();

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function hashIntent(payload = {}) {
  return crypto
    .createHash('sha1')
    .update(normalize([
      payload.intent?.intentType,
      payload.intent?.filePath,
      payload.intent?.lineNumber,
      payload.intent?.context,
      payload.prompt
    ].filter(Boolean).join('\n')))
    .digest('hex');
}

function loadPercent() {
  const [oneMinute] = os.loadavg();
  if (!oneMinute) return 0;
  return Math.min(100, Math.round((oneMinute / Math.max(1, os.cpus().length)) * 100));
}

function memoryUsedPercent() {
  const total = os.totalmem();
  if (!total) return 0;
  return Math.round(((total - os.freemem()) / total) * 100);
}

function resourceCheck(options = {}) {
  const cpu = loadPercent();
  const memory = memoryUsedPercent();
  const maxCpu = Number(options.maxCpuPercent || 70);
  const maxMemory = Number(options.maxMemoryPercent || 75);
  if (cpu > maxCpu) {
    return { ok: false, reason: `CPU load ${cpu}% is above ${maxCpu}%.`, cpu, memory };
  }
  if (memory > maxMemory) {
    return { ok: false, reason: `Memory use ${memory}% is above ${maxMemory}%.`, cpu, memory };
  }
  return { ok: true, cpu, memory };
}

function abortAllShadowRuns(reason = 'Speculative run aborted.') {
  for (const run of activeShadowRuns.values()) {
    abortSwarmRun(run.taskId, reason);
  }
  activeShadowRuns.clear();
}

export function registerSpeculativeHandlers() {
  ipcMain.handle('speculative:trigger', async (_event, payload = {}) => {
    if (!payload.enabled) {
      return { ok: false, skipped: true, reason: 'Predictive coding is disabled.' };
    }
    const triggerHash = payload.triggerHash || hashIntent(payload);
    const taskId = `shadow-${triggerHash}`;
    const resources = resourceCheck({
      maxCpuPercent: payload.maxCpuPercent,
      maxMemoryPercent: payload.maxMemoryPercent
    });
    if (!resources.ok) {
      return { ok: false, skipped: true, triggerHash, reason: resources.reason, resources };
    }

    abortAllShadowRuns('Superseded by a newer speculative trigger.');
    activeShadowRuns.set(triggerHash, { taskId, startedAt: Date.now() });
    try {
      const styleDirective = buildStylePromptPrefix(getStyleProfile());
      const styledPrompt = `${styleDirective}\n\n[USER TASK / CODE CONTEXT]\n${payload.prompt || ''}`;

      const result = startSwarmRun({
        ...payload,
        prompt: styledPrompt,
        taskId,
        triggerHash,
        isShadowRun: true,
        maxIterations: Math.min(Number(payload.maxIterations || 3), 3),
        maxTokens: Math.min(Number(payload.maxTokens || 2048), 2048),
        temperature: payload.temperature ?? 0.2
      });
      return { ...result, triggerHash, resources };
    } catch (error) {
      activeShadowRuns.delete(triggerHash);
      throw error;
    }
  });

  ipcMain.handle('speculative:abort', async (_event, payload = {}) => {
    if (payload.triggerHash) {
      const run = activeShadowRuns.get(payload.triggerHash);
      if (run) {
        abortSwarmRun(run.taskId, payload.reason || 'User resumed typing.');
        activeShadowRuns.delete(payload.triggerHash);
      }
      return { ok: true };
    }
    abortAllShadowRuns(payload.reason || 'User resumed typing.');
    return { ok: true };
  });
}
