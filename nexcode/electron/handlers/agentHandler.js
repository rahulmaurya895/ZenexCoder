import { BrowserWindow, Notification, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { addChangeRecord, logApproval } from '../database.js';
import { buildProjectEnvironment, envPromptContext } from './environmentHandler.js';
import { sandboxIsEnabled, sandboxRunCommand } from './sandboxHandler.js';

const runs = new Map();
const approvals = new Map();

const HIGH_RISK_ACTIONS = new Set(['file_delete', 'git_push', 'git_destructive', 'computer_interact']);
const LOW_RISK_ACTIONS = new Set(['file_read', 'network_request', 'browser_read']);

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function emitStep(runId, step) {
  sendToAll('agent:step-update', { runId, step });
}

function showNotification(title, body, payload = {}, enabled = true) {
  sendToAll('notify:show', {
    id: payload.id || `notify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type: payload.type || 'info',
    timestamp: Date.now()
  });
  if (!enabled || !Notification.isSupported()) {
    return;
  }
  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => {
    const [window] = BrowserWindow.getAllWindows();
    window?.show();
    window?.focus();
    window?.webContents.send('notify:click', payload);
  });
  notification.show();
}

function normalizeStep(step, index) {
  return {
    id: step.id || crypto.randomUUID(),
    title: step.title || `Step ${index + 1}`,
    description: step.description || step.instruction || '',
    actionType: step.actionType || inferActionType(step),
    command: step.command || '',
    filePath: step.filePath || '',
    content: step.content || '',
    status: 'pending',
    files: step.files || [],
    output: '',
    durationMs: 0
  };
}

function inferActionType(step) {
  if (step.actionType) return step.actionType;
  if (step.filePath && step.delete) return 'file_delete';
  if (step.filePath && step.create) return 'file_create';
  if (step.command) {
    if (/git\s+push/i.test(step.command)) {
      return 'git_push';
    }
    if (/git\s+reset\s+--hard|git\s+clean\s+-fd|rm\s+-rf|Remove-Item.*-Recurse|drop\s+database|format\s+/i.test(step.command)) {
      return 'git_destructive';
    }
    if (/npm\s+i|pnpm\s+add|yarn\s+add|pip\s+install/i.test(step.command)) {
      return 'package_install';
    }
    if (/git\s+commit/i.test(step.command)) {
      return 'git_commit';
    }
    return 'terminal_run';
  }
  if (step.filePath && step.content != null) return 'file_write';
  return 'file_read';
}

function shouldRequestApproval(step, permissions = {}) {
  const mode = permissions.mode || 'default';
  const actionType = step.actionType || inferActionType(step);
  if (HIGH_RISK_ACTIONS.has(actionType)) return true;
  if (permissions.sessionAllows?.includes(actionType)) return false;
  if (permissions.projectRules?.[actionType] === 'allow') return false;
  if (LOW_RISK_ACTIONS.has(actionType)) return false;
  return mode === 'default';
}

function isBlockedByWorkMode(step, permissions = {}) {
  if (permissions.workMode !== 'everyday' || permissions.devToolsVisible) return false;
  const actionType = step.actionType || inferActionType(step);
  return !LOW_RISK_ACTIONS.has(actionType);
}

function waitForApproval(action, permissions = {}) {
  return new Promise((resolve) => {
    approvals.set(action.id, { resolve, action });
    sendToAll('agent:approval-pending', action);
    const focused = BrowserWindow.getAllWindows().some((window) => window.isFocused());
    if (!focused) {
      showNotification(
        'ZezenexCoderr approval needed',
        action.description,
        { type: 'approval', id: action.id },
        permissions.showSystemNotifications !== false
      );
    }
  });
}

function normalizeEditedArgs(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function requestMcpToolApproval(payload = {}) {
  const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
  const action = {
    id: crypto.randomUUID(),
    runId: payload.runId,
    stepId: payload.stepId,
    actionType: 'mcp_tool_call',
    title: `AI wants to execute ${payload.toolName} via ${payload.serverName || payload.serverId}`,
    description: JSON.stringify(args, null, 2),
    riskLevel: 'medium',
    mcp: {
      serverId: payload.serverId,
      serverName: payload.serverName || payload.serverId,
      toolName: payload.toolName,
      args
    },
    createdAt: Date.now()
  };

  if (!shouldRequestApproval(action, payload.permissions || {})) {
    logApproval({
      actionType: 'mcp_tool_call',
      description: action.title,
      decision: 'auto-approved'
    });
    return { decision: 'approve', args };
  }

  const decision = await waitForApproval(action, payload.permissions || {});
  if (decision?.decision === 'deny') {
    return { decision: 'deny', args };
  }
  if (decision?.approveAll && decision?.actionType) {
    payload.permissions.sessionAllows = [
      ...new Set([...(payload.permissions.sessionAllows || []), decision.actionType])
    ];
  }
  return {
    decision: 'approve',
    args: normalizeEditedArgs(decision?.editedArgs || decision?.editedCommand, args)
  };
}

export async function requestBrowserActionApproval(payload = {}) {
  const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
  const actionType = payload.actionType || 'browser_interact';
  const selector = args.element_id_or_selector || args.selector || '';
  const url = payload.url || payload.browser?.url || '';
  const action = {
    id: crypto.randomUUID(),
    runId: payload.runId,
    stepId: payload.stepId,
    actionType,
    title: payload.title || (payload.toolName === 'browser_type'
      ? `AI wants to type into ${selector || 'the page'} at ${url || 'the current page'}`
      : payload.toolName === 'browser_click'
        ? `AI wants to click ${selector || 'the page'} at ${url || 'the current page'}`
        : `AI wants to use ${payload.toolName || 'the browser'}`),
    description: JSON.stringify(args, null, 2),
    riskLevel: actionType === 'browser_read' ? 'low' : 'medium',
    browser: {
      toolName: payload.toolName,
      url,
      title: payload.titleText || '',
      screenshot: payload.screenshot || '',
      args
    },
    createdAt: Date.now()
  };

  if (!shouldRequestApproval(action, payload.permissions || {})) {
    logApproval({
      actionType,
      description: action.title,
      decision: 'auto-approved'
    });
    return { decision: 'approve', args };
  }

  const decision = await waitForApproval(action, payload.permissions || {});
  if (decision?.decision === 'deny') {
    return { decision: 'deny', args };
  }
  if (decision?.approveAll && decision?.actionType) {
    payload.permissions.sessionAllows = [
      ...new Set([...(payload.permissions.sessionAllows || []), decision.actionType])
    ];
  }
  return {
    decision: 'approve',
    args: normalizeEditedArgs(decision?.editedArgs || decision?.editedCommand, args)
  };
}

export async function requestComputerActionApproval(payload = {}) {
  const args = payload.args && typeof payload.args === 'object' ? payload.args : {};
  const actionType = payload.actionType || 'computer_interact';
  const action = {
    id: crypto.randomUUID(),
    runId: payload.runId,
    stepId: payload.stepId,
    actionType,
    title: actionType === 'computer_screenshot'
      ? 'AI wants to take a screenshot of your screen'
      : 'AI wants to take control of your mouse/keyboard',
    description: JSON.stringify(args, null, 2),
    riskLevel: actionType === 'computer_interact' ? 'high' : 'medium',
    computer: {
      toolName: payload.toolName,
      args
    },
    createdAt: Date.now()
  };

  const canAutoApproveInteract =
    actionType === 'computer_interact' &&
    payload.allowUnattended === true &&
    ['auto-review', 'full-access'].includes(payload.permissions?.mode);
  const canAutoApproveScreenshot = actionType === 'computer_screenshot' && !shouldRequestApproval(action, payload.permissions || {});

  if (canAutoApproveInteract || canAutoApproveScreenshot) {
    logApproval({
      actionType,
      description: action.title,
      decision: 'auto-approved'
    });
    return { decision: 'approve', args };
  }

  const decision = await waitForApproval(action, payload.permissions || {});
  if (decision?.decision === 'deny') {
    return { decision: 'deny', args };
  }
  return {
    decision: 'approve',
    args: normalizeEditedArgs(decision?.editedArgs || decision?.editedCommand, args)
  };
}

async function runShell(command, cwd, runState, onOutput) {
  if (sandboxIsEnabled()) {
    const result = await sandboxRunCommand(command, cwd, { timeoutMs: 180000 });
    if (result.stdout) onOutput(result.stdout);
    if (result.stderr) onOutput(result.stderr);
    if (result.code !== 0) {
      throw new Error(`Sandbox command exited with ${result.code}`);
    }
    return;
  }

  const childEnv = await buildProjectEnvironment(cwd);
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd: cwd || process.cwd(),
      shell: true,
      windowsHide: true,
      env: childEnv
    });
    runState.child = child;
    child.stdout?.on('data', (data) => onOutput(data.toString()));
    child.stderr?.on('data', (data) => onOutput(data.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      runState.child = null;
      if (code === 0) resolve();
      else reject(new Error(`Command exited with ${code}`));
    });
  });
}

async function executeStep(runState, step) {
  const started = Date.now();
  step.status = 'running';
  emitStep(runState.id, step);

  if (step.command) {
    await runShell(step.command, runState.cwd, runState, (chunk) => {
      step.output = `${step.output || ''}${chunk}`.slice(-4000);
      emitStep(runState.id, step);
    });
  } else if (step.filePath && step.content != null) {
    let beforeContent = '';
    try {
      beforeContent = await fs.readFile(step.filePath, 'utf8');
    } catch {
      beforeContent = '';
    }
    await fs.mkdir(path.dirname(step.filePath), { recursive: true });
    await fs.writeFile(step.filePath, step.content, 'utf8');
    step.files = [...new Set([...(step.files || []), step.filePath])];
    addChangeRecord({
      stepId: step.id,
      filePath: step.filePath,
      beforeContent,
      afterContent: step.content,
      explanation: step.description
    });
    if (['auto-review', 'full-access'].includes(runState.permissions?.mode)) {
      showNotification(
        'ZezenexCoderr made a change',
        `${path.basename(step.filePath)} is ready for review.`,
        { type: 'review', stepId: step.id },
        runState.permissions?.showSystemNotifications !== false
      );
    }
  } else {
    step.output = step.description || 'Read-only step completed.';
  }

  step.status = 'done';
  step.durationMs = Date.now() - started;
  emitStep(runState.id, step);
}

async function runPlan(runState) {
  try {
    for (let index = runState.currentIndex; index < runState.steps.length; index += 1) {
      runState.currentIndex = index;
      const step = runState.steps[index];
      while (runState.paused && !runState.stopped) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (runState.stopped) {
        step.status = 'paused';
        emitStep(runState.id, step);
        break;
      }
      if (runState.skipped.has(step.id)) {
        step.status = 'skipped';
        emitStep(runState.id, step);
        continue;
      }
      if (isBlockedByWorkMode(step, runState.permissions)) {
        step.status = 'failed';
        step.output = 'Everyday mode has dev tools hidden. Enable Show Dev Tools before file writes or terminal commands.';
        emitStep(runState.id, step);
        continue;
      }
      if (shouldRequestApproval(step, runState.permissions)) {
        const action = {
          id: crypto.randomUUID(),
          runId: runState.id,
          stepId: step.id,
          actionType: step.actionType,
          title: `AI wants to ${step.actionType.replaceAll('_', ' ')}`,
          description: step.command || step.filePath || step.description,
          riskLevel: HIGH_RISK_ACTIONS.has(step.actionType) ? 'high' : 'medium',
          createdAt: Date.now()
        };
        const decision = await waitForApproval(action, runState.permissions);
        if (decision?.decision === 'deny') {
          step.status = 'failed';
          step.output = 'Denied by user.';
          emitStep(runState.id, step);
          continue;
        }
        if (decision?.editedCommand) {
          step.command = decision.editedCommand;
        }
        if (decision?.approveAll && decision?.actionType) {
          runState.permissions.sessionAllows = [
            ...new Set([...(runState.permissions.sessionAllows || []), decision.actionType])
          ];
        }
      }
      await executeStep(runState, step);
    }
    sendToAll('agent:run-update', {
      runId: runState.id,
      runState: runState.stopped ? 'stopped' : 'completed'
    });
  } catch (error) {
    sendToAll('agent:run-update', { runId: runState.id, runState: 'error', error: error.message });
  } finally {
    runs.delete(runState.id);
  }
}

export function registerAgentHandlers() {
  ipcMain.handle('agent:start-run', async (_event, payload = {}) => {
    const runId = payload.id || crypto.randomUUID();
    const steps = (payload.steps || []).map(normalizeStep);
    const environmentContext = envPromptContext(payload.cwd);
    const runState = {
      id: runId,
      cwd: payload.cwd,
      environmentContext,
      permissions: payload.permissions || {},
      steps,
      currentIndex: 0,
      paused: false,
      stopped: false,
      skipped: new Set(),
      child: null
    };
    runs.set(runId, runState);
    sendToAll('agent:run-update', { runId, runState: 'running', plan: { ...payload, id: runId, steps, environmentContext } });
    runPlan(runState);
    return { ok: true, runId, steps };
  });

  ipcMain.handle('agent:control', async (_event, payload = {}) => {
    const runState = runs.get(payload.runId);
    if (!runState) return { ok: false, message: 'Run not found.' };
    if (payload.action === 'pause') runState.paused = true;
    if (payload.action === 'resume') runState.paused = false;
    if (payload.action === 'stop') {
      runState.stopped = true;
      runState.child?.kill('SIGINT');
    }
    if (payload.action === 'skip' && payload.stepId) runState.skipped.add(payload.stepId);
    if (payload.action === 'edit-step' && payload.stepId) {
      const step = runState.steps.find((item) => item.id === payload.stepId);
      if (step && step.status === 'pending') {
        Object.assign(step, payload.patch || {});
        emitStep(payload.runId, step);
      }
    }
    if (payload.action === 'insert-step' && payload.step) {
      const step = normalizeStep(payload.step, runState.steps.length);
      const insertAt = Math.min(runState.steps.length, runState.currentIndex + 1);
      runState.steps.splice(insertAt, 0, step);
      emitStep(payload.runId, step);
    }
    sendToAll('agent:run-update', {
      runId: payload.runId,
      runState: runState.stopped ? 'stopped' : runState.paused ? 'paused' : 'running'
    });
    return { ok: true };
  });

  ipcMain.handle('agent:approval-request', async (_event, payload = {}) => {
    const action = { ...payload, id: payload.id || crypto.randomUUID(), createdAt: Date.now() };
    sendToAll('agent:approval-pending', action);
    showNotification('ZezenexCoderr approval needed', action.description || action.title || 'Approval requested', {
      type: 'approval',
      id: action.id
    });
    return action;
  });

  ipcMain.handle('agent:approval-response', async (_event, payload = {}) => {
    const pending = approvals.get(payload.actionId || payload.id);
    if (pending?.resolve) {
      pending.resolve(payload);
      approvals.delete(payload.actionId || payload.id);
    }
    logApproval({
      actionType: payload.actionType || pending?.action?.actionType,
      description: payload.description || payload.editedCommand || pending?.action?.description || '',
      decision: payload.editedCommand ? 'edited' : payload.decision
    });
    sendToAll('agent:approval-resolved', payload);
    return { ok: true };
  });

  ipcMain.handle('notify:show', async (_event, payload = {}) => {
    showNotification(payload.title || 'ZezenexCoderr', payload.body || '', payload);
    return { ok: true };
  });
}
