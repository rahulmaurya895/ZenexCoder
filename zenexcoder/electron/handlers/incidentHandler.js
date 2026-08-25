import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { listIncidents, upsertIncident } from '../database.js';
import { startAutoFix, takeOverAutoFix } from './autoFixer.js';

const STORE_FILE = 'zezenexcoderr-incidents.json';
const DEFAULT_SETTINGS = {
  pollingEnabled: false,
  autoHealEnabled: false,
  pollIntervalMinutes: 5,
  projectPath: '',
  baseBranch: '',
  modelProvider: '',
  modelId: '',
  sentry: {
    baseUrl: 'https://sentry.io',
    organizationSlug: '',
    projectSlug: '',
    token: ''
  },
  datadog: {
    apiUrl: '',
    apiKey: '',
    appKey: ''
  },
  generic: {
    apiUrl: '',
    token: '',
    tokenHeader: 'Authorization'
  }
};

let pollTimer = null;
let polling = false;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function notify(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `incident-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function encryptedPayload(value) {
  const serialized = JSON.stringify(value ?? {});
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
  } catch {
    return null;
  }
  return null;
}

function mergeSettings(current, patch = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...current,
    ...patch,
    sentry: {
      ...DEFAULT_SETTINGS.sentry,
      ...(current.sentry || {}),
      ...(patch.sentry || {}),
      token: patch.sentry?.token ? patch.sentry.token : current.sentry?.token || ''
    },
    datadog: {
      ...DEFAULT_SETTINGS.datadog,
      ...(current.datadog || {}),
      ...(patch.datadog || {}),
      apiKey: patch.datadog?.apiKey ? patch.datadog.apiKey : current.datadog?.apiKey || '',
      appKey: patch.datadog?.appKey ? patch.datadog.appKey : current.datadog?.appKey || ''
    },
    generic: {
      ...DEFAULT_SETTINGS.generic,
      ...(current.generic || {}),
      ...(patch.generic || {}),
      token: patch.generic?.token ? patch.generic.token : current.generic?.token || ''
    },
    pollIntervalMinutes: Math.max(1, Number(patch.pollIntervalMinutes ?? current.pollIntervalMinutes ?? 5))
  };
}

function publicSettings(settings) {
  const merged = mergeSettings(DEFAULT_SETTINGS, settings);
  return {
    ...merged,
    sentry: {
      ...merged.sentry,
      token: '',
      hasToken: Boolean(merged.sentry.token)
    },
    datadog: {
      ...merged.datadog,
      apiKey: '',
      appKey: '',
      hasApiKey: Boolean(merged.datadog.apiKey),
      hasAppKey: Boolean(merged.datadog.appKey)
    },
    generic: {
      ...merged.generic,
      token: '',
      hasToken: Boolean(merged.generic.token)
    }
  };
}

async function readSettings() {
  try {
    const store = JSON.parse(await fs.readFile(storePath(), 'utf8'));
    return mergeSettings(DEFAULT_SETTINGS, decryptedPayload(store.settings) || {});
  } catch {
    return mergeSettings(DEFAULT_SETTINGS, {});
  }
}

async function writeSettings(settings) {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify({ settings: encryptedPayload(settings) }, null, 2), 'utf8');
}

function hashPayload(provider, payload) {
  return `${provider}:${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 14)}`;
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function compact(value, limit = 12000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n... [trimmed]` : text;
}

function stackFromSentryEvent(event = {}) {
  const entries = event.entries || [];
  const exception = entries.find((entry) => entry.type === 'exception');
  const values = exception?.data?.values || [];
  const traces = values.map((value) => {
    const frames = value.stacktrace?.frames || [];
    const frameText = frames
      .slice(-24)
      .reverse()
      .map((frame) => {
        const file = frame.absPath || frame.filename || frame.module || 'unknown';
        const line = [frame.lineno, frame.colno].filter(Boolean).join(':');
        const fn = frame.function || '<anonymous>';
        const contextLine = frame.contextLine ? `\n    ${frame.contextLine}` : '';
        return `at ${fn} (${file}${line ? `:${line}` : ''})${contextLine}`;
      })
      .join('\n');
    return [`${value.type || 'Error'}: ${value.value || ''}`, frameText].filter(Boolean).join('\n');
  });
  return compact(traces.join('\n\n') || event.title || event.message || '');
}

async function fetchSentryStack(settings, issueId) {
  const baseUrl = (settings.sentry.baseUrl || 'https://sentry.io').replace(/\/+$/, '');
  try {
    const response = await axios.get(`${baseUrl}/api/0/issues/${encodeURIComponent(issueId)}/events/latest/`, {
      headers: {
        Authorization: `Bearer ${settings.sentry.token}`,
        Accept: 'application/json'
      },
      timeout: 20000
    });
    return stackFromSentryEvent(response.data);
  } catch {
    return '';
  }
}

async function fetchSentryIssues(settings) {
  if (!settings.sentry.token || !settings.sentry.organizationSlug || !settings.sentry.projectSlug) {
    return [];
  }
  const baseUrl = (settings.sentry.baseUrl || 'https://sentry.io').replace(/\/+$/, '');
  const url = `${baseUrl}/api/0/projects/${encodeURIComponent(settings.sentry.organizationSlug)}/${encodeURIComponent(settings.sentry.projectSlug)}/issues/`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${settings.sentry.token}`,
      Accept: 'application/json'
    },
    params: {
      query: 'is:unresolved',
      limit: 25,
      statsPeriod: '24h'
    },
    timeout: 20000
  });

  const issues = Array.isArray(response.data) ? response.data : [];
  const mapped = [];
  for (const issue of issues) {
    const stackTrace = await fetchSentryStack(settings, issue.id);
    mapped.push({
      id: `sentry:${issue.id}`,
      provider: 'sentry',
      externalId: String(issue.id),
      title: issue.title || issue.shortId || 'Sentry issue',
      stackTrace: stackTrace || compact(issue.metadata || issue.culprit || issue.title || ''),
      url: issue.permalink || issue.url || '',
      severity: issue.level || issue.metadata?.type || 'error',
      status: 'fetched',
      projectPath: settings.projectPath || '',
      sourcePayload: issue,
      firstSeen: timestamp(issue.firstSeen),
      lastSeen: timestamp(issue.lastSeen || issue.firstSeen)
    });
  }
  return mapped;
}

function mapDatadogItem(item, settings) {
  const attributes = item.attributes || item;
  const title = attributes.message || attributes.title || attributes.error?.message || item.message || 'Datadog error';
  return {
    id: item.id ? `datadog:${item.id}` : hashPayload('datadog', item),
    provider: 'datadog',
    externalId: String(item.id || ''),
    title,
    stackTrace: compact(attributes.stack || attributes.stackTrace || attributes.error?.stack || attributes.error || item),
    url: attributes.url || attributes.link || '',
    severity: attributes.status || attributes.level || 'error',
    status: 'fetched',
    projectPath: settings.projectPath || '',
    sourcePayload: item,
    firstSeen: timestamp(attributes.timestamp || attributes.firstSeen),
    lastSeen: timestamp(attributes.lastSeen || attributes.timestamp)
  };
}

async function fetchDatadogIssues(settings) {
  if (!settings.datadog.apiUrl || !settings.datadog.apiKey) return [];
  const headers = {
    'DD-API-KEY': settings.datadog.apiKey,
    Accept: 'application/json'
  };
  if (settings.datadog.appKey) headers['DD-APPLICATION-KEY'] = settings.datadog.appKey;
  const response = await axios.get(settings.datadog.apiUrl, { headers, timeout: 20000 });
  const data = response.data?.errors || response.data?.data || response.data;
  return (Array.isArray(data) ? data : []).map((item) => mapDatadogItem(item, settings));
}

function mapGenericItem(item, settings) {
  const title = item.title || item.message || item.error || 'Production error';
  return {
    id: item.id ? `generic:${item.id}` : hashPayload('generic', item),
    provider: 'generic',
    externalId: String(item.id || ''),
    title,
    stackTrace: compact(item.stackTrace || item.stack || item.trace || item),
    url: item.url || item.link || '',
    severity: item.severity || item.level || 'error',
    status: 'fetched',
    projectPath: settings.projectPath || '',
    sourcePayload: item,
    firstSeen: timestamp(item.timestamp || item.firstSeen),
    lastSeen: timestamp(item.lastSeen || item.timestamp)
  };
}

async function fetchGenericIssues(settings) {
  if (!settings.generic.apiUrl) return [];
  const headers = { Accept: 'application/json' };
  if (settings.generic.token) {
    const header = settings.generic.tokenHeader || 'Authorization';
    headers[header] = header.toLowerCase() === 'authorization' ? `Bearer ${settings.generic.token}` : settings.generic.token;
  }
  const response = await axios.get(settings.generic.apiUrl, { headers, timeout: 20000 });
  const data = response.data?.errors || response.data?.incidents || response.data?.data || response.data;
  return (Array.isArray(data) ? data : []).map((item) => mapGenericItem(item, settings));
}

function mockIncident(settings, payload = {}) {
  const timestampValue = Date.now();
  return {
    id: payload.id || `mock:${timestampValue}`,
    provider: 'mock',
    externalId: String(payload.externalId || timestampValue),
    title: payload.title || 'TypeError: Cannot read properties of undefined',
    stackTrace:
      payload.stackTrace ||
      'TypeError: Cannot read properties of undefined\n    at getUserSession (src/auth/session.js:42:17)\n    at async GET (src/routes/api/me.js:11:12)',
    url: payload.url || '',
    severity: 'error',
    status: 'fetched',
    projectPath: settings.projectPath || '',
    sourcePayload: payload,
    firstSeen: timestampValue,
    lastSeen: timestampValue
  };
}

function emitNewIncident(incident) {
  sendToAll('incident:new-alert', { incidentData: incident, incident });
  notify('Production incident received', incident.title, incident.severity === 'warning' ? 'warning' : 'error');
}

async function processIncidents(settings, incidents = [], options = {}) {
  const saved = [];
  for (const incidentData of incidents) {
    const { incident, isNew } = upsertIncident(incidentData);
    saved.push(incident);
    if (isNew || options.forceEmit) {
      emitNewIncident(incident);
      if (settings.autoHealEnabled || options.autoHeal) {
        startAutoFix(incident, settings).catch((error) => {
          sendToAll('incident:healing-status', {
            incidentId: incident.id,
            step: 'manual',
            status: 'failed',
            message: error.message,
            incident,
            timestamp: Date.now()
          });
        });
      }
    }
  }
  return saved;
}

export async function pollTelemetry(options = {}) {
  if (polling) {
    return { ok: true, skipped: true, incidents: [] };
  }
  polling = true;
  try {
    const settings = await readSettings();
    if (options.mockIncident) {
      const incidents = await processIncidents(settings, [mockIncident(settings, options.mockIncident)], {
        forceEmit: true,
        autoHeal: options.autoHeal
      });
      return { ok: true, incidents };
    }

    const groups = await Promise.allSettled([
      fetchSentryIssues(settings),
      fetchDatadogIssues(settings),
      fetchGenericIssues(settings)
    ]);
    const incidents = groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []));
    const saved = await processIncidents(settings, incidents);
    const failures = groups
      .filter((group) => group.status === 'rejected')
      .map((group) => group.reason?.message || 'Telemetry fetch failed.');
    if (failures.length) {
      notify('Telemetry fetch warning', failures.join('\n').slice(0, 240), 'warning');
    }
    return { ok: true, incidents: saved, failures };
  } finally {
    polling = false;
  }
}

function restartPolling(settings) {
  stopIncidentPolling();
  if (!settings.pollingEnabled) return;
  const intervalMs = Math.max(60000, Number(settings.pollIntervalMinutes || 5) * 60 * 1000);
  pollTimer = setInterval(() => {
    pollTelemetry().catch((error) => notify('Telemetry polling failed', error.message, 'warning'));
  }, intervalMs);
}

export function stopIncidentPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function registerIncidentHandlers() {
  ipcMain.handle('incident:list', async () => listIncidents());
  ipcMain.handle('incident:settings:get', async () => publicSettings(await readSettings()));
  ipcMain.handle('incident:settings:save', async (_event, patch = {}) => {
    const current = await readSettings();
    const next = mergeSettings(current, patch);
    await writeSettings(next);
    restartPolling(next);
    return publicSettings(next);
  });
  ipcMain.handle('incident:fetch-manual', async (_event, payload = {}) => pollTelemetry(payload));
  ipcMain.handle('incident:start-healing', async (_event, payload = {}) => {
    const incident = listIncidents().find((item) => item.id === payload.incidentId);
    if (!incident) throw new Error('Incident not found.');
    const settings = await readSettings();
    startAutoFix(incident, settings).catch(() => {});
    return { ok: true };
  });
  ipcMain.handle('auto-fix:take-over', async (_event, payload = {}) => takeOverAutoFix(payload.incidentId));

  readSettings().then((settings) => restartPolling(settings)).catch(() => {});
}
