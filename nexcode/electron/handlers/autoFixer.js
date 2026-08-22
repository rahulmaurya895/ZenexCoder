import { BrowserWindow, app, safeStorage } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendIncidentLog, getIncident, updateIncident } from '../database.js';
import { gitStatus, gitWorktreeAdd, gitWorktreeRemove } from './gitHandler.js';
import { runShadowSwarmForResult } from './swarmHandler.js';
import { createGitHubPullRequest, parseGitHubRemote } from './githubHandler.js';

const activeJobs = new Map();
const MAX_ATTEMPTS = 3;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function notify(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `healing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
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

function loadAppSettings() {
  const storeFile = path.join(app.getPath('userData'), 'zenexcoder-secure.json');
  try {
    const store = JSON.parse(fsSync.readFileSync(storeFile, 'utf8'));
    return decryptedPayload(store.settings) || {};
  } catch {
    return {};
  }
}

function safeSlug(value = '') {
  return String(value || '')
    .replace(/^sentry:/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || crypto.randomUUID().slice(0, 8);
}

function incidentStatusForStep(step, status) {
  if (status === 'failed') return 'manual_required';
  if (step === 'create_worktree') return status === 'done' ? 'worktree_ready' : 'healing';
  if (step === 'swarm') return 'swarm_running';
  if (step === 'write_tests') return 'testing';
  if (step === 'commit') return status === 'done' ? 'committed' : 'healing';
  if (step === 'pr') return status === 'done' ? 'pr_raised' : 'awaiting_pr';
  return 'healing';
}

function emitStatus(incidentId, step, status, message, patch = {}) {
  let incident = null;
  try {
    incident = appendIncidentLog(incidentId, {
      step,
      status,
      message,
      incidentStatus: patch.status || incidentStatusForStep(step, status)
    });
    if (Object.keys(patch).length) {
      incident = updateIncident(incidentId, patch);
    }
  } catch {
    incident = getIncident(incidentId);
  }
  const payload = {
    incidentId,
    step,
    status,
    message,
    incident,
    timestamp: Date.now()
  };
  sendToAll('incident:healing-status', payload);
  return payload;
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveInside(root, filePath = '') {
  const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  if (!isInside(root, absolute) && path.resolve(root) !== absolute) {
    throw new Error(`Refusing to write outside worktree: ${filePath}`);
  }
  return absolute;
}

function isUnsafeCommand(command = '') {
  return /\bgit\s+(push|reset\s+--hard|clean\b)|\brm\s+-rf\b|\bRemove-Item\b[\s\S]*-Recurse|\bdeploy\b|\bkubectl\s+apply\b|\bterraform\s+apply\b/i.test(
    command
  );
}

function isTestCommand(command = '') {
  return /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\b(vitest|jest|pytest)\b|\bgo\s+test\b|\bcargo\s+test\b|\bmvn\s+test\b|\bgradle(w)?\s+test\b/i.test(
    command
  );
}

function isTestFile(filePath = '') {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  return /(^|\/)(__tests__|tests?|spec)\//.test(normalized) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

function runGit(projectPath, args = [], job = null, options = {}) {
  return new Promise((resolve, reject) => {
    if (job?.controller.signal.aborted) {
      reject(new Error('Auto-fix was stopped.'));
      return;
    }
    const child = spawn('git', ['-C', projectPath, ...args], {
      windowsHide: true,
      shell: false
    });
    if (job) job.child = child;
    let stdout = '';
    let stderr = '';
    const cleanup = () => {
      if (job?.child === child) job.child = null;
    };
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    const abort = () => child.kill('SIGINT');
    job?.controller.signal.addEventListener('abort', abort, { once: true });
    child.on('error', (error) => {
      job?.controller.signal.removeEventListener('abort', abort);
      cleanup();
      if (options.allowFailure) resolve({ code: 1, stdout, stderr: error.message });
      else reject(error);
    });
    child.on('close', (code) => {
      job?.controller.signal.removeEventListener('abort', abort);
      cleanup();
      const result = { code, stdout, stderr };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(stderr || stdout || `git exited with ${code}`));
    });
  });
}

function runShell(command, cwd, job, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    if (job?.controller.signal.aborted) {
      reject(new Error('Auto-fix was stopped.'));
      return;
    }
    if (isUnsafeCommand(command)) {
      reject(new Error(`Blocked unsafe background command: ${command}`));
      return;
    }

    const child = spawn(command, [], {
      cwd,
      shell: true,
      windowsHide: true
    });
    job.child = child;
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGINT'), timeoutMs);
    const abort = () => child.kill('SIGINT');
    job.controller.signal.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      job.controller.signal.removeEventListener('abort', abort);
      job.child = null;
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      job.controller.signal.removeEventListener('abort', abort);
      job.child = null;
      const output = `${stdout}\n${stderr}`.trim();
      if (code === 0) resolve({ code, stdout, stderr, output });
      else reject(new Error(output || `Command exited with ${code}`));
    });
  });
}

async function detectTestCommand(worktreePath) {
  const packageJsonPath = path.join(worktreePath, 'package.json');
  const packageJson = await fs.readFile(packageJsonPath, 'utf8').catch(() => '');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson);
      const testScript = parsed.scripts?.test || '';
      if (testScript && !/no test specified/i.test(testScript)) {
        if (fsSync.existsSync(path.join(worktreePath, 'pnpm-lock.yaml'))) return 'pnpm test';
        if (fsSync.existsSync(path.join(worktreePath, 'yarn.lock'))) return 'yarn test';
        return 'npm test';
      }
    } catch {
      return '';
    }
  }
  if (fsSync.existsSync(path.join(worktreePath, 'pytest.ini')) || fsSync.existsSync(path.join(worktreePath, 'pyproject.toml'))) {
    return 'pytest';
  }
  if (fsSync.existsSync(path.join(worktreePath, 'go.mod'))) return 'go test ./...';
  if (fsSync.existsSync(path.join(worktreePath, 'Cargo.toml'))) return 'cargo test';
  return '';
}

async function executePlanSteps(incidentId, steps = [], worktreePath, job) {
  const writtenFiles = [];
  const testCommands = [];

  for (const step of steps) {
    const actionType = step.actionType || (step.command ? 'terminal_run' : step.filePath ? 'file_write' : 'file_read');
    if (job.controller.signal.aborted) throw new Error('Auto-fix was stopped.');

    if (['file_write', 'file_create'].includes(actionType) && step.filePath && step.content != null) {
      const target = resolveInside(worktreePath, step.filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(step.content), 'utf8');
      writtenFiles.push(target);
      emitStatus(incidentId, isTestFile(target) ? 'write_tests' : 'apply_fix', 'done', `Wrote ${path.relative(worktreePath, target)}`);
      continue;
    }

    if (step.command) {
      if (isTestCommand(step.command)) {
        testCommands.push(step.command);
        continue;
      }
      emitStatus(incidentId, 'verify', 'running', step.command);
      const result = await runShell(step.command, worktreePath, job);
      emitStatus(incidentId, 'verify', 'done', result.output.slice(-500) || step.command);
      continue;
    }

    emitStatus(incidentId, 'swarm', 'done', step.description || step.title || 'Read-only swarm step accepted.');
  }

  if (!writtenFiles.some(isTestFile)) {
    throw new Error('The healer swarm did not provide a unit test file change.');
  }

  return { writtenFiles, testCommands: [...new Set(testCommands)] };
}

async function runTests(incidentId, worktreePath, commands, job) {
  const testCommands = commands.length ? commands : [await detectTestCommand(worktreePath)].filter(Boolean);
  if (!testCommands.length) {
    throw new Error('No runnable test command was found for this project.');
  }

  for (const command of testCommands.slice(0, 3)) {
    emitStatus(incidentId, 'write_tests', 'running', command);
    const result = await runShell(command, worktreePath, job, 300000);
    emitStatus(incidentId, 'write_tests', 'done', result.output.slice(-700) || `${command} passed.`);
  }
}

async function createHealingWorktree(incident, settings = {}, job) {
  const projectPath = path.resolve(settings.projectPath || incident.projectPath || '');
  if (!projectPath || !(await fs.stat(projectPath).catch(() => null))?.isDirectory()) {
    throw new Error('Open or configure a real Git project before starting self-healing.');
  }

  const status = await gitStatus(projectPath);
  if (!status.isRepo) {
    throw new Error('Self-healing needs a Git repository so it can create an isolated worktree.');
  }

  const branchBase = `fix-sentry-issue-${safeSlug(incident.externalId || incident.id)}`;
  const branchName = branchBase;
  const worktreeRoot = path.join(projectPath, '.zenexcoder_worktrees');
  await fs.mkdir(worktreeRoot, { recursive: true });
  let worktreePath = path.join(worktreeRoot, branchBase);
  if (fsSync.existsSync(worktreePath)) {
    const suffix = Date.now().toString(36);
    worktreePath = path.join(worktreeRoot, `${branchBase}-${suffix}`);
  }
  if (!isInside(projectPath, worktreePath)) {
    throw new Error('Refusing to create a healing worktree outside the project folder.');
  }

  const fromRef = settings.baseBranch || 'HEAD';
  emitStatus(incident.id, 'create_worktree', 'running', worktreePath, { status: 'healing' });
  await gitWorktreeAdd(projectPath, {
    newPath: worktreePath,
    branchName,
    createBranch: true,
    fromRef
  });

  const baseBranch = settings.baseBranch || (status.branch && status.branch !== 'detached' ? status.branch : 'main');
  emitStatus(incident.id, 'create_worktree', 'done', worktreePath, {
    status: 'worktree_ready',
    projectPath,
    worktreePath,
    branchName
  });
  job.worktreePath = worktreePath;
  job.projectPath = projectPath;
  return { projectPath, worktreePath, branchName, baseBranch };
}

function buildPrompt(incident, attempt, feedback = '') {
  return [
    'You are debugging a real production crash. Do not invent a pull request, deployment, or verification result.',
    'Analyze the stack trace, find the root cause in this worktree, and produce executable ZenexCoder steps.',
    'The Coder must include complete file contents for every changed file.',
    'The QA/SecOps personas must include at least one unit test file change that fails without the fix and passes with it.',
    'End only when the JSON handoff_to is "user_approval" and execution_plan.steps contains file_write steps for the fix and tests, plus test commands when known.',
    '',
    `Incident: ${incident.title}`,
    `Provider: ${incident.provider}`,
    `External ID: ${incident.externalId}`,
    '',
    'Stack trace:',
    incident.stackTrace || 'No stack trace was provided.',
    feedback ? `\nPrevious attempt failed:\n${feedback}` : '',
    `Attempt ${attempt} of ${MAX_ATTEMPTS}.`
  ].filter(Boolean).join('\n');
}

function modelConfig(settings = {}) {
  const appSettings = loadAppSettings();
  const provider = settings.modelProvider || appSettings.defaultModels?.coding?.provider || 'ollama';
  const modelId = settings.modelId || appSettings.defaultModels?.coding?.modelId || 'qwen2.5-coder:7b';
  return {
    provider,
    modelId,
    apiKey: appSettings.apiKeys?.[provider] || ''
  };
}

async function commitChanges(incidentId, worktreePath, branchName, job) {
  const status = await runGit(worktreePath, ['status', '--porcelain=v1'], job, { allowFailure: true });
  if (!status.stdout.trim()) {
    throw new Error('The healer swarm completed but did not modify any files.');
  }
  await runGit(worktreePath, ['add', '-A'], job);
  const commit = await runGit(worktreePath, ['commit', '-m', `fix(prod): auto-heal issue ${incidentId}`], job);
  const hash = (await runGit(worktreePath, ['rev-parse', '--short', 'HEAD'], job, { allowFailure: true })).stdout.trim();
  emitStatus(incidentId, 'commit', 'done', hash || commit.stdout || branchName, { status: 'committed' });
  return hash;
}

function prBody(incident, consensus, testCommands = []) {
  return [
    '### Autonomous Bug Fix',
    `**Issue:** ${incident.title}`,
    `**Source:** ${incident.provider} ${incident.externalId || incident.id}`,
    '',
    `**Root Cause:** ${consensus.summary || consensus.handoff?.analysis || 'See code changes in this PR.'}`,
    '',
    `**Fix:** ${consensus.handoff?.instructions || 'Implemented by ZenexCoder self-healing swarm.'}`,
    '',
    `**Tests Added:** Yes`,
    testCommands.length ? `**Verification:** ${testCommands.join(', ')}` : '',
    '',
    'ZenexCoder created this pull request for human review. It did not merge or deploy the change.'
  ].filter(Boolean).join('\n');
}

async function pushAndCreatePr(incident, context, consensus, testCommands, job) {
  const remote = (await runGit(context.worktreePath, ['config', '--get', 'remote.origin.url'], job, { allowFailure: true })).stdout.trim();
  const repo = parseGitHubRemote(remote);
  if (!repo) {
    emitStatus(incident.id, 'pr', 'blocked', 'GitHub origin remote was not found.', { status: 'awaiting_pr_credentials' });
    return null;
  }

  emitStatus(incident.id, 'pr', 'running', `Pushing ${context.branchName}`);
  try {
    await runGit(context.worktreePath, ['push', '-u', 'origin', context.branchName], job);
  } catch (error) {
    emitStatus(incident.id, 'pr', 'blocked', error.message, { status: 'awaiting_pr_credentials' });
    return null;
  }

  let result;
  try {
    result = await createGitHubPullRequest({
      ...repo,
      head: context.branchName,
      base: context.baseBranch,
      title: `fix(prod): ${incident.title}`.slice(0, 240),
      body: prBody(incident, consensus, testCommands)
    });
  } catch (error) {
    emitStatus(incident.id, 'pr', 'blocked', error.message, { status: 'awaiting_pr_credentials' });
    return null;
  }

  if (!result.ok) {
    emitStatus(incident.id, 'pr', 'blocked', result.message || 'GitHub token required.', { status: 'awaiting_pr_credentials' });
    return null;
  }

  emitStatus(incident.id, 'pr', 'done', result.url, {
    status: 'pr_raised',
    prUrl: result.url,
    prNumber: result.number
  });
  notify('Self-healing PR ready', `PR #${result.number} is waiting for review.`, 'success');
  return result;
}

async function cleanupFailedWorktree(incident, job) {
  if (!job.projectPath || !job.worktreePath) return;
  const expectedRoot = path.join(job.projectPath, '.zenexcoder_worktrees');
  if (!isInside(expectedRoot, job.worktreePath)) return;
  await gitWorktreeRemove(job.projectPath, job.worktreePath, { force: true }).catch(() => {});
  emitStatus(incident.id, 'cleanup', 'done', 'Removed failed healing worktree.', {
    status: 'manual_required',
    worktreePath: ''
  });
}

export async function startAutoFix(incidentInput, settings = {}) {
  const incident = typeof incidentInput === 'string' ? getIncident(incidentInput) : incidentInput;
  if (!incident?.id) {
    throw new Error('Incident not found.');
  }
  if (activeJobs.has(incident.id)) {
    return { ok: true, alreadyRunning: true };
  }

  const job = {
    incidentId: incident.id,
    controller: new AbortController(),
    child: null,
    projectPath: '',
    worktreePath: ''
  };
  activeJobs.set(incident.id, job);

  try {
    emitStatus(incident.id, 'fetch_error', 'done', incident.title, { status: 'healing' });
    const context = await createHealingWorktree(incident, settings, job);
    const selectedModel = modelConfig(settings);
    let feedback = '';
    let consensus = null;
    let testCommands = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      updateIncident(incident.id, { attempts: attempt });
      try {
        emitStatus(incident.id, 'swarm', 'running', `${selectedModel.provider}:${selectedModel.modelId}`);
        consensus = await runShadowSwarmForResult(
          {
            prompt: buildPrompt(incident, attempt, feedback),
            projectPath: context.worktreePath,
            provider: selectedModel.provider,
            modelId: selectedModel.modelId,
            apiKey: selectedModel.apiKey,
            temperature: 0.15,
            maxTokens: 6000,
            maxIterations: 7
          },
          { timeoutMs: 15 * 60 * 1000 }
        );
        emitStatus(incident.id, 'swarm', 'done', consensus.summary || 'Consensus accepted.');
        const planResult = await executePlanSteps(incident.id, consensus.executionPlan?.steps || [], context.worktreePath, job);
        testCommands = planResult.testCommands;
        await runTests(incident.id, context.worktreePath, testCommands, job);
        await commitChanges(incident.id, context.worktreePath, context.branchName, job);
        await pushAndCreatePr(incident, context, consensus, testCommands, job);
        return { ok: true, incident: getIncident(incident.id) };
      } catch (error) {
        feedback = error.message;
        emitStatus(incident.id, 'swarm', attempt >= MAX_ATTEMPTS ? 'failed' : 'retry', feedback, {
          status: attempt >= MAX_ATTEMPTS ? 'manual_required' : 'healing'
        });
        if (attempt >= MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (!job.controller.signal.aborted) {
      await cleanupFailedWorktree(incident, job);
      emitStatus(incident.id, 'manual', 'failed', error.message, { status: 'manual_required' });
      notify('Self-healing needs review', error.message, 'warning');
    }
    return { ok: false, error: error.message, incident: getIncident(incident.id) };
  } finally {
    activeJobs.delete(incident.id);
  }
}

export async function takeOverAutoFix(incidentId) {
  const job = activeJobs.get(incidentId);
  if (job) {
    job.controller.abort();
    job.child?.kill('SIGINT');
    activeJobs.delete(incidentId);
  }
  const incident = getIncident(incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }
  const updated = updateIncident(incidentId, { status: 'manual_takeover' });
  emitStatus(incidentId, 'manual', 'done', 'Manual takeover requested.', { status: 'manual_takeover' });
  return {
    ok: true,
    incident: updated,
    worktreePath: updated.worktreePath || incident.worktreePath,
    projectPath: updated.worktreePath || incident.worktreePath || updated.projectPath || incident.projectPath
  };
}

export function stopAllAutoFixes(reason = 'App is closing.') {
  for (const job of activeJobs.values()) {
    job.controller.abort(reason);
    job.child?.kill('SIGINT');
  }
  activeJobs.clear();
}
