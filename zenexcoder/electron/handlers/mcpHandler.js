import { BrowserWindow, app, ipcMain, safeStorage } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STORE_NAME = 'zezenexcoderr-mcp.json';
const STATUS_DISCONNECTED = 'disconnected';
const STATUS_CONNECTING = 'connecting';
const STATUS_CONNECTED = 'connected';
const STATUS_ERROR = 'error';

let cache = null;
const connections = new Map();
const state = new Map();
const closing = new Set();

function now() {
  return Date.now();
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function defaultData() {
  return { servers: [] };
}

function storePath() {
  const dir = app.getPath('userData');
  fsSync.mkdirSync(dir, { recursive: true });
  return path.join(dir, STORE_NAME);
}

function fallbackKey() {
  return crypto
    .createHash('sha256')
    .update(`zezenexcoderr-mcp:${app.getPath('userData')}:${os.userInfo().username}:${process.env.COMPUTERNAME || os.hostname()}`)
    .digest();
}

function encryptJson(value) {
  const serialized = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: 'safeStorage',
      value: safeStorage.encryptString(serialized).toString('base64')
    };
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
  if (!payload || typeof payload !== 'object') return defaultData();
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
    return defaultData();
  }
  return defaultData();
}

function loadData() {
  if (cache) return cache;
  try {
    cache = decryptJson(JSON.parse(fsSync.readFileSync(storePath(), 'utf8')));
  } catch {
    cache = defaultData();
  }
  cache.servers = (cache.servers || []).map(normalizeServer);
  return cache;
}

function saveData() {
  fsSync.writeFileSync(storePath(), JSON.stringify(encryptJson(loadData()), null, 2), 'utf8');
}

function normalizeEnv(env = {}) {
  return Object.fromEntries(
    Object.entries(env || {})
      .map(([key, value]) => [String(key || '').trim(), String(value || '')])
      .filter(([key]) => key)
  );
}

function inheritedEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'));
}

function normalizeServer(server = {}) {
  const id = server.id || crypto.randomUUID();
  return {
    id,
    name: String(server.name || 'MCP Server').trim() || 'MCP Server',
    command: String(server.command || '').trim(),
    args: Array.isArray(server.args) ? server.args.map((arg) => String(arg || '')).filter((arg) => arg.length > 0) : [],
    env: normalizeEnv(server.env),
    maskedEnvKeys: Array.isArray(server.maskedEnvKeys) ? [...new Set(server.maskedEnvKeys.map(String))] : Object.keys(server.env || {}),
    autoStart: Boolean(server.autoStart),
    createdAt: server.createdAt || now(),
    updatedAt: server.updatedAt || now()
  };
}

function listServersInternal() {
  const data = loadData();
  data.servers = data.servers.map(normalizeServer);
  return data.servers;
}

function findServer(id) {
  return listServersInternal().find((server) => server.id === id);
}

function publicState(id) {
  return state.get(id) || {
    id,
    status: STATUS_DISCONNECTED,
    tools: [],
    resources: [],
    resourceTemplates: [],
    error: ''
  };
}

function setState(id, patch = {}) {
  const next = {
    ...publicState(id),
    id,
    ...patch
  };
  state.set(id, next);
  sendToAll('mcp:status-changed', next);
  return next;
}

function jsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value || null));
  } catch {
    return null;
  }
}

function normalizeTools(result) {
  return (result?.tools || []).map((tool) => ({
    name: tool.name,
    title: tool.title || '',
    description: tool.description || '',
    inputSchema: jsonSafe(tool.inputSchema) || {},
    outputSchema: jsonSafe(tool.outputSchema) || null,
    annotations: jsonSafe(tool.annotations) || null
  }));
}

function normalizeResources(result) {
  return (result?.resources || []).map((resource) => ({
    uri: resource.uri,
    name: resource.name,
    title: resource.title || '',
    description: resource.description || '',
    mimeType: resource.mimeType || '',
    size: resource.size || null
  }));
}

function normalizeResourceTemplates(result) {
  return (result?.resourceTemplates || []).map((resource) => ({
    uriTemplate: resource.uriTemplate,
    name: resource.name,
    title: resource.title || '',
    description: resource.description || '',
    mimeType: resource.mimeType || ''
  }));
}

async function readCapabilities(client) {
  const capabilities = client.getServerCapabilities?.() || {};
  const tools = capabilities.tools
    ? normalizeTools(await client.listTools().catch(() => ({ tools: [] })))
    : [];
  const resources = capabilities.resources
    ? normalizeResources(await client.listResources().catch(() => ({ resources: [] })))
    : [];
  const resourceTemplates = capabilities.resources
    ? normalizeResourceTemplates(await client.listResourceTemplates().catch(() => ({ resourceTemplates: [] })))
    : [];
  return { tools, resources, resourceTemplates };
}

export function mcpListServers() {
  return listServersInternal();
}

export function mcpListStates() {
  return Object.fromEntries(listServersInternal().map((server) => [server.id, publicState(server.id)]));
}

export function mcpConnectedToolEntries() {
  return [...connections.entries()].flatMap(([serverId, connection]) =>
    (connection.tools || []).map((tool) => ({
      serverId,
      serverName: connection.config?.name || serverId,
      tool
    }))
  );
}

export function mcpAddServer(config = {}) {
  const data = loadData();
  const server = normalizeServer({
    ...config,
    id: crypto.randomUUID(),
    createdAt: now(),
    updatedAt: now()
  });
  if (!server.command) throw new Error('Command is required.');
  data.servers = [...listServersInternal(), server];
  saveData();
  setState(server.id, { status: STATUS_DISCONNECTED, error: '', tools: [], resources: [], resourceTemplates: [] });
  return server;
}

export function mcpUpdateServer(id, patch = {}) {
  const data = loadData();
  let updated = null;
  data.servers = listServersInternal().map((server) => {
    if (server.id !== id) return server;
    updated = normalizeServer({
      ...server,
      ...patch,
      id,
      createdAt: server.createdAt,
      updatedAt: now()
    });
    return updated;
  });
  if (!updated) throw new Error('MCP server not found.');
  if (!updated.command) throw new Error('Command is required.');
  saveData();
  return updated;
}

export async function mcpDisconnect(id) {
  const active = connections.get(id);
  closing.add(id);
  if (active) {
    try {
      await active.client.close();
    } catch {}
    try {
      await active.transport.close();
    } catch {}
    connections.delete(id);
  }
  closing.delete(id);
  return setState(id, {
    status: STATUS_DISCONNECTED,
    error: '',
    tools: [],
    resources: [],
    resourceTemplates: []
  });
}

export async function mcpDeleteServer(id) {
  await mcpDisconnect(id);
  const data = loadData();
  data.servers = listServersInternal().filter((server) => server.id !== id);
  saveData();
  state.delete(id);
  return { ok: true };
}

export async function mcpConnect(id) {
  const existing = connections.get(id);
  if (existing) return publicState(id);
  const config = findServer(id);
  if (!config) throw new Error('MCP server not found.');
  if (!config.command) throw new Error('Command is required.');

  setState(id, { status: STATUS_CONNECTING, error: '', tools: [], resources: [], resourceTemplates: [] });

  const client = new Client(
    { name: 'ZenexCoder', version: app.getVersion?.() || '1.0.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: { ...inheritedEnv(), ...normalizeEnv(config.env) },
    stderr: 'pipe'
  });
  let stderr = '';
  let suppressClose = false;

  transport.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4000);
  });

  client.onerror = (error) => {
    const message = error?.message || String(error);
    const current = publicState(id);
    if (current.status !== STATUS_CONNECTED) {
      setState(id, { status: STATUS_ERROR, error: message || stderr || 'MCP connection error.' });
    }
  };

  client.onclose = () => {
    connections.delete(id);
    if (!closing.has(id) && !suppressClose) {
      setState(id, {
        status: STATUS_DISCONNECTED,
        error: stderr.trim(),
        tools: [],
        resources: [],
        resourceTemplates: []
      });
    }
  };

  try {
    await client.connect(transport);
    const capabilities = await readCapabilities(client);
    connections.set(id, { client, transport, config, ...capabilities });
    return setState(id, {
      status: STATUS_CONNECTED,
      error: '',
      ...capabilities
    });
  } catch (error) {
    suppressClose = true;
    try {
      await client.close();
    } catch {}
    try {
      await transport.close();
    } catch {}
    connections.delete(id);
    return setState(id, {
      status: STATUS_ERROR,
      error: error?.message || stderr.trim() || 'Unable to connect MCP server.',
      tools: [],
      resources: [],
      resourceTemplates: []
    });
  }
}

export async function mcpCallTool(serverId, toolName, args = {}) {
  const connection = connections.get(serverId);
  if (!connection?.client) {
    throw new Error('MCP server is not connected.');
  }
  const tool = (connection.tools || []).find((item) => item.name === toolName);
  if (!tool) {
    throw new Error(`Tool "${toolName}" is not available on ${connection.config?.name || serverId}.`);
  }
  const result = await connection.client.callTool({
    name: toolName,
    arguments: args && typeof args === 'object' ? args : {}
  });
  return jsonSafe(result) || { content: [{ type: 'text', text: String(result || '') }] };
}

function schemaRequired(tool = {}) {
  const schema = tool.inputSchema || {};
  return Array.isArray(schema.required) ? schema.required : [];
}

function likelyReadOnlyTool(tool = {}) {
  const text = `${tool.name || ''} ${tool.title || ''} ${tool.description || ''}`.toLowerCase();
  return /(list|read|get|search|fetch|history|issue|ticket|page|message|channel|doc|note)/.test(text) &&
    !/(delete|remove|write|update|create|send|post|merge|push|commit|close)/.test(text);
}

function toolResultText(result = {}) {
  if (Array.isArray(result.content)) {
    return result.content
      .map((item) => {
        if (item.type === 'text') return item.text || '';
        if (item.resource) return JSON.stringify(item.resource);
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(result);
}

export async function mcpExternalMemoryEntries(options = {}) {
  const entries = [];
  const maxTools = Number(options.maxTools || 8);
  for (const [serverId, connection] of connections.entries()) {
    const serverName = connection.config?.name || serverId;
    for (const resource of connection.resources || []) {
      entries.push({
        id: crypto.createHash('sha1').update(`${serverId}:${resource.uri}`).digest('hex'),
        source: `mcp:${serverName}:resource`,
        url: resource.uri || '',
        content: [
          resource.title || resource.name || resource.uri,
          resource.description || '',
          resource.mimeType ? `MIME: ${resource.mimeType}` : ''
        ].filter(Boolean).join('\n'),
        timestamp: now()
      });
    }

    const safeTools = (connection.tools || [])
      .filter((tool) => likelyReadOnlyTool(tool) && schemaRequired(tool).length === 0)
      .slice(0, maxTools);
    for (const tool of safeTools) {
      try {
        const result = await connection.client.callTool({ name: tool.name, arguments: {} });
        const text = toolResultText(jsonSafe(result) || result).slice(0, 12000);
        if (text.trim()) {
          entries.push({
            id: crypto.createHash('sha1').update(`${serverId}:${tool.name}:${text.slice(0, 400)}`).digest('hex'),
            source: `mcp:${serverName}:${tool.name}`,
            url: '',
            content: text,
            timestamp: now()
          });
        }
      } catch {
        entries.push({
          id: crypto.createHash('sha1').update(`${serverId}:${tool.name}:metadata`).digest('hex'),
          source: `mcp:${serverName}:tool`,
          url: '',
          content: `${tool.name}\n${tool.description || ''}`,
          timestamp: now()
        });
      }
    }
  }
  return entries;
}

export async function autoStartMcpServers() {
  for (const server of listServersInternal().filter((item) => item.autoStart)) {
    await mcpConnect(server.id).catch((error) => {
      setState(server.id, { status: STATUS_ERROR, error: error.message || 'Auto-start failed.' });
    });
  }
}

export async function disconnectAllMcpServers() {
  const ids = [...connections.keys()];
  await Promise.all(ids.map((id) => mcpDisconnect(id).catch(() => null)));
}

export function registerMcpHandlers() {
  ipcMain.handle('mcp:list', async () => mcpListServers());
  ipcMain.handle('mcp:states', async () => mcpListStates());
  ipcMain.handle('mcp:add', async (_event, config = {}) => mcpAddServer(config));
  ipcMain.handle('mcp:update', async (_event, payload = {}) => mcpUpdateServer(payload.id, payload.patch || {}));
  ipcMain.handle('mcp:delete', async (_event, payload = {}) => mcpDeleteServer(payload.id));
  ipcMain.handle('mcp:connect', async (_event, payload = {}) => mcpConnect(payload.id));
  ipcMain.handle('mcp:disconnect', async (_event, payload = {}) => mcpDisconnect(payload.id));
  ipcMain.handle('mcp:call-tool', async (_event, payload = {}) => mcpCallTool(payload.serverId, payload.toolName, payload.args || {}));
}

process.once('exit', () => {
  for (const { client, transport } of connections.values()) {
    client.close().catch(() => {});
    transport.close().catch(() => {});
  }
});
