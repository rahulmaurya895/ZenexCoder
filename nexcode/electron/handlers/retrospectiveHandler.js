import { BrowserWindow, ipcMain } from 'electron';
import { getDatabase } from '../database.js';
import { analyzeFailurePatterns } from '../../src/utils/patternAnalyzer.js';
import { upsertLearnedRule } from './learningHandler.js';

const ANALYSIS_INTERVAL_MS = 10 * 60 * 1000;
let analysisTimer = null;
let analysisQueued = false;
let running = false;
let lastAnalysis = {
  analyzedAt: 0,
  rulesCreated: 0,
  scannedApprovals: 0,
  scannedChanges: 0,
  error: ''
};

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function fetchFailures() {
  const db = getDatabase();
  const approvals = db
    .prepare(
      `SELECT * FROM approvals_log
       WHERE decision IN ('deny', 'denied', 'rejected', 'edited')
       ORDER BY created_at DESC
       LIMIT 250`
    )
    .all();
  const changes = db
    .prepare(
      `SELECT * FROM change_records
       WHERE status IN ('reverted', 'rejected')
       ORDER BY created_at DESC
       LIMIT 250`
    )
    .all();
  return { approvals, changes };
}

export async function triggerRetrospectiveAnalysis(reason = 'manual') {
  if (running) {
    analysisQueued = true;
    return { ...lastAnalysis, queued: true };
  }
  running = true;
  try {
    const { approvals, changes } = fetchFailures();
    const learned = [];
    const rules = analyzeFailurePatterns({ approvals, changes, minEvidence: 3 });
    for (const rule of rules) {
      const saved = upsertLearnedRule(
        {
          ...rule,
          source: 'auto',
          originNodeId: 'local',
          originName: 'Local retrospective',
          metadata: {
            evidence: rule.evidence,
            analysisReason: reason,
            generatedAt: Date.now()
          }
        },
        { reason: 'retrospective' }
      );
      learned.push(saved);
    }
    lastAnalysis = {
      analyzedAt: Date.now(),
      rulesCreated: learned.length,
      scannedApprovals: approvals.length,
      scannedChanges: changes.length,
      error: ''
    };
    sendToAll('learning:analysis-complete', { ...lastAnalysis, rules: learned });
    return { ...lastAnalysis, rules: learned };
  } catch (error) {
    lastAnalysis = {
      ...lastAnalysis,
      analyzedAt: Date.now(),
      error: error.message
    };
    sendToAll('learning:analysis-complete', lastAnalysis);
    return lastAnalysis;
  } finally {
    running = false;
    if (analysisQueued) {
      analysisQueued = false;
      setTimeout(() => triggerRetrospectiveAnalysis('queued').catch(() => {}), 1000);
    }
  }
}

export function queueRetrospectiveAnalysis(reason = 'queued') {
  if (analysisQueued) return;
  analysisQueued = true;
  setTimeout(() => {
    analysisQueued = false;
    triggerRetrospectiveAnalysis(reason).catch(() => {});
  }, 1500);
}

export function startRetrospectiveWorker() {
  stopRetrospectiveWorker();
  analysisTimer = setInterval(() => {
    triggerRetrospectiveAnalysis('interval').catch(() => {});
  }, ANALYSIS_INTERVAL_MS);
  setTimeout(() => triggerRetrospectiveAnalysis('startup').catch(() => {}), 5000);
}

export function stopRetrospectiveWorker() {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
}

export function registerRetrospectiveHandlers() {
  ipcMain.handle('learning:trigger-analysis', async () => triggerRetrospectiveAnalysis('manual'));
  ipcMain.handle('learning:get-analysis-state', async () => lastAnalysis);
}
