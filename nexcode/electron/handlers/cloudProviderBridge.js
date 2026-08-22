import { app, safeStorage } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STORE_NAME = 'zenexcoder-cloud-secrets.json';

function storePath() {
  const dir = app.getPath('userData');
  fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, STORE_NAME);
}

function fallbackKey() {
  return crypto
    .createHash('sha256')
    .update(`zenexcoder-cloud:${app.getPath('userData')}:${os.userInfo().username}:${process.env.COMPUTERNAME || os.hostname()}`)
    .digest();
}

function encryptJson(value) {
  const serialized = JSON.stringify(value || {});
  if (safeStorage.isEncryptionAvailable()) {
    return { encoding: 'safeStorage', value: safeStorage.encryptString(serialized).toString('base64') };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fallbackKey(), iv);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  return {
    encoding: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    value: encrypted.toString('base64')
  };
}

function decryptJson(payload) {
  if (!payload || typeof payload !== 'object') return {};
  try {
    if (payload.encoding === 'safeStorage') {
      return JSON.parse(safeStorage.decryptString(Buffer.from(payload.value, 'base64')));
    }
    if (payload.encoding === 'aes-256-gcm') {
      const decipher = crypto.createDecipheriv('aes-256-gcm', fallbackKey(), Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.value, 'base64')), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8'));
    }
  } catch {
    return {};
  }
  return {};
}

function loadSecrets() {
  try {
    return decryptJson(JSON.parse(fsSync.readFileSync(storePath(), 'utf8')));
  } catch {
    return {};
  }
}

function saveSecrets(data) {
  fsSync.writeFileSync(storePath(), JSON.stringify(encryptJson(data), null, 2), 'utf8');
}

export function saveCloudSecret(provider, payload = {}) {
  const key = String(provider || '').toLowerCase();
  if (!key) throw new Error('Provider is required.');
  const data = loadSecrets();
  data[key] = {
    ...(data[key] || {}),
    ...payload,
    updatedAt: Date.now()
  };
  saveSecrets(data);
  return { ok: true, provider: key, updatedAt: data[key].updatedAt };
}

export function getCloudSecret(provider) {
  return loadSecrets()[String(provider || '').toLowerCase()] || {};
}

function mergeProviderEnv(provider, env = {}) {
  const secret = getCloudSecret(provider);
  return {
    ...env,
    ...(secret.token ? { [`${provider.toUpperCase()}_TOKEN`]: secret.token } : {}),
    ...(secret.awsAccessKeyId ? { AWS_ACCESS_KEY_ID: secret.awsAccessKeyId } : {}),
    ...(secret.awsSecretAccessKey ? { AWS_SECRET_ACCESS_KEY: secret.awsSecretAccessKey } : {}),
    ...(secret.awsSessionToken ? { AWS_SESSION_TOKEN: secret.awsSessionToken } : {}),
    ...(secret.gcpCredentials ? { GOOGLE_APPLICATION_CREDENTIALS: secret.gcpCredentials } : {})
  };
}

function mask(text = '') {
  return String(text || '')
    .replace(/(token=|--token\s+|Bearer\s+)[^\s]+/gi, '$1***')
    .replace(/(AWS_SECRET_ACCESS_KEY=)[^\s]+/gi, '$1***')
    .replace(/(VERCEL_TOKEN=)[^\s]+/gi, '$1***');
}

function localBin(projectPath, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const candidate = path.join(projectPath, 'node_modules', '.bin', `${name}${suffix}`);
  return fsSync.existsSync(candidate) ? candidate : name;
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      windowsHide: true,
      shell: process.platform === 'win32' && /\.cmd$/i.test(command)
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs || 120000);
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      options.onLog?.(mask(text.trim()), 'stdout');
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      options.onLog?.(mask(text.trim()), 'stderr');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(mask(stderr || stdout || `${command} exited with code ${code}`)));
      }
    });
  });
}

export async function validateCloudAuth({ provider, projectPath, env = {}, soft = false, onLog } = {}) {
  const normalized = String(provider || 'vercel').toLowerCase();
  const cloudEnv = mergeProviderEnv(normalized, env);

  if (normalized === 'aws') {
    if (!cloudEnv.AWS_ACCESS_KEY_ID && !cloudEnv.AWS_PROFILE) {
      if (soft) return { ok: false, provider: normalized, message: 'AWS credentials not found; dry-run can continue.' };
      throw new Error('AWS credentials missing. Add AWS env vars, AWS profile, or save provider credentials.');
    }
    try {
      const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
      const client = new STSClient({ region: cloudEnv.AWS_REGION || 'us-east-1' });
      const identity = await client.send(new GetCallerIdentityCommand({}));
      return { ok: true, provider: normalized, account: identity.Account || '' };
    } catch (error) {
      if (soft) return { ok: false, provider: normalized, message: `AWS auth not verified: ${error.message}` };
      throw error;
    }
  }

  if (normalized === 'gcp') {
    if (cloudEnv.GOOGLE_APPLICATION_CREDENTIALS) {
      return { ok: true, provider: normalized, source: 'GOOGLE_APPLICATION_CREDENTIALS' };
    }
    try {
      await run('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], {
        cwd: projectPath,
        env: cloudEnv,
        timeoutMs: 15000,
        onLog
      });
      return { ok: true, provider: normalized, source: 'gcloud' };
    } catch (error) {
      if (soft) return { ok: false, provider: normalized, message: 'GCP auth not found; dry-run can continue.' };
      throw new Error(`GCP auth missing. Add GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth login. ${error.message}`);
    }
  }

  const token = cloudEnv.VERCEL_TOKEN || getCloudSecret('vercel').token || '';
  if (token) return { ok: true, provider: 'vercel', source: 'VERCEL_TOKEN' };
  try {
    await run(localBin(projectPath || process.cwd(), 'vercel'), ['whoami'], {
      cwd: projectPath,
      env: cloudEnv,
      timeoutMs: 15000,
      onLog
    });
    return { ok: true, provider: 'vercel', source: 'vercel login' };
  } catch (error) {
    if (soft) return { ok: false, provider: 'vercel', message: 'Vercel token/login not found; dry-run can continue.' };
    throw new Error('Vercel auth missing. Add VERCEL_TOKEN or run vercel login.');
  }
}

export async function deployWithProvider({ provider, projectPath, deployDir, target = 'staging', dryRun = true, env = {}, onLog } = {}) {
  const normalized = String(provider || 'vercel').toLowerCase();
  const cloudEnv = mergeProviderEnv(normalized, env);
  const auth = await validateCloudAuth({ provider: normalized, projectPath, env: cloudEnv, soft: dryRun, onLog });
  const commands = [];

  if (normalized === 'vercel') {
    const args = ['deploy', '--yes'];
    if (target === 'production') args.push('--prod');
    if (cloudEnv.VERCEL_TOKEN) args.push('--token', cloudEnv.VERCEL_TOKEN);
    commands.push(`vercel ${mask(args.join(' '))}`);
    if (!dryRun) {
      const result = await run(localBin(projectPath, 'vercel'), args, { cwd: projectPath, env: cloudEnv, timeoutMs: 600000, onLog });
      return { provider: normalized, auth, commands, url: extractUrl(result.stdout), stdout: mask(result.stdout) };
    }
    return { provider: normalized, auth, commands, dryRun: true };
  }

  const tfArgs = dryRun ? ['plan', '-input=false'] : ['apply', '-auto-approve', '-input=false'];
  commands.push('terraform init -input=false');
  commands.push(`terraform ${tfArgs.join(' ')}`);
  if (!dryRun) {
    await run('terraform', ['init', '-input=false'], { cwd: deployDir, env: cloudEnv, timeoutMs: 300000, onLog });
    const result = await run('terraform', tfArgs, { cwd: deployDir, env: cloudEnv, timeoutMs: 900000, onLog });
    return { provider: normalized, auth, commands, stdout: mask(result.stdout) };
  }
  return { provider: normalized, auth, commands, dryRun: true };
}

export async function rollbackWithProvider({ provider, projectPath, deployDir, dryRun = false, env = {}, onLog } = {}) {
  const normalized = String(provider || 'vercel').toLowerCase();
  const cloudEnv = mergeProviderEnv(normalized, env);
  if (normalized === 'vercel') {
    const command = 'vercel rollback <deployment-url>';
    onLog?.(dryRun ? `${command} (dry-run)` : 'Manual Vercel rollback requires selecting a previous deployment in Vercel.', 'info');
    return { ok: true, provider: normalized, command, manual: true };
  }
  const args = ['destroy', '-auto-approve', '-input=false'];
  if (dryRun) return { ok: true, provider: normalized, command: `terraform ${args.join(' ')}`, dryRun: true };
  await run('terraform', args, { cwd: deployDir, env: cloudEnv, timeoutMs: 900000, onLog });
  return { ok: true, provider: normalized, command: `terraform ${args.join(' ')}` };
}

function extractUrl(stdout = '') {
  const match = String(stdout || '').match(/https?:\/\/[^\s]+/);
  return match?.[0] || '';
}
