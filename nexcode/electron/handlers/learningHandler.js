import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'node:crypto';
import { getDatabase } from '../database.js';
import { ruleMatchesPrompt, triggerKey } from '../../src/utils/patternAnalyzer.js';

const rulePublishers = new Set();

function now() {
  return Date.now();
}

export function registerLearningRulePublisher(publisher) {
  if (typeof publisher === 'function') {
    rulePublishers.add(publisher);
  }
}

function json(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function mapRule(row) {
  return row
    ? {
        id: row.id,
        trigger: row.trigger,
        triggerKey: row.trigger_key,
        avoid: row.avoid,
        suggest: row.suggest,
        category: row.category,
        confidence: row.confidence,
        evidenceCount: row.evidence_count,
        source: row.source,
        originNodeId: row.origin_node_id,
        originName: row.origin_name,
        status: row.status,
        muted: Boolean(row.muted),
        conflict: Boolean(row.conflict),
        metadata: parseJson(row.metadata, {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;
}

function normalizeRule(rule = {}) {
  const trigger = String(rule.trigger || '').trim();
  const avoid = String(rule.avoid || '').trim();
  const suggest = String(rule.suggest || '').trim();
  if (trigger.length < 8 || avoid.length < 8 || suggest.length < 8) {
    throw new Error('Learning rule is too broad. Trigger, avoid, and suggest must be specific.');
  }
  const key = triggerKey(trigger);
  return {
    id: rule.id || crypto.createHash('sha256').update(`${key}|${avoid}|${suggest}|${rule.originNodeId || 'local'}`).digest('hex'),
    trigger,
    triggerKey: key,
    avoid,
    suggest,
    category: rule.category || 'manual',
    confidence: Math.max(0, Math.min(1, Number(rule.confidence ?? 0.7))),
    evidenceCount: Math.max(1, Number(rule.evidenceCount || rule.evidence_count || 1)),
    source: rule.source || 'local',
    originNodeId: rule.originNodeId || rule.origin_node_id || 'local',
    originName: rule.originName || rule.origin_name || 'Local',
    status: rule.status || 'active',
    muted: rule.muted ? 1 : 0,
    conflict: rule.conflict ? 1 : 0,
    metadata: rule.metadata || {},
    createdAt: rule.createdAt || rule.created_at || now(),
    updatedAt: rule.updatedAt || rule.updated_at || now()
  };
}

function markConflicts(database, rule) {
  const conflicts = database
    .prepare(
      `SELECT * FROM learned_rules
       WHERE trigger_key = ? AND id != ? AND status != 'deleted'
       ORDER BY updated_at DESC`
    )
    .all(rule.triggerKey, rule.id)
    .map(mapRule)
    .filter((existing) => existing.avoid !== rule.avoid || existing.suggest !== rule.suggest);
  if (!conflicts.length) return false;
  database.prepare('UPDATE learned_rules SET conflict = 1 WHERE trigger_key = ? AND status != ?').run(rule.triggerKey, 'deleted');
  rule.conflict = 1;
  return true;
}

export function initLearningDatabase() {
  const database = getDatabase();
  database.exec(`
    CREATE TABLE IF NOT EXISTS learned_rules (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL,
      trigger_key TEXT NOT NULL,
      avoid TEXT NOT NULL,
      suggest TEXT NOT NULL,
      category TEXT,
      confidence REAL DEFAULT 0.7,
      evidence_count INTEGER DEFAULT 1,
      source TEXT DEFAULT 'local',
      origin_node_id TEXT DEFAULT 'local',
      origin_name TEXT DEFAULT 'Local',
      status TEXT DEFAULT 'active',
      muted INTEGER DEFAULT 0,
      conflict INTEGER DEFAULT 0,
      metadata TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_learned_rules_trigger
    ON learned_rules (trigger_key, updated_at);

    CREATE INDEX IF NOT EXISTS idx_learned_rules_source
    ON learned_rules (source, origin_node_id, status);
  `);
}

export function upsertLearnedRule(rule = {}, options = {}) {
  initLearningDatabase();
  const database = getDatabase();
  const normalized = normalizeRule(rule);
  if (normalized.source === 'auto' && normalized.evidenceCount < 3 && !options.allowLowEvidence) {
    throw new Error('Automatic learning requires at least 3 matching failures.');
  }
  markConflicts(database, normalized);
  database
    .prepare(
      `INSERT INTO learned_rules
      (id, trigger, trigger_key, avoid, suggest, category, confidence, evidence_count,
       source, origin_node_id, origin_name, status, muted, conflict, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         trigger = excluded.trigger,
         trigger_key = excluded.trigger_key,
         avoid = excluded.avoid,
         suggest = excluded.suggest,
         category = excluded.category,
         confidence = excluded.confidence,
         evidence_count = MAX(learned_rules.evidence_count, excluded.evidence_count),
         source = excluded.source,
         origin_node_id = excluded.origin_node_id,
         origin_name = excluded.origin_name,
         status = excluded.status,
         muted = excluded.muted,
         conflict = MAX(learned_rules.conflict, excluded.conflict),
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`
    )
    .run(
      normalized.id,
      normalized.trigger,
      normalized.triggerKey,
      normalized.avoid,
      normalized.suggest,
      normalized.category,
      normalized.confidence,
      normalized.evidenceCount,
      normalized.source,
      normalized.originNodeId,
      normalized.originName,
      normalized.status,
      normalized.muted,
      normalized.conflict,
      json(normalized.metadata, {}),
      normalized.createdAt,
      normalized.updatedAt
    );
  const saved = getLearnedRule(normalized.id);
  sendToAll('learning:rules-updated', { rule: saved, reason: options.reason || 'upsert' });
  if (saved?.source !== 'shared' && saved?.status !== 'deleted') {
    rulePublishers.forEach((publisher) => {
      Promise.resolve(publisher(saved)).catch(() => {});
    });
  }
  return saved;
}

export function getLearnedRule(id) {
  return mapRule(getDatabase().prepare('SELECT * FROM learned_rules WHERE id = ?').get(id));
}

export function listLearnedRules({ includeDeleted = false, includeMuted = true, source = '' } = {}) {
  initLearningDatabase();
  const where = [];
  const params = [];
  if (!includeDeleted) {
    where.push("status != 'deleted'");
  }
  if (!includeMuted) {
    where.push('muted = 0');
  }
  if (source) {
    where.push('source = ?');
    params.push(source);
  }
  const sql = `SELECT * FROM learned_rules ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`;
  return getDatabase().prepare(sql).all(...params).map(mapRule);
}

export function updateLearnedRule(rule = {}) {
  const existing = getLearnedRule(rule.id);
  if (!existing) throw new Error('Learning rule not found.');
  return upsertLearnedRule({ ...existing, ...rule, updatedAt: now() }, { allowLowEvidence: true, reason: 'manual_update' });
}

export function deleteLearnedRule(id) {
  getDatabase().prepare("UPDATE learned_rules SET status = 'deleted', updated_at = ? WHERE id = ?").run(now(), id);
  sendToAll('learning:rules-updated', { id, reason: 'delete' });
  return { ok: true };
}

export function muteRulesByOrigin(originNodeId, muted = true) {
  getDatabase()
    .prepare('UPDATE learned_rules SET muted = ?, updated_at = ? WHERE origin_node_id = ?')
    .run(muted ? 1 : 0, now(), originNodeId);
  sendToAll('learning:rules-updated', { originNodeId, muted, reason: 'mute_origin' });
  return { ok: true };
}

export function findMatchingLearnedRules(prompt = '', { limit = 6 } = {}) {
  const candidates = listLearnedRules({ includeMuted: false }).filter((rule) => rule.status === 'active');
  const matches = candidates
    .filter((rule) => ruleMatchesPrompt(rule, prompt))
    .sort((a, b) => {
      if (a.triggerKey === b.triggerKey) return b.updatedAt - a.updatedAt;
      return (b.confidence || 0) - (a.confidence || 0);
    });
  const byTrigger = new Map();
  matches.forEach((rule) => {
    if (!byTrigger.has(rule.triggerKey)) {
      byTrigger.set(rule.triggerKey, rule);
    }
  });
  return [...byTrigger.values()].slice(0, limit);
}

export function learningContextForPrompt(prompt = '') {
  const rules = findMatchingLearnedRules(prompt);
  if (!rules.length) return '';
  return [
    '--- LEARNED LESSONS (Self-Correction Layer) ---',
    'Previous failed attempts detected:',
    ...rules.map((rule) => `- Rule: ${rule.trigger} -> Avoid ${rule.avoid}; use ${rule.suggest}.${rule.conflict ? ' Conflict warning: this rule has team/local disagreement; prefer the newest rule.' : ''}`),
    '-----------------------------------------------'
  ].join('\n');
}

export function learningStats() {
  initLearningDatabase();
  const database = getDatabase();
  const total = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE status != 'deleted'").get().count;
  const local = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE source != 'shared' AND status != 'deleted'").get().count;
  const shared = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE source = 'shared' AND status != 'deleted'").get().count;
  const muted = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE muted = 1 AND status != 'deleted'").get().count;
  const conflicts = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE conflict = 1 AND status != 'deleted'").get().count;
  const autoFixed = database.prepare("SELECT count(*) AS count FROM learned_rules WHERE source = 'auto' AND status != 'deleted'").get().count;
  const humanInterventions = database
    .prepare("SELECT count(*) AS count FROM approvals_log WHERE decision IN ('deny', 'denied', 'edited')")
    .get().count;
  return { total, local, shared, muted, conflicts, autoFixed, humanInterventions };
}

export function registerLearningHandlers() {
  initLearningDatabase();
  ipcMain.handle('learning:get-rules', async (_event, payload = {}) => listLearnedRules(payload));
  ipcMain.handle('learning:update-rule', async (_event, rule = {}) => updateLearnedRule(rule));
  ipcMain.handle('learning:delete-rule', async (_event, id) => deleteLearnedRule(id));
  ipcMain.handle('learning:get-stats', async () => learningStats());
  ipcMain.handle('learning:match-rules', async (_event, payload = {}) => findMatchingLearnedRules(payload.prompt || '', payload));
}
