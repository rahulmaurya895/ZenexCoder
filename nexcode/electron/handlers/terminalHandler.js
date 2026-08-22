import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildProjectEnvironment } from './environmentHandler.js';
import { sandboxIsEnabled, sandboxRunCommand } from './sandboxHandler.js';
import { enforcePolicies, extractNpmPackages, verifyNpmPackage } from './policyEnforcer.js';

const terminals = new Map();
let selectedShellPath = '';

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function configPath() {
  return path.join(app.getPath('userData'), 'terminal-shell.json');
}

function loadShellConfig() {
  if (selectedShellPath) return selectedShellPath;
  try {
    selectedShellPath = JSON.parse(fs.readFileSync(configPath(), 'utf8')).shellPath || '';
  } catch {
    selectedShellPath = '';
  }
  return selectedShellPath;
}

function saveShellConfig(shellPath) {
  selectedShellPath = shellPath || '';
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ shellPath: selectedShellPath }, null, 2), 'utf8');
}

function shellForPlatform() {
  if (process.platform === 'win32') {
    return loadShellConfig() || process.env.ComSpec || 'powershell.exe';
  }
  return loadShellConfig() || process.env.SHELL || 'bash';
}

function shellLabel(shellPath) {
  const lower = shellPath.toLowerCase();
  if (lower.endsWith('cmd.exe')) return 'Command Prompt';
  if (lower.endsWith('powershell.exe')) return 'Windows PowerShell';
  if (lower.endsWith('pwsh.exe')) return 'PowerShell 7';
  if (lower.endsWith('bash.exe') || lower.endsWith('/bash')) return 'Bash';
  if (lower.endsWith('/zsh')) return 'Zsh';
  return path.basename(shellPath);
}

function candidateShells() {
  if (process.platform === 'win32') {
    return [
      process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
    ];
  }
  return ['/bin/zsh', '/bin/bash', process.env.SHELL || ''];
}

function detectAvailableShells() {
  const seen = new Set();
  return candidateShells()
    .filter(Boolean)
    .filter((shellPath) => {
      const normalized = shellPath.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return fs.existsSync(shellPath) || !path.isAbsolute(shellPath);
    })
    .map((shellPath) => ({
      label: shellLabel(shellPath),
      path: shellPath,
      selected: shellPath === shellForPlatform()
    }));
}

function shellArgs(shellPath, command) {
  const lower = shellPath.toLowerCase();
  if (lower.endsWith('cmd.exe')) return ['/d', '/s', '/c', command];
  if (lower.endsWith('powershell.exe') || lower.endsWith('pwsh.exe')) {
    return ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
  }
  return ['-lc', command];
}

async function importPty() {
  try {
    return await import('node-pty');
  } catch {
    return null;
  }
}

export function killAllTerminals() {
  for (const [terminalId, terminal] of terminals.entries()) {
    try {
      terminal.kill();
    } catch {}
    terminals.delete(terminalId);
  }
}

export function registerTerminalHandlers() {
  ipcMain.handle('terminal:run', async (event, payload = {}) => {
    const runId = payload.runId;
    const command = payload.command;
    if (!command) {
      throw new Error('No terminal command provided.');
    }

    const policy = enforcePolicies(command);
    if (!policy.ok) {
      throw new Error(policy.message);
    }

    // Supply Chain Defense: Verify packages exist on NPM before running install
    const npmPkgs = extractNpmPackages(command);
    for (const pkg of npmPkgs) {
      const verify = await verifyNpmPackage(pkg);
      if (!verify.valid) {
        throw new Error(verify.message);
      }
    }

    try {
      const cwd = payload.cwd || os.homedir();
      if (sandboxIsEnabled() && payload.routeToSandbox !== false) {
        const result = await sandboxRunCommand(command, cwd, { timeoutMs: payload.timeoutMs || 120000 });
        if (result.stdout) {
          event.sender.send('terminal:run-output', {
            runId,
            type: 'stdout',
            data: result.stdout
          });
        }
        if (result.stderr) {
          event.sender.send('terminal:run-output', {
            runId,
            type: 'stderr',
            data: result.stderr
          });
        }
        event.sender.send('terminal:run-exit', { runId, code: result.code, sandbox: true });
        return { runId, pid: null, sandbox: true };
      }

      // Active project environment variables override process.env for new child processes.
      const childEnv = await buildProjectEnvironment(cwd, payload.env || {});
      const useShell = payload.shell !== false;
      const shellPath = useShell ? shellForPlatform() : command;
      const child = spawn(shellPath, useShell ? shellArgs(shellPath, command) : payload.args || [], {
        cwd,
        shell: false,
        windowsHide: true,
        env: childEnv
      });

      child.stdout?.on('data', (data) => {
        event.sender.send('terminal:run-output', {
          runId,
          type: 'stdout',
          data: data.toString()
        });
      });

      child.stderr?.on('data', (data) => {
        event.sender.send('terminal:run-output', {
          runId,
          type: 'stderr',
          data: data.toString()
        });
      });

      child.on('error', (error) => {
        event.sender.send('terminal:run-output', {
          runId,
          type: 'stderr',
          data: error.message
        });
      });

      child.on('close', (code) => {
        event.sender.send('terminal:run-exit', { runId, code });
      });

      return { runId, pid: child.pid };
    } catch (error) {
      throw new Error(`Unable to run command: ${error.message}`);
    }
  });

  ipcMain.handle('terminal:create', async (event, payload = {}) => {
    const terminalId = payload.terminalId || `terminal-${Date.now()}`;
    const cwd = payload.cwd || os.homedir();
    const childEnv = await buildProjectEnvironment(cwd);
    const shellPath = payload.shell || shellForPlatform();
    const cols = Math.max(20, payload.cols || 100);
    const rows = Math.max(5, payload.rows || 30);

    const pty = await importPty();
    if (pty?.spawn) {
      try {
        const terminal = pty.spawn(shellPath, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: childEnv
        });

        terminal.onData((data) => {
          event.sender.send('terminal:data', { terminalId, data });
        });

        terminal.onExit(({ exitCode }) => {
          event.sender.send('terminal:exit', { terminalId, exitCode });
          terminals.delete(terminalId);
        });

        terminals.set(terminalId, terminal);
        return { terminalId, pid: terminal.pid };
      } catch (err) {
        console.warn('node-pty spawn failed, using child_process fallback:', err.message);
      }
    }

    const child = spawn(shellPath, [], {
      cwd,
      env: childEnv,
      windowsHide: true
    });

    const termWrap = {
      pid: child.pid,
      write: (data) => child.stdin?.write(data),
      resize: () => {},
      kill: () => child.kill()
    };

    child.stdout?.on('data', (data) => {
      event.sender.send('terminal:data', { terminalId, data: data.toString() });
    });
    child.stderr?.on('data', (data) => {
      event.sender.send('terminal:data', { terminalId, data: data.toString() });
    });
    child.on('close', (exitCode) => {
      event.sender.send('terminal:exit', { terminalId, exitCode: exitCode || 0 });
      terminals.delete(terminalId);
    });

    terminals.set(terminalId, termWrap);
    return { terminalId, pid: child.pid };
  });


  ipcMain.on('terminal:write', (_event, payload = {}) => {
    terminals.get(payload.terminalId)?.write(payload.data || '');
  });

  ipcMain.on('terminal:resize', (_event, payload = {}) => {
    terminals.get(payload.terminalId)?.resize(payload.cols || 100, payload.rows || 30);
  });

  ipcMain.handle('terminal:kill', async (_event, terminalId) => {
    const terminal = terminals.get(terminalId);
    if (terminal) {
      terminal.kill();
      terminals.delete(terminalId);
    }
    return { ok: true };
  });

  ipcMain.handle('terminal:get-shells', async () => ({
    selected: shellForPlatform(),
    shells: detectAvailableShells()
  }));

  ipcMain.handle('terminal:set-shell', async (_event, payload = {}) => {
    const shellPath = payload.shellPath || '';
    if (shellPath && !fs.existsSync(shellPath) && path.isAbsolute(shellPath)) {
      throw new Error('Shell executable was not found.');
    }
    saveShellConfig(shellPath);
    killAllTerminals();
    const result = { selected: shellForPlatform(), shells: detectAvailableShells() };
    sendToAll('terminal:shell-changed', result);
    return result;
  });
}
