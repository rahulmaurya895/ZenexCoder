import Database from 'better-sqlite3';
import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { notifyGitStatusChanged } from './handlers/gitHandler.js';

let db;
const automationTimers = new Map();

function now() {
  return Date.now();
}

function json(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapSession(row) {
  return row
    ? {
        id: row.id,
        title: row.title,
        modelProvider: row.model_provider,
        modelId: row.model_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;
}

function mapMessage(row) {
  return row
    ? {
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        attachments: parseJson(row.attachments, []),
        modelId: row.model_id,
        tokensUsed: row.tokens_used,
        createdAt: row.created_at
      }
    : null;
}

function mapChangeRecord(row) {
  return row
    ? {
        id: row.id,
        sessionId: row.session_id,
        stepId: row.step_id,
        messageId: row.message_id,
        filePath: row.file_path,
        beforeContent: row.before_content,
        afterContent: row.after_content,
        explanation: row.explanation,
        status: row.status,
        createdAt: row.created_at
      }
    : null;
}

function mapAutomation(row) {
  return row
    ? {
        id: row.id,
        name: row.name,
        triggerType: row.trigger_type,
        triggerParams: parseJson(row.trigger_params, {}),
        promptTemplate: row.prompt_template,
        permissionMode: row.permission_mode,
        enabled: Boolean(row.enabled),
        lastRun: row.last_run,
        runCount: row.run_count
      }
    : null;
}

function mapIncident(row) {
  return row
    ? {
        id: row.id,
        provider: row.provider,
        externalId: row.external_id,
        title: row.title,
        stackTrace: row.stack_trace,
        url: row.url,
        severity: row.severity,
        status: row.status,
        projectPath: row.project_path,
        branchName: row.branch_name,
        worktreePath: row.worktree_path,
        prUrl: row.pr_url,
        prNumber: row.pr_number,
        sourcePayload: parseJson(row.source_payload, {}),
        healingLog: parseJson(row.healing_log, []),
        attempts: row.attempts || 0,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    : null;
}

function ensureDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

export function getDatabase() {
  return ensureDb();
}

function trimAuditTables() {
  if (!db) return;
  db.exec(`
    DELETE FROM approvals_log
    WHERE id NOT IN (
      SELECT id FROM approvals_log ORDER BY created_at DESC LIMIT 1000
    );

    DELETE FROM change_records
    WHERE id NOT IN (
      SELECT id FROM change_records ORDER BY created_at DESC LIMIT 1000
    );
  `);
}

export function initDatabase() {
  const dbDir = path.join(app.getPath('userData'), 'database');
  fs.mkdirSync(dbDir, { recursive: true });
  db = new Database(path.join(dbDir, 'zezenexcoderr.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model_provider TEXT,
      model_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      model_id TEXT,
      tokens_used INTEGER,
      created_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_opened INTEGER,
      settings TEXT
    );

    CREATE TABLE IF NOT EXISTS snippet_history (
      id TEXT PRIMARY KEY,
      type TEXT,
      input_code TEXT,
      output_code TEXT,
      language TEXT,
      model_used TEXT,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_created
    ON messages (session_id, created_at);

    CREATE TABLE IF NOT EXISTS change_records (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      step_id TEXT,
      message_id TEXT,
      file_path TEXT NOT NULL,
      before_content TEXT,
      after_content TEXT,
      explanation TEXT,
      status TEXT DEFAULT 'pending_review',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS approvals_log (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      action_type TEXT,
      description TEXT,
      decision TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_params TEXT,
      prompt_template TEXT,
      permission_mode TEXT,
      enabled INTEGER DEFAULT 1,
      last_run INTEGER,
      run_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      stack_trace TEXT,
      url TEXT,
      severity TEXT,
      status TEXT DEFAULT 'fetched',
      project_path TEXT,
      branch_name TEXT,
      worktree_path TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      source_payload TEXT,
      healing_log TEXT,
      attempts INTEGER DEFAULT 0,
      first_seen INTEGER,
      last_seen INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_change_records_status
    ON change_records (status, created_at);

    CREATE INDEX IF NOT EXISTS idx_incidents_status
    ON incidents (status, updated_at);

    CREATE INDEX IF NOT EXISTS idx_incidents_provider_external
    ON incidents (provider, external_id);
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      message_id UNINDEXED
    );

    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, session_id, message_id)
      VALUES (new.rowid, new.content, new.session_id, new.id);
    END;

    DROP TRIGGER IF EXISTS messages_ad;
    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, session_id, message_id)
      VALUES ('delete', old.rowid, old.content, old.session_id, old.id);
      INSERT INTO messages_fts(rowid, content, session_id, message_id)
      VALUES (new.rowid, new.content, new.session_id, new.id);
    END;
  `);

  const ftsCount = db.prepare('SELECT count(*) AS count FROM messages_fts').get().count;
  if (!ftsCount) {
    db.prepare(
      `INSERT INTO messages_fts(rowid, content, session_id, message_id)
       SELECT rowid, content, session_id, id FROM messages`
    ).run();
  }

  trimAuditTables();
  scheduleAutomations();
  return db;
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function clearAutomationTimers() {
  automationTimers.forEach((timer) => clearInterval(timer));
  automationTimers.clear();
}

export function shutdownDatabase() {
  clearAutomationTimers();
  if (db) {
    db.close();
    db = null;
  }
}

export function wipeAllDatabaseData() {
  const database = ensureDb();
  database.exec(`
    DELETE FROM messages;
    DELETE FROM chat_sessions;
    DELETE FROM change_records;
    DELETE FROM approvals_log;
    DELETE FROM automations;
    DELETE FROM incidents;
    DELETE FROM snippet_history;
    DELETE FROM projects;
  `);
  try {
    database.exec('DELETE FROM messages_fts;');
  } catch {}
}


function scheduleAutomations() {
  if (!db) return;
  clearAutomationTimers();
  const rows = db
    .prepare("SELECT * FROM automations WHERE enabled = 1 AND trigger_type = 'on_schedule'")
    .all();
  rows.forEach((row) => {
    const automation = mapAutomation(row);
    const minutes = Math.max(1, Number(automation.triggerParams?.intervalMinutes || 30));
    const timer = setInterval(() => {
      sendToAll('automation:trigger', {
        id: automation.id,
        context: { source: 'schedule', triggeredAt: Date.now() }
      });
    }, minutes * 60 * 1000);
    automationTimers.set(automation.id, timer);
  });
}

export function addChangeRecord(payload = {}) {
  const id = payload.id || crypto.randomUUID();
  ensureDb()
    .prepare(
      `INSERT INTO change_records
      (id, session_id, step_id, message_id, file_path, before_content,
       after_content, explanation, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      payload.sessionId || null,
      payload.stepId || null,
      payload.messageId || null,
      payload.filePath,
      payload.beforeContent || '',
      payload.afterContent || '',
      payload.explanation || '',
      payload.status || 'pending_review',
      now()
    );
  const record = mapChangeRecord(ensureDb().prepare('SELECT * FROM change_records WHERE id = ?').get(id));
  sendToAll('review:update', record);
  return record;
}

export function logApproval(payload = {}) {
  const id = payload.id || crypto.randomUUID();
  ensureDb()
    .prepare(
      `INSERT INTO approvals_log
      (id, session_id, action_type, description, decision, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      payload.sessionId || null,
      payload.actionType || '',
      payload.description || '',
      payload.decision || 'approved',
      now()
    );
  return { id, ok: true };
}

export function upsertIncident(payload = {}) {
  const database = ensureDb();
  const id = String(payload.id || `${payload.provider || 'generic'}:${payload.externalId || crypto.randomUUID()}`);
  const existing = mapIncident(database.prepare('SELECT * FROM incidents WHERE id = ?').get(id));
  const timestamp = now();
  const incident = {
    id,
    provider: payload.provider ?? existing?.provider ?? 'generic',
    externalId: payload.externalId ?? existing?.externalId ?? id,
    title: payload.title ?? existing?.title ?? 'Production incident',
    stackTrace: payload.stackTrace ?? existing?.stackTrace ?? '',
    url: payload.url ?? existing?.url ?? '',
    severity: payload.severity ?? existing?.severity ?? 'error',
    status: payload.status ?? existing?.status ?? 'fetched',
    projectPath: payload.projectPath ?? existing?.projectPath ?? '',
    branchName: payload.branchName ?? existing?.branchName ?? '',
    worktreePath: payload.worktreePath ?? existing?.worktreePath ?? '',
    prUrl: payload.prUrl ?? existing?.prUrl ?? '',
    prNumber: payload.prNumber ?? existing?.prNumber ?? null,
    sourcePayload: payload.sourcePayload ?? existing?.sourcePayload ?? {},
    healingLog: payload.healingLog ?? existing?.healingLog ?? [],
    attempts: payload.attempts ?? existing?.attempts ?? 0,
    firstSeen: payload.firstSeen ?? existing?.firstSeen ?? timestamp,
    lastSeen: payload.lastSeen ?? timestamp,
    createdAt: existing?.createdAt ?? payload.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  database
    .prepare(
      `INSERT INTO incidents
      (id, provider, external_id, title, stack_trace, url, severity, status,
       project_path, branch_name, worktree_path, pr_url, pr_number,
       source_payload, healing_log, attempts, first_seen, last_seen, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         external_id = excluded.external_id,
         title = excluded.title,
         stack_trace = excluded.stack_trace,
         url = excluded.url,
         severity = excluded.severity,
         status = excluded.status,
         project_path = excluded.project_path,
         branch_name = excluded.branch_name,
         worktree_path = excluded.worktree_path,
         pr_url = excluded.pr_url,
         pr_number = excluded.pr_number,
         source_payload = excluded.source_payload,
         healing_log = excluded.healing_log,
         attempts = excluded.attempts,
         first_seen = excluded.first_seen,
         last_seen = excluded.last_seen,
         updated_at = excluded.updated_at`
    )
    .run(
      incident.id,
      incident.provider,
      incident.externalId,
      incident.title,
      incident.stackTrace,
      incident.url,
      incident.severity,
      incident.status,
      incident.projectPath,
      incident.branchName,
      incident.worktreePath,
      incident.prUrl,
      incident.prNumber,
      json(incident.sourcePayload, {}),
      json(incident.healingLog, []),
      incident.attempts,
      incident.firstSeen,
      incident.lastSeen,
      incident.createdAt,
      incident.updatedAt
    );

  return {
    incident: mapIncident(database.prepare('SELECT * FROM incidents WHERE id = ?').get(id)),
    isNew: !existing
  };
}

export function listIncidents(status = null) {
  const database = ensureDb();
  const sql = status
    ? 'SELECT * FROM incidents WHERE status = ? ORDER BY updated_at DESC'
    : 'SELECT * FROM incidents ORDER BY updated_at DESC';
  const rows = status ? database.prepare(sql).all(status) : database.prepare(sql).all();
  return rows.map(mapIncident);
}

export function getIncident(id) {
  return mapIncident(ensureDb().prepare('SELECT * FROM incidents WHERE id = ?').get(id));
}

export function updateIncident(id, patch = {}) {
  const existing = getIncident(id);
  if (!existing) {
    throw new Error('Incident not found.');
  }
  return upsertIncident({ ...existing, ...patch, id }).incident;
}

export function appendIncidentLog(id, entry = {}) {
  const existing = getIncident(id);
  if (!existing) {
    throw new Error('Incident not found.');
  }
  const healingLog = [
    ...(existing.healingLog || []),
    {
      status: entry.status || 'info',
      step: entry.step || 'update',
      message: entry.message || '',
      timestamp: entry.timestamp || now()
    }
  ].slice(-120);
  return updateIncident(id, { healingLog, status: entry.incidentStatus || existing.status });
}

export function registerDatabaseHandlers() {
  ipcMain.handle('db:chat:list-sessions', async () => {
    try {
      return ensureDb()
        .prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
        .all()
        .map(mapSession);
    } catch (error) {
      throw new Error(`Unable to list chat sessions: ${error.message}`);
    }
  });

  ipcMain.handle('db:chat:create-session', async (_event, payload = {}) => {
    try {
      const id = payload.id || crypto.randomUUID();
      const createdAt = now();
      ensureDb()
        .prepare(
          `INSERT INTO chat_sessions
          (id, title, model_provider, model_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          payload.title || 'New Chat',
          payload.modelProvider || 'ollama',
          payload.modelId || 'llama3.2:3b',
          createdAt,
          createdAt
        );
      return mapSession(
        ensureDb().prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id)
      );
    } catch (error) {
      throw new Error(`Unable to create chat session: ${error.message}`);
    }
  });

  ipcMain.handle('db:chat:update-session', async (_event, payload = {}) => {
    try {
      ensureDb()
        .prepare(
          `UPDATE chat_sessions
          SET title = COALESCE(?, title),
              model_provider = COALESCE(?, model_provider),
              model_id = COALESCE(?, model_id),
              updated_at = ?
          WHERE id = ?`
        )
        .run(
          payload.title ?? null,
          payload.modelProvider ?? null,
          payload.modelId ?? null,
          now(),
          payload.id
        );
      return mapSession(
        ensureDb().prepare('SELECT * FROM chat_sessions WHERE id = ?').get(payload.id)
      );
    } catch (error) {
      throw new Error(`Unable to update chat session: ${error.message}`);
    }
  });

  ipcMain.handle('db:chat:delete-session', async (_event, id) => {
    try {
      const database = ensureDb();
      const tx = database.transaction(() => {
        database.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
        database.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
      });
      tx();
      return { ok: true };
    } catch (error) {
      console.error('db:chat:delete-session error:', error);
      try {
        ensureDb().prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
      } catch {}
      return { ok: true };
    }
  });


  ipcMain.handle('db:chat:list-messages', async (_event, sessionId) => {
    try {
      return ensureDb()
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
        .all(sessionId)
        .map(mapMessage);
    } catch (error) {
      throw new Error(`Unable to list messages: ${error.message}`);
    }
  });

  ipcMain.handle('db:chat:add-message', async (_event, payload = {}) => {
    try {
      const id = payload.id || crypto.randomUUID();
      const createdAt = now();
      const database = ensureDb();
      const tx = database.transaction(() => {
        database
          .prepare(
            `INSERT INTO messages
            (id, session_id, role, content, attachments, model_id, tokens_used, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            payload.sessionId,
            payload.role,
            payload.content || '',
            json(payload.attachments, []),
            payload.modelId || null,
            payload.tokensUsed || 0,
            createdAt
          );
        database
          .prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?')
          .run(createdAt, payload.sessionId);
      });
      tx();
      return mapMessage(database.prepare('SELECT * FROM messages WHERE id = ?').get(id));
    } catch (error) {
      throw new Error(`Unable to save message: ${error.message}`);
    }
  });

  ipcMain.handle('db:projects:upsert', async (_event, payload = {}) => {
    try {
      const id = payload.id || crypto.createHash('sha1').update(payload.path).digest('hex');
      ensureDb()
        .prepare(
          `INSERT INTO projects (id, name, path, last_opened, settings)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             name = excluded.name,
             last_opened = excluded.last_opened,
             settings = COALESCE(excluded.settings, projects.settings)`
        )
        .run(
          id,
          payload.name || path.basename(payload.path),
          payload.path,
          now(),
          payload.settings === undefined ? null : json(payload.settings, {})
        );
      return { id, ok: true };
    } catch (error) {
      throw new Error(`Unable to save project: ${error.message}`);
    }
  });

  ipcMain.handle('db:projects:list', async () => {
    try {
      return ensureDb()
        .prepare('SELECT * FROM projects ORDER BY last_opened DESC')
        .all()
        .map((row) => ({
          id: row.id,
          name: row.name,
          path: row.path,
          lastOpened: row.last_opened,
          settings: parseJson(row.settings, {})
        }));
    } catch (error) {
      throw new Error(`Unable to list projects: ${error.message}`);
    }
  });

  ipcMain.handle('db:snippet:add', async (_event, payload = {}) => {
    try {
      const id = payload.id || crypto.randomUUID();
      ensureDb()
        .prepare(
          `INSERT INTO snippet_history
          (id, type, input_code, output_code, language, model_used, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          payload.type || 'generation',
          payload.inputCode || '',
          payload.outputCode || '',
          payload.language || '',
          payload.modelUsed || '',
          now()
        );
      return { id, ok: true };
    } catch (error) {
      throw new Error(`Unable to save snippet history: ${error.message}`);
    }
  });

  ipcMain.handle('db:snippet:list', async () => {
    try {
      return ensureDb()
        .prepare('SELECT * FROM snippet_history ORDER BY created_at DESC')
        .all()
        .map((row) => ({
          id: row.id,
          type: row.type,
          inputCode: row.input_code,
          outputCode: row.output_code,
          language: row.language,
          modelUsed: row.model_used,
          createdAt: row.created_at
        }));
    } catch (error) {
      throw new Error(`Unable to list snippet history: ${error.message}`);
    }
  });

  ipcMain.handle('review:list', async (_event, status = null) => {
    try {
      const sql = status
        ? 'SELECT * FROM change_records WHERE status = ? ORDER BY created_at DESC'
        : 'SELECT * FROM change_records ORDER BY created_at DESC';
      const rows = status ? ensureDb().prepare(sql).all(status) : ensureDb().prepare(sql).all();
      return rows.map(mapChangeRecord);
    } catch (error) {
      throw new Error(`Unable to list review records: ${error.message}`);
    }
  });

  ipcMain.handle('review:add', async (_event, payload = {}) => {
    try {
      return addChangeRecord(payload);
    } catch (error) {
      throw new Error(`Unable to add review record: ${error.message}`);
    }
  });

  ipcMain.handle('review:action', async (_event, payload = {}) => {
    try {
      const record = mapChangeRecord(
        ensureDb().prepare('SELECT * FROM change_records WHERE id = ?').get(payload.id)
      );
      if (!record) {
        throw new Error('Review record not found.');
      }
      let status = record.status;
      if (payload.action === 'mark_reviewed' || payload.action === 'apply') {
        status = 'reviewed';
      }
      if (payload.action === 'reject') {
        status = 'rejected';
      }
      if (payload.action === 'revert') {
        fs.writeFileSync(record.filePath, record.beforeContent || '', 'utf8');
        sendToAll('file:saved', {
          filePath: record.filePath,
          content: record.beforeContent || '',
          savedAt: now()
        });
        notifyGitStatusChanged(record.filePath);
        status = 'reverted';
      }
      ensureDb().prepare('UPDATE change_records SET status = ? WHERE id = ?').run(status, payload.id);
      const updated = mapChangeRecord(
        ensureDb().prepare('SELECT * FROM change_records WHERE id = ?').get(payload.id)
      );
      sendToAll('review:update', updated);
      return updated;
    } catch (error) {
      throw new Error(`Unable to update review record: ${error.message}`);
    }
  });

  ipcMain.handle('approvals:log', async (_event, payload = {}) => {
    try {
      return logApproval(payload);
    } catch (error) {
      throw new Error(`Unable to log approval: ${error.message}`);
    }
  });

  ipcMain.handle('automation:list', async () => {
    try {
      return ensureDb()
        .prepare('SELECT * FROM automations ORDER BY name ASC')
        .all()
        .map(mapAutomation);
    } catch (error) {
      throw new Error(`Unable to list automations: ${error.message}`);
    }
  });

  ipcMain.handle('automation:save', async (_event, payload = {}) => {
    try {
      const id = payload.id || crypto.randomUUID();
      ensureDb()
        .prepare(
          `INSERT INTO automations
          (id, name, trigger_type, trigger_params, prompt_template, permission_mode,
           enabled, last_run, run_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            trigger_type = excluded.trigger_type,
            trigger_params = excluded.trigger_params,
            prompt_template = excluded.prompt_template,
            permission_mode = excluded.permission_mode,
            enabled = excluded.enabled,
            last_run = COALESCE(excluded.last_run, automations.last_run),
            run_count = COALESCE(excluded.run_count, automations.run_count)`
        )
        .run(
          id,
          payload.name || 'Untitled automation',
          payload.triggerType || 'manual',
          json(payload.triggerParams, {}),
          payload.promptTemplate || '',
          payload.permissionMode || 'default',
          payload.enabled === false ? 0 : 1,
          payload.lastRun || null,
          payload.runCount || 0
        );
      const automation = mapAutomation(ensureDb().prepare('SELECT * FROM automations WHERE id = ?').get(id));
      scheduleAutomations();
      return automation;
    } catch (error) {
      throw new Error(`Unable to save automation: ${error.message}`);
    }
  });

  ipcMain.handle('automation:delete', async (_event, id) => {
    try {
      ensureDb().prepare('DELETE FROM automations WHERE id = ?').run(id);
      scheduleAutomations();
      return { ok: true };
    } catch (error) {
      throw new Error(`Unable to delete automation: ${error.message}`);
    }
  });

  ipcMain.handle('automation:mark-run', async (_event, id) => {
    try {
      ensureDb()
        .prepare('UPDATE automations SET last_run = ?, run_count = run_count + 1 WHERE id = ?')
        .run(now(), id);
      return mapAutomation(ensureDb().prepare('SELECT * FROM automations WHERE id = ?').get(id));
    } catch (error) {
      throw new Error(`Unable to mark automation run: ${error.message}`);
    }
  });

  ipcMain.handle('automation:run', async (_event, id) => {
    try {
      const automation = mapAutomation(ensureDb().prepare('SELECT * FROM automations WHERE id = ?').get(id));
      if (!automation) throw new Error('Automation not found.');
      sendToAll('automation:trigger', {
        id,
        context: { source: 'manual', triggeredAt: Date.now() }
      });
      return automation;
    } catch (error) {
      throw new Error(`Unable to run automation: ${error.message}`);
    }
  });

  ipcMain.handle('search:query', async (_event, payload = {}) => {
    try {
      const query = String(payload.query || '').trim();
      if (!query) {
        return { chats: [], messages: [], files: [] };
      }
      const like = `%${query}%`;
      const chats = ensureDb()
        .prepare('SELECT * FROM chat_sessions WHERE title LIKE ? ORDER BY updated_at DESC LIMIT 12')
        .all(like)
        .map(mapSession);
      const escaped = query.replace(/"/g, '""');
      const messages = ensureDb()
        .prepare(
          `SELECT m.*, snippet(messages_fts, 0, '[', ']', ' ... ', 12) AS snippet
           FROM messages_fts
           JOIN messages m ON messages_fts.message_id = m.id
           WHERE messages_fts MATCH ?
           ORDER BY rank
           LIMIT 20`
        )
        .all(`"${escaped}"`)
        .map((row) => ({ ...mapMessage(row), snippet: row.snippet }));
      return { chats, messages, files: [] };
    } catch (error) {
      throw new Error(`Unable to search: ${error.message}`);
    }
  });

  ipcMain.handle('db:reset-all', async () => {
    const database = ensureDb();
    const tables = ['messages_fts', 'messages', 'chat_sessions', 'projects', 'snippet_history', 'change_records', 'approvals_log', 'automations'];
    for (const table of tables) {
      try {
        database.prepare(`DELETE FROM ${table}`).run();
      } catch {}
    }
    clearAutomationTimers();
    scheduleAutomations();
    return { ok: true };
  });
}


