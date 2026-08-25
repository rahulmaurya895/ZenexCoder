import { app, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const state = {
  isolation: 'host',
  running: false,
  projectPath: '',
  bridgeDir: '',
  sandboxProjectPath: 'C:\\ZenexCoderProject',
  lastWsbPath: '',
  lastError: ''
};

const sandboxFeatureName = 'Containers-DisposableClientVM';

function publicState() {
  return { ...state };
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function listenerScript() {
  return `$ErrorActionPreference = "Continue"
$Bridge = "C:\\ZenexCoderProject\\.zezenexcoderr-sandbox"
$Commands = Join-Path $Bridge "commands"
$Results = Join-Path $Bridge "results"
New-Item -ItemType Directory -Force -Path $Commands | Out-Null
New-Item -ItemType Directory -Force -Path $Results | Out-Null
while ($true) {
  Get-ChildItem -Path $Commands -Filter *.json -ErrorAction SilentlyContinue | ForEach-Object {
    $commandFile = $_.FullName
    try {
      $job = Get-Content -Raw -Path $commandFile | ConvertFrom-Json
      Remove-Item -LiteralPath $commandFile -Force -ErrorAction SilentlyContinue
      $cwd = if ($job.cwd) { $job.cwd } else { "C:\\ZenexCoderProject" }
      if (!(Test-Path -LiteralPath $cwd)) { $cwd = "C:\\ZenexCoderProject" }
      Push-Location $cwd
      $output = ""
      $exitCode = 0
      try {
        $output = cmd.exe /d /s /c $job.command 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
      } catch {
        $output = $_ | Out-String
        $exitCode = 1
      } finally {
        Pop-Location
      }
      [PSCustomObject]@{
        id = $job.id
        exitCode = $exitCode
        output = $output
        completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path (Join-Path $Results "$($job.id).json")
    } catch {
      [PSCustomObject]@{
        id = [IO.Path]::GetFileNameWithoutExtension($commandFile)
        exitCode = 1
        output = ($_ | Out-String)
        completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path (Join-Path $Results "$([IO.Path]::GetFileNameWithoutExtension($commandFile)).json")
    }
  }
  Start-Sleep -Milliseconds 350
}`;
}

function wsbXml(projectPath) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Default</Networking>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>${escapeXml(projectPath)}</HostFolder>
      <SandboxFolder>${state.sandboxProjectPath}</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${state.sandboxProjectPath}\\.zezenexcoderr-sandbox\\listener.ps1"</Command>
  </LogonCommand>
</Configuration>`;
}

function hostToSandboxPath(value = '') {
  if (!state.projectPath || !value) return state.sandboxProjectPath;
  const normalizedProject = path.resolve(state.projectPath).toLowerCase();
  const normalizedValue = path.resolve(value);
  if (!normalizedValue.toLowerCase().startsWith(normalizedProject)) {
    return state.sandboxProjectPath;
  }
  const relative = path.relative(state.projectPath, normalizedValue).replaceAll('/', '\\');
  return relative ? `${state.sandboxProjectPath}\\${relative}` : state.sandboxProjectPath;
}

function windowsSandboxAvailable() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return fsSync.existsSync(path.join(systemRoot, 'System32', 'WindowsSandbox.exe'));
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: options.windowsHide !== false,
      shell: false,
      cwd: options.cwd || undefined
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function windowsProductInfo() {
  if (process.platform !== 'win32') {
    return { productName: process.platform, editionId: process.platform };
  }
  const query = await runProcess('reg.exe', [
    'query',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    '/v',
    'ProductName'
  ]);
  const edition = await runProcess('reg.exe', [
    'query',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    '/v',
    'EditionID'
  ]);
  const productName = query.stdout.match(/ProductName\s+REG_SZ\s+(.+)/i)?.[1]?.trim() || 'Windows';
  const editionId = edition.stdout.match(/EditionID\s+REG_SZ\s+(.+)/i)?.[1]?.trim() || '';
  return { productName, editionId };
}

async function optionalFeatureState() {
  if (process.platform !== 'win32') {
    return { state: 'Unsupported', restartNeeded: false, error: 'Windows Sandbox is available only on Windows.' };
  }
  const command = [
    `$feature = Get-WindowsOptionalFeature -Online -FeatureName '${sandboxFeatureName}' -ErrorAction Stop`,
    '[PSCustomObject]@{ State = [string]$feature.State; RestartNeeded = [string]$feature.RestartNeeded } | ConvertTo-Json -Compress'
  ].join('; ');
  const result = await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
  if (result.code !== 0) {
    return { state: 'Unknown', restartNeeded: false, error: (result.stderr || result.stdout).trim() };
  }
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return {
      state: parsed.State || 'Unknown',
      restartNeeded: String(parsed.RestartNeeded || '').toLowerCase() === 'true',
      error: ''
    };
  } catch {
    return { state: 'Unknown', restartNeeded: false, error: result.stdout.trim() || 'Unable to parse feature state.' };
  }
}

export async function sandboxFeatureStatus() {
  const { productName, editionId } = await windowsProductInfo();
  const feature = await optionalFeatureState();
  const executablePresent = windowsSandboxAvailable();
  const homeEdition = /home|core/i.test(`${productName} ${editionId}`);
  const enabled = executablePresent || feature.state === 'Enabled';
  return {
    platform: process.platform,
    productName,
    editionId,
    featureName: sandboxFeatureName,
    state: enabled ? 'Enabled' : feature.state,
    restartNeeded: Boolean(feature.restartNeeded),
    executablePresent,
    enabled,
    canEnable: process.platform === 'win32' && !enabled,
    likelyUnsupported: process.platform === 'win32' && homeEdition,
    message: enabled
      ? 'Windows Sandbox is ready.'
      : homeEdition
        ? 'This Windows edition may not include Windows Sandbox. Admin enable can still be attempted.'
        : feature.error || 'Windows Sandbox is not enabled yet.'
  };
}

function featureEnableScript(resultPath) {
  return `$ErrorActionPreference = 'Stop'
$resultPath = '${resultPath.replaceAll("'", "''")}'
$featureName = '${sandboxFeatureName}'
$result = [ordered]@{
  ok = $false
  state = 'Unknown'
  restartNeeded = $false
  message = ''
  code = 0
}
try {
  $feature = Get-WindowsOptionalFeature -Online -FeatureName $featureName -ErrorAction SilentlyContinue
  if (-not $feature) {
    $result.message = "Windows Sandbox optional feature package is not available on this Windows edition."
    $result.code = 2
  } else {
    if ($feature.State -ne 'Enabled') {
      $enabled = Enable-WindowsOptionalFeature -Online -FeatureName $featureName -All -NoRestart
      $result.restartNeeded = [bool]$enabled.RestartNeeded
    }
    $after = Get-WindowsOptionalFeature -Online -FeatureName $featureName -ErrorAction Stop
    $result.state = [string]$after.State
    $result.restartNeeded = $result.restartNeeded -or [bool]$after.RestartNeeded
    $result.ok = $after.State -eq 'Enabled'
    $result.message = if ($result.restartNeeded) { 'Windows Sandbox enabled. Restart Windows to finish setup.' } else { 'Windows Sandbox enabled.' }
  }
} catch {
  $result.message = $_.Exception.Message
  $result.code = 1
}
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path $resultPath
exit $result.code`;
}

export async function sandboxEnableFeature() {
  if (process.platform !== 'win32') {
    throw new Error('Windows Sandbox can be enabled only on Windows.');
  }
  const status = await sandboxFeatureStatus();
  if (status.enabled) {
    return { ok: true, status, message: 'Windows Sandbox is already enabled.' };
  }

  const workDir = path.join(app.getPath('userData'), 'sandbox-feature');
  await fs.mkdir(workDir, { recursive: true });
  const scriptPath = path.join(workDir, 'enable-windows-sandbox.ps1');
  const resultPath = path.join(workDir, 'enable-result.json');
  await fs.rm(resultPath, { force: true });
  await fs.writeFile(scriptPath, featureEnableScript(resultPath), 'utf8');

  const wrapper = [
    '$ErrorActionPreference = "Stop"',
    `$process = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath.replaceAll("'", "''")}') -Verb RunAs -Wait -PassThru`,
    'exit $process.ExitCode'
  ].join('; ');
  const result = await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', wrapper], {
    windowsHide: false
  });

  if (!fsSync.existsSync(resultPath)) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'Windows Sandbox enable was cancelled or blocked.');
  }

  const enableResult = JSON.parse(await fs.readFile(resultPath, 'utf8'));
  const nextStatus = await sandboxFeatureStatus();
  if (!enableResult.ok && result.code !== 0) {
    throw new Error(enableResult.message || 'Windows Sandbox enable failed.');
  }
  return {
    ...enableResult,
    status: nextStatus
  };
}

async function ensureBridge(projectPath) {
  const bridgeDir = path.join(projectPath, '.zezenexcoderr-sandbox');
  await fs.mkdir(path.join(bridgeDir, 'commands'), { recursive: true });
  await fs.mkdir(path.join(bridgeDir, 'results'), { recursive: true });
  await fs.writeFile(path.join(bridgeDir, 'listener.ps1'), listenerScript(), 'utf8');
  return bridgeDir;
}

async function writeSandboxConfig(projectPath) {
  const bridgeDir = await ensureBridge(projectPath);
  const wsbPath = path.join(app.getPath('temp'), `zezenexcoderr-${crypto.createHash('sha1').update(projectPath).digest('hex').slice(0, 10)}.wsb`);
  await fs.writeFile(wsbPath, wsbXml(projectPath), 'utf8');
  state.projectPath = projectPath;
  state.bridgeDir = bridgeDir;
  state.lastWsbPath = wsbPath;
  state.lastError = '';
  return { bridgeDir, wsbPath };
}

export function sandboxIsEnabled() {
  return state.isolation === 'windows_sandbox';
}

export function getSandboxState() {
  return publicState();
}

export async function sandboxSetIsolation(isolation = 'host') {
  state.isolation = isolation === 'windows_sandbox' ? 'windows_sandbox' : 'host';
  return publicState();
}

export async function sandboxStart(projectPath) {
  if (process.platform !== 'win32') {
    throw new Error('Windows Sandbox is available only on Windows.');
  }
  if (!windowsSandboxAvailable()) {
    throw new Error('Windows Sandbox is not enabled on this machine. Enable the Windows Sandbox optional feature first.');
  }
  if (!projectPath) {
    throw new Error('Open a project before starting Windows Sandbox.');
  }
  const { wsbPath, bridgeDir } = await writeSandboxConfig(projectPath);
  const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', wsbPath], {
    windowsHide: true,
    shell: false,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  state.running = true;
  state.isolation = 'windows_sandbox';
  return { ...publicState(), wsbPath, bridgeDir };
}

export async function sandboxStop() {
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const child = spawn('taskkill.exe', ['/IM', 'WindowsSandbox.exe', '/F'], { windowsHide: true });
      child.on('close', resolve);
      child.on('error', resolve);
    });
  }
  state.running = false;
  state.isolation = 'host';
  return publicState();
}

export async function sandboxRunCommand(command, cwd, options = {}) {
  if (!sandboxIsEnabled()) {
    throw new Error('Windows Sandbox isolation is not enabled.');
  }
  if (!state.bridgeDir || !fsSync.existsSync(state.bridgeDir)) {
    if (!state.projectPath) throw new Error('Windows Sandbox is not started for a project.');
    await ensureBridge(state.projectPath);
  }
  const id = `cmd-${Date.now()}-${crypto.randomUUID()}`;
  const commandFile = path.join(state.bridgeDir, 'commands', `${id}.json`);
  const resultFile = path.join(state.bridgeDir, 'results', `${id}.json`);
  const payload = {
    id,
    command,
    cwd: hostToSandboxPath(cwd || state.projectPath),
    createdAt: Date.now()
  };
  await fs.writeFile(commandFile, JSON.stringify(payload, null, 2), 'utf8');

  const timeoutMs = options.timeoutMs || 120000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fsSync.existsSync(resultFile)) {
      const result = JSON.parse(await fs.readFile(resultFile, 'utf8'));
      await fs.rm(resultFile, { force: true });
      return {
        id,
        code: Number(result.exitCode || 0),
        stdout: result.output || '',
        stderr: ''
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for Windows Sandbox command result.');
}

export function registerSandboxHandlers() {
  ipcMain.handle('sandbox:state', async () => publicState());
  ipcMain.handle('sandbox:feature-status', async () => sandboxFeatureStatus());
  ipcMain.handle('sandbox:enable-feature', async () => sandboxEnableFeature());
  ipcMain.handle('sandbox:set-isolation', async (_event, payload = {}) => sandboxSetIsolation(payload.isolation));
  ipcMain.handle('sandbox:start', async (_event, payload = {}) => sandboxStart(payload.projectPath));
  ipcMain.handle('sandbox:stop', async () => sandboxStop());
}
