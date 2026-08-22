import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { splitText } from '../../src/utils/textSplitter.js';
import { generateEmbedding } from './embedderHandler.js';
import {
  deleteProjectVectors,
  indexedFileMap,
  insertExternalMemory,
  replaceCodeFileChunks,
  vectorStats
} from './vectorDbHandler.js';
import { mcpExternalMemoryEntries } from './mcpHandler.js';
import { isSwarmActive } from './swarmHandler.js';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.pnpm-store'
]);

const INDEXABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.html',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.py',
  '.java',
  '.kt',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.cs',
  '.sql',
  '.sh',
  '.ps1',
  '.bat'
]);

const MAX_FILE_SIZE = 1024 * 1024;
let activeJob = null;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSwarm(signal) {
  while (isSwarmActive()) {
    if (signal?.aborted) throw new Error('Indexing aborted.');
    sendToAll('vector:sync-progress', {
      jobId: activeJob?.jobId,
      current: activeJob?.current || 0,
      total: activeJob?.total || 0,
      status: 'Paused while swarm is generating'
    });
    await sleep(1000);
  }
}

async function readGitignore(projectPath) {
  try {
    const text = await fs.readFile(path.join(projectPath, '.gitignore'), 'utf8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/^\//, '').replace(/\/$/, ''));
  } catch {
    return [];
  }
}

function ignoredByGitignore(relativePath, patterns = []) {
  const normalized = relativePath.replaceAll('\\', '/');
  return patterns.some((pattern) => {
    if (!pattern) return false;
    if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*');
      return new RegExp(`(^|/)${escaped}($|/)`).test(normalized);
    }
    return normalized === pattern || normalized.startsWith(`${pattern}/`) || normalized.endsWith(`/${pattern}`);
  });
}

function shouldIndexFile(filePath, stat) {
  if (stat.size <= 0 || stat.size > MAX_FILE_SIZE) return false;
  return INDEXABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function scanProject(projectPath, options = {}) {
  const gitignore = await readGitignore(projectPath);
  const files = [];

  async function walk(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (options.maxFiles && files.length >= options.maxFiles) return;
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(projectPath, fullPath);
      if (ignoredByGitignore(relativePath, gitignore)) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || !shouldIndexFile(fullPath, stat)) continue;
      files.push({ filePath: fullPath, relativePath, lastModified: stat.mtimeMs, size: stat.size });
    }
  }

  await walk(projectPath);
  return files;
}

function chunkId(projectPath, filePath, chunkIndex, content) {
  return crypto.createHash('sha1').update(`${projectPath}:${filePath}:${chunkIndex}:${content}`).digest('hex');
}

async function embedChunks(projectPath, file, chunks, signal) {
  const records = [];
  for (const chunk of chunks) {
    if (signal?.aborted) throw new Error('Indexing aborted.');
    await waitForSwarm(signal);
    const vector = await generateEmbedding(chunk.content, { signal });
    records.push({
      id: chunkId(projectPath, file.filePath, chunk.index, chunk.content),
      project_path: projectPath,
      file_path: file.filePath,
      content: chunk.content,
      vector,
      last_modified: file.lastModified,
      chunk_index: chunk.index,
      token_estimate: chunk.tokenEstimate
    });
    await sleep(0);
  }
  return records;
}

async function indexCodebase(projectPath, payload, signal) {
  if (payload.force) {
    await deleteProjectVectors(projectPath);
  }
  const manifest = payload.force ? {} : await indexedFileMap(projectPath);
  const files = await scanProject(projectPath, { maxFiles: payload.maxFiles || 1200 });
  const changed = files.filter((file) => {
    const known = manifest[file.filePath];
    return !known || Number(known.lastModified || 0) < file.lastModified;
  });
  activeJob.total = changed.length;

  let vectors = 0;
  for (let index = 0; index < changed.length; index += 1) {
    if (signal?.aborted) throw new Error('Indexing aborted.');
    await waitForSwarm(signal);
    const file = changed[index];
    activeJob.current = index + 1;
    sendToAll('vector:sync-progress', {
      jobId: activeJob.jobId,
      current: index + 1,
      total: changed.length,
      status: `Indexing ${path.basename(file.filePath)}`
    });
    const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
    const chunks = splitText(content, { chunkTokens: 500, overlapTokens: 50 });
    const records = await embedChunks(projectPath, file, chunks, signal);
    vectors += await replaceCodeFileChunks(projectPath, file.filePath, file.lastModified, records);
    await sleep(25);
  }
  return { files: changed.length, vectors };
}

async function indexExternalMemory(signal) {
  const entries = await mcpExternalMemoryEntries({ maxTools: 6 });
  let vectors = 0;
  for (const entry of entries) {
    if (signal?.aborted) throw new Error('Indexing aborted.');
    await waitForSwarm(signal);
    const chunks = splitText(entry.content, { chunkTokens: 500, overlapTokens: 50 }).slice(0, 8);
    const records = [];
    for (const chunk of chunks) {
      const vector = await generateEmbedding(chunk.content, { signal });
      records.push({
        id: crypto.createHash('sha1').update(`${entry.id}:${chunk.index}:${chunk.content}`).digest('hex'),
        source: entry.source,
        url: entry.url || '',
        content: chunk.content,
        vector,
        timestamp: entry.timestamp || Date.now(),
        chunk_index: chunk.index,
        token_estimate: chunk.tokenEstimate
      });
      await sleep(0);
    }
    vectors += await insertExternalMemory(records);
  }
  return { sources: entries.length, vectors };
}

export async function startIndexing(payload = {}) {
  const projectPath = payload.projectPath || payload.cwd;
  if (!projectPath) {
    throw new Error('Open a project before indexing.');
  }
  if (activeJob?.controller) {
    activeJob.controller.abort('Superseded by a new indexing job.');
  }
  const controller = new AbortController();
  const jobId = `vector-sync-${Date.now()}`;
  activeJob = {
    jobId,
    controller,
    current: 0,
    total: 0
  };

  sendToAll('vector:sync-progress', { jobId, current: 0, total: 0, status: 'Scanning project' });

  const run = async () => {
    try {
      const code = await indexCodebase(projectPath, payload, controller.signal);
      let external = { sources: 0, vectors: 0 };
      if (payload.indexExternal) {
        sendToAll('vector:sync-progress', { jobId, current: code.files, total: code.files, status: 'Indexing external MCP memory' });
        external = await indexExternalMemory(controller.signal);
      }
      const stats = await vectorStats();
      sendToAll('vector:sync-progress', {
        jobId,
        current: activeJob?.total || 0,
        total: activeJob?.total || 0,
        status: 'Complete',
        done: true,
        stats,
        code,
        external
      });
    } catch (error) {
      sendToAll('vector:sync-progress', {
        jobId,
        current: activeJob?.current || 0,
        total: activeJob?.total || 0,
        status: error.message,
        error: error.message
      });
    } finally {
      if (activeJob?.jobId === jobId) activeJob = null;
    }
  };

  run();
  return { ok: true, jobId };
}
