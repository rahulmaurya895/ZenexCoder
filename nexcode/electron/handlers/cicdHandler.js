import { BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProjectEnvironment } from './environmentHandler.js';
import { deployWithProvider, rollbackWithProvider, saveCloudSecret } from './cloudProviderBridge.js';
import { registerDeploymentMonitor, registerRollbackHandler, runOneHealthCheck, stopHealthMonitor } from './healthMonitor.js';
import { generateIaC } from '../../src/utils/iacGenerator.js';

let currentDeployment = null;
let logs = [];
let running = false;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function emitLog(phase, message, level = 'info', deploymentId = currentDeployment?.id) {
  const payload = { deploymentId, phase, message, level, time: Date.now() };
  logs = [payload, ...logs].slice(0, 500);
  sendToAll('cicd:logs-stream', payload);
}

function emitStatus(status, phase, patch = {}) {
  currentDeployment = {
    ...(currentDeployment || {}),
    ...patch,
    status,
    phase,
    updatedAt: Date.now()
  };
  sendToAll('cicd:status-update', { status, phase, deployment: currentDeployment });
}

function resolveProject(projectPath = '') {
  const resolved = path.resolve(projectPath || process.cwd());
  if (!fsSync.existsSync(resolved)) throw new Error('Project path does not exist.');
  return resolved;
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function maybeRead(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function writeIacFiles(projectPath, provider) {
  const packageJson = await readJson(path.join(projectPath, 'package.json'), {});
  const envExample = await maybeRead(path.join(projectPath, '.env.example'));
  const plan = generateIaC({ provider, packageJson, envExample, projectName: path.basename(projectPath), healthPath: '/health' });
  const deployDir = path.join(projectPath, '.zenexcoder', 'deploy');
  await fs.mkdir(deployDir, { recursive: true });
  for (const file of plan.files) {
    await fs.writeFile(path.join(deployDir, file.fileName), file.content, 'utf8');
  }
  emitLog('iac', `Generated ${plan.files.length} IaC files in ${deployDir}.`);
  return { ...plan, deployDir };
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: Boolean(options.shell)
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs || 300000);
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      options.onLog?.(text.trim(), 'stdout');
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      options.onLog?.(text.trim(), 'stderr');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function runCommandLine(commandLine, cwd, env, phase) {
  if (!commandLine?.trim()) return { skipped: true };
  emitLog(phase, `$ ${commandLine}`);
  return run(commandLine, [], {
    cwd,
    env,
    shell: true,
    timeoutMs: 900000,
    onLog: (line, type) => line && emitLog(phase, line, type === 'stderr' ? 'warning' : 'info')
  });
}

async function gitInfo(projectPath) {
  try {
    await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath, timeoutMs: 10000 });
    const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: projectPath, timeoutMs: 10000 })).stdout.trim();
    const status = (await run('git', ['status', '--porcelain'], { cwd: projectPath, timeoutMs: 10000 })).stdout.trim();
    return { isRepo: true, head, dirty: Boolean(status), status };
  } catch {
    return { isRepo: false, head: '', dirty: false, status: '' };
  }
}

async function protectGitState(projectPath, liveDeploy) {
  const info = await gitInfo(projectPath);
  if (!info.isRepo) {
    emitLog('git', 'No Git repository detected; deployment can continue with IaC metadata only.', 'warning');
    return info;
  }
  emitLog('git', `Captured rollback ref ${info.head.slice(0, 10)}.`);
  if (liveDeploy && info.dirty) {
    const message = `ZenexCoder CI/CD autostash ${new Date().toISOString()}`;
    await run('git', ['stash', 'push', '-u', '-m', message], { cwd: projectPath, timeoutMs: 60000 });
    emitLog('git', 'Dirty working tree stashed before live deploy.');
    return { ...info, stashed: true, stashMessage: message };
  }
  if (info.dirty) emitLog('git', 'Working tree has changes; dry-run kept them untouched.', 'warning');
  return info;
}

function defaultCommand(packageJson, name, fallback = '') {
  const script = packageJson.scripts?.[name];
  if (!script || /echo .*no test/i.test(script)) return fallback;
  return `pnpm run ${name}`;
}

async function performHealth(projectPath, deployment, healthUrl, dryRun) {
  if (!healthUrl) {
    emitLog('health', 'No health URL provided; health gate skipped.', 'warning');
    return { status: dryRun ? 'dry-run' : 'skipped' };
  }
  if (dryRun) {
    emitLog('health', `Would monitor ${healthUrl} every 30 seconds after live deploy.`);
    return { status: 'dry-run', url: healthUrl };
  }
  const health = await runOneHealthCheck(healthUrl);
  emitLog('health', `${healthUrl} ${health.status || 'ERR'} in ${health.latencyMs}ms`, health.ok ? 'info' : 'error');
  if (!health.ok || health.avgLatencyMs > 2000 || health.errorRate > 0.05) {
    await rollbackDeployment(deployment.id, 'initial-health-check');
    throw new Error('Initial health check failed and rollback was triggered.');
  }
  registerDeploymentMonitor({ ...deployment, healthUrl, projectPath });
  return { ...health, url: healthUrl };
}

export async function startDeployment(payload = {}) {
  if (running) throw new Error('A deployment is already running.');
  const projectPath = resolveProject(payload.projectPath);
  const provider = payload.provider || 'vercel';
  const target = payload.target || 'staging';
  const dryRun = payload.dryRun !== false;
  const liveDeploy = !dryRun || target === 'production';
  if (liveDeploy && !payload.approved) {
    throw new Error('Approval required before live or production deployment.');
  }

  running = true;
  logs = [];
  const id = crypto.randomUUID();
  currentDeployment = {
    id,
    provider,
    target,
    dryRun,
    projectPath,
    status: 'running',
    phase: 'initializing',
    createdAt: Date.now()
  };
  emitStatus('running', 'initializing', currentDeployment);

  try {
    const env = await buildProjectEnvironment(projectPath, payload.env || {});
    const packageJson = await readJson(path.join(projectPath, 'package.json'), {});
    const git = await protectGitState(projectPath, liveDeploy);
    emitStatus('running', 'iac', { rollbackRef: git.head || '', git });
    const iac = await writeIacFiles(projectPath, provider);

    const testCommand = payload.testCommand || defaultCommand(packageJson, 'test');
    if (testCommand) {
      emitStatus('testing', 'test', { iac });
      await runCommandLine(testCommand, projectPath, env, 'test');
    } else {
      emitLog('test', 'No usable test script found; test step skipped.', 'warning');
    }

    const buildCommand = payload.buildCommand || defaultCommand(packageJson, 'build');
    if (buildCommand) {
      emitStatus('building', 'build');
      await runCommandLine(buildCommand, projectPath, env, 'build');
    } else {
      emitLog('build', 'No build script found; build step skipped.', 'warning');
    }

    emitStatus('deploying', dryRun ? 'deploy-dry-run' : 'deploy');
    const deployResult = await deployWithProvider({
      provider,
      projectPath,
      deployDir: iac.deployDir,
      target,
      dryRun,
      env,
      onLog: (line, level) => line && emitLog('deploy', line, level === 'stderr' ? 'warning' : 'info')
    });

    const deploymentUrl = deployResult.url || payload.deploymentUrl || '';
    const healthUrl = payload.healthUrl || (deploymentUrl ? `${deploymentUrl.replace(/\/$/, '')}/health` : '');
    const health = await performHealth(projectPath, currentDeployment, healthUrl, dryRun);
    const finalStatus = dryRun ? 'success' : 'deployed';
    emitStatus(finalStatus, dryRun ? 'dry-run-complete' : 'monitoring', {
      deployResult,
      health,
      deploymentUrl,
      healthUrl,
      lastSuccessfulAt: Date.now()
    });
    emitLog('complete', dryRun ? 'Dry-run completed without live deployment.' : 'Deployment live; health monitor is active.');
    return currentDeployment;
  } catch (error) {
    emitStatus('failed', 'failed', { error: error.message });
    emitLog('failed', error.message, 'error');
    throw error;
  } finally {
    running = false;
  }
}

export async function rollbackDeployment(deploymentId, reason = 'manual') {
  const deployment = currentDeployment;
  if (!deployment || (deploymentId && deployment.id !== deploymentId)) {
    throw new Error('No matching deployment to roll back.');
  }
  emitStatus('rollback', 'rollback', { rollbackReason: reason });
  stopHealthMonitor(deployment.id);
  const env = await buildProjectEnvironment(deployment.projectPath, {});
  const result = await rollbackWithProvider({
    provider: deployment.provider,
    projectPath: deployment.projectPath,
    deployDir: path.join(deployment.projectPath, '.zenexcoder', 'deploy'),
    dryRun: deployment.dryRun,
    env,
    onLog: (line, level) => line && emitLog('rollback', line, level === 'stderr' ? 'warning' : 'info')
  });
  emitLog('rollback', `Rollback handled for ${deployment.provider}. Local Git ref preserved at ${deployment.rollbackRef || 'unknown'}.`);
  emitStatus('rolled-back', 'rolled-back', { rollbackResult: result });
  return { ok: true, deployment: currentDeployment };
}

export function registerCicdHandlers() {
  registerRollbackHandler(rollbackDeployment);
  ipcMain.handle('cicd:get-state', async () => ({
    status: currentDeployment?.status || 'idle',
    phase: currentDeployment?.phase || 'ready',
    deployment: currentDeployment,
    logs
  }));
  ipcMain.handle('cicd:generate-iac', async (_event, payload = {}) => {
    const projectPath = resolveProject(payload.projectPath);
    return writeIacFiles(projectPath, payload.provider || 'vercel');
  });
  ipcMain.handle('cicd:deploy-start', async (_event, payload = {}) => startDeployment(payload));
  ipcMain.handle('cicd:rollback-manual', async (_event, payload = {}) => rollbackDeployment(payload.deploymentId, 'manual'));
  ipcMain.handle('cicd:save-provider-token', async (_event, payload = {}) => saveCloudSecret(payload.provider, payload.secret || payload));
}
