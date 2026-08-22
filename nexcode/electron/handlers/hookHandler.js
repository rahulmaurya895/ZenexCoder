import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  emitLocalHookEvent,
  getHookServerPort,
  getHookServerState,
  resolveHookTrigger
} from './localServerHandler.js';

const VALID_GIT_HOOKS = new Set(['pre-commit', 'pre-push']);
const ZENEXCODER_BEGIN = '# >>> ZenexCoder managed hook >>>';
const ZENEXCODER_END = '# <<< ZenexCoder managed hook <<<';
const HOOK_STORE_FILE = 'hooks.json';

let hooksCache = null;
const registeredProjects = new Set();

function storePath() {
  return path.join(app.getPath('userData'), HOOK_STORE_FILE);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadHooksFile() {
  if (hooksCache) return hooksCache;
  try {
    hooksCache = JSON.parse(await fs.readFile(storePath(), 'utf8'));
  } catch {
    hooksCache = [];
  }
  if (!Array.isArray(hooksCache)) hooksCache = [];
  return hooksCache;
}

async function saveHooksFile(hooks) {
  hooksCache = hooks;
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(hooks, null, 2), 'utf8');
}

function normalizeHook(payload = {}) {
  return {
    id: payload.id || crypto.randomUUID(),
    name: payload.name || 'Untitled hook',
    eventType: payload.eventType || 'pre-commit',
    condition: payload.condition || {},
    actionType: payload.actionType || 'agent_prompt',
    automationId: payload.automationId || '',
    prompt: payload.prompt || '',
    command: payload.command || '',
    blockOnIssues: Boolean(payload.blockOnIssues),
    enabled: payload.enabled !== false,
    createdAt: payload.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

function projectGitPath(projectPath) {
  return path.join(projectPath, '.git');
}

async function resolveGitDir(projectPath) {
  if (!projectPath) throw new Error('Project path is required.');
  const gitPath = projectGitPath(projectPath);
  const stat = await fs.stat(gitPath).catch(() => null);
  if (!stat) throw new Error('No .git directory found for this project.');
  if (stat.isDirectory()) return gitPath;

  const content = await fs.readFile(gitPath, 'utf8');
  const match = content.match(/^gitdir:\s*(.+)$/im);
  if (!match) throw new Error('.git file does not point to a gitdir.');
  const raw = match[1].trim();
  return path.resolve(projectPath, raw);
}

function shellEscapeSingle(value = '') {
  return String(value).replace(/'/g, `'\\''`);
}

function hookScript(projectPath, hookType) {
  const project = shellEscapeSingle(projectPath.replaceAll('\\', '/'));
  const hook = shellEscapeSingle(hookType);
  return `#!/bin/sh
${ZENEXCODER_BEGIN}
# This hook is managed by ZenexCoder. If ZenexCoder is not running, it fails open.
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT_FILE="$HOOK_DIR/../.zenexcoder-port"
if [ ! -f "$PORT_FILE" ]; then
  exit 0
fi
PORT="$(cat "$PORT_FILE" 2>/dev/null | tr -dc '0-9')"
if [ -z "$PORT" ]; then
  exit 0
fi
if ! command -v curl >/dev/null 2>&1; then
  exit 0
fi
PROJECT_PATH='${project}'
HOOK_TYPE='${hook}'
PAYLOAD=$(printf '{"event":"%s","hookType":"%s","projectPath":"%s","gitDir":"%s"}' "$HOOK_TYPE" "$HOOK_TYPE" "$PROJECT_PATH" "$HOOK_DIR/..")
HTTP_CODE=$(curl -sS -o /tmp/zenexcoder-hook-response-$$.json -w "%{http_code}" --connect-timeout 1 --max-time 185 -H "Content-Type: application/json" -X POST --data "$PAYLOAD" "http://127.0.0.1:$PORT/webhook" 2>/dev/null)
CURL_STATUS=$?
rm -f /tmp/zenexcoder-hook-response-$$.json
if [ "$CURL_STATUS" -ne 0 ]; then
  exit 0
fi
if [ "$HTTP_CODE" = "400" ]; then
  echo "ZenexCoder blocked ${hookType}."
  exit 1
fi
exit 0
${ZENEXCODER_END}
`;
}

async function writePortFile(projectPath) {
  const gitDir = await resolveGitDir(projectPath);
  const port = getHookServerPort();
  if (!port) throw new Error('ZenexCoder hook server is not running.');
  await fs.writeFile(path.join(gitDir, '.zenexcoder-port'), String(port), 'utf8');
  return { gitDir, port };
}

async function installGitHook(projectPath, hookType) {
  if (!VALID_GIT_HOOKS.has(hookType)) throw new Error(`Unsupported Git hook "${hookType}".`);
  const { gitDir, port } = await writePortFile(projectPath);
  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, hookType);
  const backupPath = `${hookPath}.zenexcoder-backup`;
  await fs.mkdir(hooksDir, { recursive: true });

  if (await exists(hookPath)) {
    const existing = await fs.readFile(hookPath, 'utf8').catch(() => '');
    if (!existing.includes(ZENEXCODER_BEGIN) && !(await exists(backupPath))) {
      await fs.copyFile(hookPath, backupPath);
    }
  }

  await fs.writeFile(hookPath, hookScript(projectPath, hookType), { encoding: 'utf8', mode: 0o755 });
  await fs.chmod(hookPath, 0o755).catch(() => {});
  return { ok: true, projectPath, hookType, hookPath, gitDir, port };
}

async function removeGitHook(projectPath, hookType) {
  if (!VALID_GIT_HOOKS.has(hookType)) throw new Error(`Unsupported Git hook "${hookType}".`);
  const gitDir = await resolveGitDir(projectPath);
  const hookPath = path.join(gitDir, 'hooks', hookType);
  const backupPath = `${hookPath}.zenexcoder-backup`;
  if (!(await exists(hookPath))) return { ok: true, removed: false };

  const existing = await fs.readFile(hookPath, 'utf8').catch(() => '');
  if (!existing.includes(ZENEXCODER_BEGIN)) {
    return { ok: false, message: 'Hook is not managed by ZenexCoder.' };
  }
  if (await exists(backupPath)) {
    await fs.copyFile(backupPath, hookPath);
    await fs.rm(backupPath, { force: true });
    await fs.chmod(hookPath, 0o755).catch(() => {});
    return { ok: true, restored: true, hookPath };
  }
  await fs.rm(hookPath, { force: true });
  return { ok: true, removed: true, hookPath };
}

async function listInstalledGitHooks(projectPath) {
  if (!projectPath) return {};
  const result = {};
  try {
    const gitDir = await resolveGitDir(projectPath);
    for (const hookType of VALID_GIT_HOOKS) {
      const hookPath = path.join(gitDir, 'hooks', hookType);
      const script = await fs.readFile(hookPath, 'utf8').catch(() => '');
      result[hookType] = {
        installed: script.includes(ZENEXCODER_BEGIN),
        hookPath
      };
    }
  } catch {
    return {};
  }
  return result;
}

async function registerProject(projectPath) {
  if (!projectPath) return { ok: false, message: 'No project path.' };
  try {
    const { gitDir, port } = await writePortFile(projectPath);
    registeredProjects.add(projectPath);
    return { ok: true, projectPath, gitDir, port };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function cleanupHookPortFiles(projectPaths = null) {
  const paths = projectPaths || [...registeredProjects];
  for (const projectPath of paths.filter(Boolean)) {
    try {
      const gitDir = await resolveGitDir(projectPath);
      await fs.rm(path.join(gitDir, '.zenexcoder-port'), { force: true });
    } catch {
      // Ignore cleanup failures; Git hooks fail open if the file is missing.
    }
  }
}

export function registerHookHandlers() {
  ipcMain.handle('hook:server-state', async () => getHookServerState());
  ipcMain.handle('hook:list', async () => loadHooksFile());
  ipcMain.handle('hook:save', async (_event, payload = {}) => {
    const hooks = await loadHooksFile();
    const saved = normalizeHook(payload);
    const next = [saved, ...hooks.filter((item) => item.id !== saved.id)];
    await saveHooksFile(next);
    return saved;
  });
  ipcMain.handle('hook:delete', async (_event, id) => {
    const hooks = await loadHooksFile();
    await saveHooksFile(hooks.filter((item) => item.id !== id));
    return { ok: true };
  });
  ipcMain.handle('hook:set-enabled', async (_event, payload = {}) => {
    const hooks = await loadHooksFile();
    const next = hooks.map((hook) =>
      hook.id === payload.id ? { ...hook, enabled: Boolean(payload.enabled), updatedAt: Date.now() } : hook
    );
    await saveHooksFile(next);
    return next.find((hook) => hook.id === payload.id) || null;
  });
  ipcMain.handle('hook:install-git-hook', async (_event, payload = {}) => installGitHook(payload.projectPath, payload.hookType));
  ipcMain.handle('hook:remove-git-hook', async (_event, payload = {}) => removeGitHook(payload.projectPath, payload.hookType));
  ipcMain.handle('hook:list-installed', async (_event, projectPath) => listInstalledGitHooks(projectPath));
  ipcMain.handle('hook:register-project', async (_event, projectPath) => registerProject(projectPath));
  ipcMain.handle('hook:trigger-app-event', async (_event, payload = {}) =>
    emitLocalHookEvent(payload.event, payload.projectPath, payload.payload || {})
  );
  ipcMain.handle('hook:resolve-trigger', async (_event, payload = {}) =>
    resolveHookTrigger(payload.triggerId, payload.status, payload.details || {})
  );
}
