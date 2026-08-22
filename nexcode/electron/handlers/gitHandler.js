import { BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

const gitRoots = new Set();

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function emptyStatus(projectPath = null) {
  return {
    isRepo: false,
    projectPath,
    branch: '',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: []
  };
}

function normalizeProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    return null;
  }
  return path.resolve(projectPath);
}

async function ensureDirectory(projectPath) {
  const normalized = normalizeProjectPath(projectPath);
  if (!normalized) return null;
  const stat = await fs.stat(normalized).catch(() => null);
  return stat?.isDirectory() ? normalized : null;
}

function runGit(projectPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', projectPath, ...args], {
      windowsHide: true,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      if (options.allowFailure) {
        resolve({ code: 1, stdout, stderr: error.message });
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code === 0 || options.allowFailure) {
        resolve(result);
      } else {
        reject(new Error(stderr || `git exited with ${code}`));
      }
    });
  });
}

async function isGitRepo(projectPath) {
  const dir = await ensureDirectory(projectPath);
  if (!dir) return { isRepo: false, projectPath: normalizeProjectPath(projectPath) };
  const result = await runGit(dir, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true });
  if (result.code !== 0 || result.stdout.trim() !== 'true') {
    return { isRepo: false, projectPath: dir };
  }
  gitRoots.add(dir);
  return { isRepo: true, projectPath: dir };
}

function parseBranchLine(line = '') {
  const branchLine = line.replace(/^##\s*/, '');
  if (branchLine.startsWith('No commits yet on ')) {
    return { branch: branchLine.replace('No commits yet on ', ''), ahead: 0, behind: 0 };
  }
  const [branchPart, trackingPart = ''] = branchLine.split('...');
  const branch = branchPart === 'HEAD (no branch)' ? 'detached' : branchPart;
  const ahead = Number(trackingPart.match(/ahead\s+(\d+)/)?.[1] || 0);
  const behind = Number(trackingPart.match(/behind\s+(\d+)/)?.[1] || 0);
  return { branch, ahead, behind };
}

function statusKind(code) {
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'C') return 'copied';
  if (code === 'U') return 'conflicted';
  if (code === '?') return 'untracked';
  return 'modified';
}

function parseStatus(stdout = '', projectPath = null) {
  const status = emptyStatus(projectPath);
  status.isRepo = true;

  stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith('## ')) {
        Object.assign(status, parseBranchLine(line));
        return;
      }

      const indexStatus = line[0];
      const worktreeStatus = line[1];
      const rawPath = line.slice(3);
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
      const change = {
        path: filePath,
        status: statusKind(indexStatus !== ' ' ? indexStatus : worktreeStatus),
        indexStatus,
        worktreeStatus
      };

      if (indexStatus === '?' && worktreeStatus === '?') {
        status.untracked.push(filePath);
        return;
      }
      if (indexStatus !== ' ') {
        status.staged.push(change);
      }
      if (worktreeStatus !== ' ') {
        status.unstaged.push({
          ...change,
          status: statusKind(worktreeStatus)
        });
      }
    });

  return status;
}

function parseBranches(stdout = '') {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      name: line.replace(/^\*\s*/, ''),
      current: line.startsWith('*')
    }));
}

function parseTrack(value = '') {
  return {
    ahead: Number(value.match(/ahead\s+(\d+)/)?.[1] || 0),
    behind: Number(value.match(/behind\s+(\d+)/)?.[1] || 0)
  };
}

function parseBranchDetails(stdout = '') {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, hash, upstream, track, head] = line.split('\t');
      return {
        name,
        hash,
        upstream: upstream || '',
        current: head === '*',
        ...parseTrack(track || '')
      };
    });
}

function parseRemoteBranchDetails(stdout = '') {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, hash, date, ...subjectParts] = line.split('\t');
      return {
        name,
        hash,
        date,
        subject: subjectParts.join('\t')
      };
    })
    .filter((branch) => branch.name && !branch.name.includes('->') && !branch.name.endsWith('/HEAD'));
}

function parseWorktreeList(stdout = '', mainPath = '') {
  const records = [];
  let current = null;
  stdout.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) {
      if (current) {
        records.push(current);
        current = null;
      }
      return;
    }
    const [key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') {
      if (current) records.push(current);
      current = {
        path: value,
        branch: 'detached',
        head: '',
        isMain: path.resolve(value) === path.resolve(mainPath),
        isLocked: false,
        lockReason: '',
        prunable: false,
        pruneReason: ''
      };
      return;
    }
    if (!current) return;
    if (key === 'HEAD') current.head = value;
    if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    if (key === 'bare') current.branch = 'bare';
    if (key === 'detached') current.branch = 'detached';
    if (key === 'locked') {
      current.isLocked = true;
      current.lockReason = value || '';
    }
    if (key === 'prunable') {
      current.prunable = true;
      current.pruneReason = value || '';
    }
  });
  if (current) records.push(current);
  return records;
}

function parseLog(stdout = '') {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...messageParts] = line.split('\t');
      return {
        hash,
        shortHash: hash.slice(0, 7),
        author,
        date,
        message: messageParts.join('\t')
      };
    });
}

async function safeGitPath(projectPath, filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('No file path provided.');
  }
  const absolute = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(projectPath, filePath);
  const relative = path.relative(projectPath, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('File path is outside the project.');
  }
  return relative.replaceAll('\\', '/');
}

function validateBranchName(branchName) {
  const value = String(branchName || '').trim();
  if (!value || value.startsWith('-') || value.includes('..') || /[\s~^:?*[\]\\]/.test(value)) {
    throw new Error('Invalid branch name.');
  }
  return value;
}

function validateRefName(refName) {
  const value = String(refName || '').trim();
  if (!value || value.startsWith('-') || value.includes('..') || /[\s~^:?*[\]\\]/.test(value)) {
    throw new Error('Invalid git ref name.');
  }
  return value;
}

function pathsOverlap(firstPath, secondPath) {
  const first = path.resolve(firstPath).toLowerCase();
  const second = path.resolve(secondPath).toLowerCase();
  const firstToSecond = path.relative(first, second);
  const secondToFirst = path.relative(second, first);
  return (
    !firstToSecond ||
    (!firstToSecond.startsWith('..') && !path.isAbsolute(firstToSecond)) ||
    !secondToFirst ||
    (!secondToFirst.startsWith('..') && !path.isAbsolute(secondToFirst))
  );
}

async function validateWorktreePath(repoPath, newPath) {
  if (!newPath || typeof newPath !== 'string' || !path.isAbsolute(newPath)) {
    throw new Error('Worktree path must be an absolute path.');
  }
  const normalized = path.resolve(newPath);
  const parent = path.dirname(normalized);
  const parentStat = await fs.stat(parent).catch(() => null);
  if (!parentStat?.isDirectory()) {
    throw new Error('Worktree parent folder does not exist.');
  }
  await fs.access(parent, fsConstants.W_OK);
  const existing = await fs.stat(normalized).catch(() => null);
  if (existing) {
    const entries = existing.isDirectory() ? await fs.readdir(normalized).catch(() => []) : [];
    if (!existing.isDirectory() || entries.length) {
      throw new Error('Worktree path must be an empty folder or a new folder path.');
    }
  }
  const worktrees = await gitWorktreeList(repoPath);
  if ((worktrees.worktrees || []).some((item) => pathsOverlap(item.path, normalized))) {
    throw new Error('New worktree path cannot overlap an existing worktree.');
  }
  return normalized;
}

async function hasUncommittedChanges(projectPath) {
  const result = await runGit(projectPath, ['status', '--porcelain=v1'], { allowFailure: true });
  return Boolean(result.stdout.trim());
}

async function conflictFiles(projectPath) {
  const status = await runGit(projectPath, ['status', '--porcelain=v1'], { allowFailure: true });
  return status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => line[0] === 'U' || line[1] === 'U' || ['AA', 'DD'].includes(line.slice(0, 2)))
    .map((line) => line.slice(3));
}

async function makeUntrackedDiff(projectPath, relativePath) {
  const absolute = path.join(projectPath, relativePath);
  const content = await fs.readFile(absolute, 'utf8').catch(() => '');
  const lines = content.split(/\r?\n/).map((line) => `+${line}`).join('\n');
  return `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${content.split(/\r?\n/).length} @@\n${lines}`;
}

export async function gitStatus(projectPath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return emptyStatus(repo.projectPath);
  const result = await runGit(repo.projectPath, ['status', '--porcelain=v1', '-b'], { allowFailure: true });
  if (result.code !== 0) return emptyStatus(repo.projectPath);
  return parseStatus(result.stdout, repo.projectPath);
}

export async function gitListBranches(projectPath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false, current: '', local: [], remote: [], details: [], remoteDetails: [] };
  const [local, remote, current, details, remoteDetails] = await Promise.all([
    runGit(repo.projectPath, ['branch', '--list'], { allowFailure: true }),
    runGit(repo.projectPath, ['branch', '-r'], { allowFailure: true }),
    runGit(repo.projectPath, ['branch', '--show-current'], { allowFailure: true }),
    runGit(
      repo.projectPath,
      ['for-each-ref', '--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(upstream:track)%09%(HEAD)', 'refs/heads'],
      { allowFailure: true }
    ),
    runGit(
      repo.projectPath,
      ['for-each-ref', '--format=%(refname:short)%09%(objectname:short)%09%(committerdate:iso8601)%09%(subject)', 'refs/remotes'],
      { allowFailure: true }
    )
  ]);
  const branchDetails = parseBranchDetails(details.stdout);
  return {
    isRepo: true,
    current: current.stdout.trim() || parseBranches(local.stdout).find((branch) => branch.current)?.name || 'detached',
    local: parseBranches(local.stdout).map((branch) => branch.name),
    remote: parseBranches(remote.stdout)
      .map((branch) => branch.name)
      .filter((name) => !name.includes('->')),
    details: branchDetails,
    remoteDetails: parseRemoteBranchDetails(remoteDetails.stdout)
  };
}

export async function gitCheckoutBranch(projectPath, branchName) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  await runGit(repo.projectPath, ['checkout', validateBranchName(branchName)]);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'checkout' });
  return { ok: true };
}

export async function gitCreateBranch(projectPath, branchName, fromRef = '') {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const args = ['checkout', '-b', validateBranchName(branchName)];
  if (fromRef) args.push(validateBranchName(fromRef));
  await runGit(repo.projectPath, args);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'create-branch' });
  return { ok: true };
}

export async function gitStageFile(projectPath, filePath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const relative = await safeGitPath(repo.projectPath, filePath);
  await runGit(repo.projectPath, ['add', '--', relative]);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'stage', filePath: relative });
  return { ok: true };
}

export async function gitUnstageFile(projectPath, filePath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const relative = await safeGitPath(repo.projectPath, filePath);
  const restore = await runGit(repo.projectPath, ['restore', '--staged', '--', relative], { allowFailure: true });
  if (restore.code !== 0) {
    const reset = await runGit(repo.projectPath, ['reset', 'HEAD', '--', relative], { allowFailure: true });
    if (reset.code !== 0) {
      await runGit(repo.projectPath, ['rm', '--cached', '--', relative], { allowFailure: true });
    }
  }
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'unstage', filePath: relative });
  return { ok: true };
}

export async function gitCommit(projectPath, message) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Commit message is required.');
  }
  const result = await runGit(repo.projectPath, ['commit', '-m', cleanMessage]);
  const hashResult = await runGit(repo.projectPath, ['rev-parse', '--short', 'HEAD'], { allowFailure: true });
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'commit' });
  return {
    ok: true,
    hash: hashResult.stdout.trim(),
    summary: result.stdout.trim() || result.stderr.trim()
  };
}

export async function gitDiff(projectPath, filePath, staged = false) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false, diff: '' };
  const relative = await safeGitPath(repo.projectPath, filePath);
  const status = await gitStatus(repo.projectPath);
  if (!staged && status.untracked.includes(relative)) {
    return { isRepo: true, diff: await makeUntrackedDiff(repo.projectPath, relative) };
  }
  const args = staged ? ['diff', '--cached', '--', relative] : ['diff', '--', relative];
  const result = await runGit(repo.projectPath, args, { allowFailure: true });
  return { isRepo: true, diff: result.stdout };
}

export async function gitLog(projectPath, limit = 20) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false, commits: [] };
  const result = await runGit(
    repo.projectPath,
    ['log', `-${Math.max(1, Math.min(100, Number(limit) || 20))}`, '--pretty=format:%H%x09%an%x09%aI%x09%s'],
    { allowFailure: true }
  );
  return { isRepo: true, commits: parseLog(result.stdout) };
}

export async function gitWorktreeList(projectPath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false, worktrees: [] };
  const result = await runGit(repo.projectPath, ['worktree', 'list', '--porcelain'], { allowFailure: true });
  return { isRepo: true, worktrees: parseWorktreeList(result.stdout, repo.projectPath) };
}

export async function gitWorktreeAdd(projectPath, payload = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const newPath = await validateWorktreePath(repo.projectPath, payload.newPath);
  const args = ['worktree', 'add'];
  if (payload.createBranch) {
    args.push('-b', validateBranchName(payload.branchName), newPath, payload.fromRef ? validateRefName(payload.fromRef) : 'HEAD');
  } else {
    args.push(newPath);
    if (payload.branchName) args.push(validateRefName(payload.branchName));
  }
  const result = await runGit(repo.projectPath, args);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'worktree-add', worktreePath: newPath });
  return { ok: true, path: newPath, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitWorktreeRemove(projectPath, worktreePath, options = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const target = path.resolve(worktreePath || '');
  const list = await gitWorktreeList(repo.projectPath);
  const match = list.worktrees.find((item) => path.resolve(item.path) === target);
  if (!match) throw new Error('Worktree was not found.');
  if (match.isMain) throw new Error('Main worktree cannot be removed.');
  const args = ['worktree', 'remove'];
  if (options.force) args.push('--force');
  args.push(target);
  const result = await runGit(repo.projectPath, args);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'worktree-remove', worktreePath: target });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitWorktreePrune(projectPath) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const result = await runGit(repo.projectPath, ['worktree', 'prune']);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'worktree-prune' });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitBranchRename(projectPath, oldName, newName) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const branches = await gitListBranches(repo.projectPath);
  const detail = branches.details.find((item) => item.name === oldName);
  await runGit(repo.projectPath, ['branch', '-m', validateBranchName(oldName), validateBranchName(newName)]);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'branch-rename' });
  return {
    ok: true,
    warning: detail?.upstream ? `Upstream ${detail.upstream} was not renamed automatically.` : ''
  };
}

export async function gitBranchDelete(projectPath, branchName, options = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const cleanBranch = validateRefName(branchName);
  if (options.remote) {
    const remoteName = cleanBranch.includes('/') ? cleanBranch.split('/')[0] : 'origin';
    const remoteBranch = cleanBranch.includes('/') ? cleanBranch.split('/').slice(1).join('/') : cleanBranch;
    await runGit(repo.projectPath, ['push', remoteName, '--delete', validateRefName(remoteBranch)]);
  } else {
    await runGit(repo.projectPath, ['branch', options.force ? '-D' : '-d', validateBranchName(cleanBranch)]);
  }
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'branch-delete', branchName: cleanBranch });
  return { ok: true };
}

export async function gitSetUpstream(projectPath, branchName, remoteRef) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  await runGit(repo.projectPath, ['branch', `--set-upstream-to=${validateRefName(remoteRef)}`, validateBranchName(branchName)]);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'set-upstream' });
  return { ok: true };
}

export async function gitMerge(projectPath, sourceBranch) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const dirtyBefore = await hasUncommittedChanges(repo.projectPath);
  const result = await runGit(repo.projectPath, ['merge', '--no-edit', validateRefName(sourceBranch)], { allowFailure: true });
  if (result.code !== 0) {
    const files = await conflictFiles(repo.projectPath);
    if (files.length) {
      await runGit(repo.projectPath, ['merge', '--abort'], { allowFailure: true });
      sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'merge-conflict-abort' });
      return { ok: false, conflict: true, files, summary: result.stderr || result.stdout };
    }
    throw new Error(result.stderr || result.stdout || 'Merge failed.');
  }
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'merge', sourceBranch });
  return { ok: true, conflict: false, destructiveRisk: dirtyBefore, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitFetch(projectPath, options = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const remote = validateRefName(options.remote || 'origin');
  const result = await runGit(repo.projectPath, ['fetch', remote]);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'fetch' });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitPull(projectPath, options = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  if (!options.afterStash && await hasUncommittedChanges(repo.projectPath)) {
    return { ok: false, needsStash: true };
  }
  const branch = options.branch ? validateRefName(options.branch) : (await gitStatus(repo.projectPath)).branch;
  const args = ['pull'];
  if (options.remote || branch) {
    args.push(validateRefName(options.remote || 'origin'), validateRefName(branch));
  }
  const result = await runGit(repo.projectPath, args, { allowFailure: true });
  if (result.code !== 0) {
    if (/local changes.*would be overwritten|Please commit your changes|Your local changes/i.test(`${result.stdout}\n${result.stderr}`)) {
      return { ok: false, needsStash: true, summary: result.stderr || result.stdout };
    }
    throw new Error(result.stderr || result.stdout || 'Pull failed.');
  }
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'pull' });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitPush(projectPath, options = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const branch = options.branch ? validateRefName(options.branch) : (await gitStatus(repo.projectPath)).branch;
  const args = ['push'];
  if (options.force) args.push('--force-with-lease');
  args.push(validateRefName(options.remote || 'origin'), validateRefName(branch));
  const result = await runGit(repo.projectPath, args);
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: 'push' });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export async function gitStash(projectPath, payload = {}) {
  const repo = await isGitRepo(projectPath);
  if (!repo.isRepo) return { isRepo: false };
  const action = payload.action === 'pop' ? 'pop' : 'push';
  const args = ['stash', action];
  if (action === 'push') args.push('-u', '-m', payload.message || 'ZenexCoder auto-stash before pull');
  const result = await runGit(repo.projectPath, args, { allowFailure: true });
  if (result.code !== 0 && !/No local changes to save/i.test(`${result.stdout}\n${result.stderr}`)) {
    throw new Error(result.stderr || result.stdout || `Stash ${action} failed.`);
  }
  sendToAll('git:status-changed', { projectPath: repo.projectPath, reason: `stash-${action}` });
  return { ok: true, summary: result.stdout.trim() || result.stderr.trim() };
}

export function notifyGitStatusChanged(filePath = '') {
  const absolute = filePath ? path.resolve(filePath) : '';
  gitRoots.forEach((projectPath) => {
    if (!absolute || absolute.startsWith(projectPath)) {
      sendToAll('git:status-changed', { projectPath, reason: 'file-change', filePath });
    }
  });
}

export function registerGitHandlers() {
  ipcMain.handle('git:status', async (_event, payload = {}) => gitStatus(payload.projectPath));
  ipcMain.handle('git:branches', async (_event, payload = {}) => gitListBranches(payload.projectPath));
  ipcMain.handle('git:checkout', async (_event, payload = {}) => gitCheckoutBranch(payload.projectPath, payload.branchName));
  ipcMain.handle('git:create-branch', async (_event, payload = {}) =>
    gitCreateBranch(payload.projectPath, payload.branchName, payload.fromRef)
  );
  ipcMain.handle('git:stage', async (_event, payload = {}) => gitStageFile(payload.projectPath, payload.filePath));
  ipcMain.handle('git:unstage', async (_event, payload = {}) => gitUnstageFile(payload.projectPath, payload.filePath));
  ipcMain.handle('git:commit', async (_event, payload = {}) => gitCommit(payload.projectPath, payload.message));
  ipcMain.handle('git:diff', async (_event, payload = {}) => gitDiff(payload.projectPath, payload.filePath, payload.staged));
  ipcMain.handle('git:log', async (_event, payload = {}) => gitLog(payload.projectPath, payload.limit));
  ipcMain.handle('git:worktree-list', async (_event, payload = {}) => gitWorktreeList(payload.projectPath));
  ipcMain.handle('git:worktree-add', async (_event, payload = {}) => gitWorktreeAdd(payload.projectPath, payload));
  ipcMain.handle('git:worktree-remove', async (_event, payload = {}) =>
    gitWorktreeRemove(payload.projectPath, payload.worktreePath, { force: payload.force })
  );
  ipcMain.handle('git:worktree-prune', async (_event, payload = {}) => gitWorktreePrune(payload.projectPath));
  ipcMain.handle('git:branch-rename', async (_event, payload = {}) =>
    gitBranchRename(payload.projectPath, payload.oldName, payload.newName)
  );
  ipcMain.handle('git:branch-delete', async (_event, payload = {}) =>
    gitBranchDelete(payload.projectPath, payload.branchName, { remote: payload.remote, force: payload.force })
  );
  ipcMain.handle('git:set-upstream', async (_event, payload = {}) =>
    gitSetUpstream(payload.projectPath, payload.branchName, payload.remoteRef)
  );
  ipcMain.handle('git:merge', async (_event, payload = {}) => gitMerge(payload.projectPath, payload.sourceBranch));
  ipcMain.handle('git:fetch', async (_event, payload = {}) => gitFetch(payload.projectPath, payload));
  ipcMain.handle('git:pull', async (_event, payload = {}) => gitPull(payload.projectPath, payload));
  ipcMain.handle('git:push', async (_event, payload = {}) => gitPush(payload.projectPath, payload));
  ipcMain.handle('git:stash', async (_event, payload = {}) => gitStash(payload.projectPath, payload));
}
