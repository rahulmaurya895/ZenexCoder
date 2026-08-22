import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

let logPath = '';

export function initAuditLogHandler() {
  const base = app.getPath('userData');
  logPath = path.join(base, 'audit.log');
}

export async function appendAuditLog(entry = {}) {
  if (!logPath) initAuditLogHandler();
  const payload = { timestamp: Date.now(), ...entry };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
}