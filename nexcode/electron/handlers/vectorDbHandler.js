import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateEmbedding } from './embedderHandler.js';

const TABLES = {
  code: 'code_chunks',
  external: 'external_memory'
};

let dbState = null;

function dataRoot() {
  return path.join(app.getPath('userData'), '.nexcode_data', 'vector_db');
}

function fallbackPath() {
  return path.join(dataRoot(), 'fallback-vectors.json');
}

function manifestPath() {
  return path.join(dataRoot(), 'manifest.json');
}

function emptyFallback() {
  return { code_chunks: [], external_memory: [] };
}

function emptyManifest() {
  return {
    projects: {},
    external: {},
    stats: {
      codeVectors: 0,
      externalVectors: 0,
      totalFiles: 0,
      lastSyncAt: null,
      mode: 'fallback'
    }
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function quote(value = '') {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function cosineSimilarity(a = [], b = []) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeRecord(record = {}) {
  return {
    id: record.id || crypto.randomUUID(),
    project_path: record.project_path || record.projectPath || '',
    file_path: record.file_path || record.filePath || '',
    source: record.source || '',
    url: record.url || '',
    content: String(record.content || ''),
    vector: Array.isArray(record.vector) ? record.vector.map((value) => Number(value) || 0) : [],
    last_modified: Number(record.last_modified || record.lastModified || Date.now()),
    timestamp: Number(record.timestamp || Date.now()),
    chunk_index: Number(record.chunk_index || record.chunkIndex || 0),
    token_estimate: Number(record.token_estimate || record.tokenEstimate || 0)
  };
}

async function connectLance() {
  try {
    const lancedb = await import('vectordb');
    const db = await lancedb.connect(dataRoot());
    return { ok: true, db, lancedb, mode: 'lancedb' };
  } catch (error) {
    return { ok: false, db: null, lancedb: null, mode: 'fallback', error: error.message };
  }
}

export async function initVectorDb() {
  if (dbState) return dbState;
  await fs.mkdir(dataRoot(), { recursive: true });
  dbState = await connectLance();
  const manifest = await readJson(manifestPath(), emptyManifest());
  manifest.stats = {
    ...emptyManifest().stats,
    ...(manifest.stats || {}),
    mode: dbState.mode
  };
  await writeJson(manifestPath(), manifest);
  return dbState;
}

async function openTable(tableName) {
  const state = await initVectorDb();
  if (!state.ok) return null;
  try {
    return await state.db.openTable(tableName);
  } catch {
    return null;
  }
}

async function createOrAdd(tableName, records) {
  if (!records.length) return;
  const fallback = await readJson(fallbackPath(), emptyFallback());
  fallback[tableName] = [...(fallback[tableName] || []), ...records];
  await writeJson(fallbackPath(), fallback);

  const state = await initVectorDb();
  if (!state.ok) {
    return;
  }
  let table = await openTable(tableName);
  if (!table) {
    table = await state.db.createTable(tableName, records, { writeMode: state.lancedb.WriteMode.Create });
    return;
  }
  await table.add(records);
}

async function deleteWhere(tableName, filterFn, lanceWhere) {
  const fallback = await readJson(fallbackPath(), emptyFallback());
  fallback[tableName] = (fallback[tableName] || []).filter((record) => !filterFn(record));
  await writeJson(fallbackPath(), fallback);

  const table = await openTable(tableName);
  if (!table || !lanceWhere) return;
  try {
    await table.delete(lanceWhere);
  } catch {
    // Manifest and fallback stay correct even if native deletion fails.
  }
}

async function updateManifest(projectPath, filePath, lastModified, chunkCount) {
  const manifest = await readJson(manifestPath(), emptyManifest());
  const project = manifest.projects[projectPath] || { files: {} };
  project.files[filePath] = { lastModified, chunks: chunkCount, indexedAt: Date.now() };
  manifest.projects[projectPath] = project;
  manifest.stats.lastSyncAt = Date.now();
  await writeJson(manifestPath(), manifest);
}

export async function replaceCodeFileChunks(projectPath, filePath, lastModified, records = []) {
  const normalized = records.map((record) =>
    normalizeRecord({
      ...record,
      project_path: projectPath,
      file_path: filePath,
      last_modified: lastModified
    })
  );
  await deleteWhere(
    TABLES.code,
    (record) => record.project_path === projectPath && record.file_path === filePath,
    `project_path = '${quote(projectPath)}' AND file_path = '${quote(filePath)}'`
  );
  await createOrAdd(TABLES.code, normalized);
  await updateManifest(projectPath, filePath, lastModified, normalized.length);
  return normalized.length;
}

export async function deleteProjectVectors(projectPath) {
  await deleteWhere(
    TABLES.code,
    (record) => record.project_path === projectPath,
    `project_path = '${quote(projectPath)}'`
  );
  const manifest = await readJson(manifestPath(), emptyManifest());
  delete manifest.projects[projectPath];
  manifest.stats.lastSyncAt = Date.now();
  await writeJson(manifestPath(), manifest);
}

export async function insertExternalMemory(records = []) {
  const normalized = records.map(normalizeRecord).filter((record) => record.content && record.vector.length);
  for (const record of normalized) {
    await deleteWhere(TABLES.external, (item) => item.id === record.id, `id = '${quote(record.id)}'`);
  }
  await createOrAdd(TABLES.external, normalized);
  const manifest = await readJson(manifestPath(), emptyManifest());
  for (const record of normalized) {
    manifest.external[record.id] = {
      source: record.source,
      url: record.url,
      timestamp: record.timestamp,
      indexedAt: Date.now()
    };
  }
  manifest.stats.lastSyncAt = Date.now();
  await writeJson(manifestPath(), manifest);
  return normalized.length;
}

export async function indexedFileMap(projectPath) {
  const manifest = await readJson(manifestPath(), emptyManifest());
  return manifest.projects[projectPath]?.files || {};
}

async function fallbackSearch(tableName, vector, limit, projectPath = '') {
  const fallback = await readJson(fallbackPath(), emptyFallback());
  return (fallback[tableName] || [])
    .filter((record) => !projectPath || record.project_path === projectPath || tableName === TABLES.external)
    .map((record) => ({ ...record, score: cosineSimilarity(vector, record.vector || []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function searchTable(tableName, vector, limit, projectPath = '') {
  const table = await openTable(tableName);
  if (!table) return fallbackSearch(tableName, vector, limit, projectPath);
  try {
    let query = table.search(vector).limit(limit);
    if (projectPath && tableName === TABLES.code) {
      query = query.where(`project_path = '${quote(projectPath)}'`);
    }
    const rows = await query.execute();
    return rows.map((row) => ({
      ...row,
      score: typeof row._distance === 'number' ? 1 / (1 + row._distance) : row.score || 0
    }));
  } catch {
    return fallbackSearch(tableName, vector, limit, projectPath);
  }
}

export async function semanticSearch(queryText, options = {}) {
  const queryVector = Array.isArray(options.vector) ? options.vector : await generateEmbedding(queryText, options);
  const codeLimit = Number(options.codeLimit || options.limit || 5);
  const externalLimit = Number(options.externalLimit || 3);
  const [code, external] = await Promise.all([
    searchTable(TABLES.code, queryVector, codeLimit, options.projectPath || ''),
    searchTable(TABLES.external, queryVector, externalLimit, '')
  ]);
  return { code, external };
}

export async function vectorStats() {
  await initVectorDb();
  const manifest = await readJson(manifestPath(), emptyManifest());
  const fallback = await readJson(fallbackPath(), emptyFallback());
  let codeVectors = fallback.code_chunks.length;
  let externalVectors = fallback.external_memory.length;
  const codeTable = await openTable(TABLES.code);
  const externalTable = await openTable(TABLES.external);
  try {
    if (codeTable) codeVectors = await codeTable.countRows();
  } catch {}
  try {
    if (externalTable) externalVectors = await externalTable.countRows();
  } catch {}
  const totalFiles = Object.values(manifest.projects || {}).reduce((total, project) => total + Object.keys(project.files || {}).length, 0);
  return {
    codeVectors,
    externalVectors,
    totalFiles,
    lastSyncAt: manifest.stats?.lastSyncAt || null,
    mode: dbState?.mode || manifest.stats?.mode || 'fallback',
    embedModel: 'nomic-embed-text'
  };
}

export async function ragContextForPrompt(prompt, options = {}) {
  try {
    const result = await semanticSearch(prompt, {
      projectPath: options.projectPath,
      codeLimit: options.codeLimit || 5,
      externalLimit: options.externalLimit || 3,
      signal: options.signal
    });
    const code = result.code.slice(0, options.codeLimit || 5);
    const external = result.external.slice(0, options.externalLimit || 3);
    if (!code.length && !external.length) return '';
    const codeBlocks = code.map((item) => [
      `<CodeSnippet file="${item.file_path || ''}" score="${Number(item.score || 0).toFixed(3)}">`,
      item.content,
      '</CodeSnippet>'
    ].join('\n'));
    const externalBlocks = external.map((item) => [
      `<ExternalMemory source="${item.source || 'mcp'}" url="${item.url || ''}" score="${Number(item.score || 0).toFixed(3)}">`,
      item.content,
      '</ExternalMemory>'
    ].join('\n'));
    return [
      '--- AUTOMATIC CONTEXT RETRIEVAL (RAG) ---',
      'The following code snippets and external memory might be relevant:',
      ...codeBlocks,
      ...externalBlocks,
      '-----------------------------------------'
    ].join('\n');
  } catch (error) {
    return [
      '--- AUTOMATIC CONTEXT RETRIEVAL (RAG) ---',
      `RAG lookup unavailable: ${error.message}`,
      'Tip: ensure Ollama is running and nomic-embed-text is pulled.',
      '-----------------------------------------'
    ].join('\n');
  }
}

export function registerVectorDbHandlers() {
  ipcMain.handle('vector:sync-start', async (_event, payload = {}) => {
    const { startIndexing } = await import('./indexerDaemon.js');
    return startIndexing(payload);
  });
  ipcMain.handle('vector:search', async (_event, payload = {}) => {
    const results = await semanticSearch(payload.queryText || payload.query || '', {
      projectPath: payload.projectPath || '',
      limit: payload.limit || 8,
      externalLimit: payload.externalLimit || 3
    });
    return [...results.code.map((item) => ({ ...item, type: 'code' })), ...results.external.map((item) => ({ ...item, type: 'external' }))];
  });
  ipcMain.handle('vector:stats', async () => vectorStats());
}

export function vectorDbRoot() {
  return dataRoot();
}
