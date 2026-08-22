import { app, BrowserWindow, Menu, globalShortcut, ipcMain, protocol, safeStorage, shell, dialog, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase, registerDatabaseHandlers, shutdownDatabase, wipeAllDatabaseData } from './database.js';
import { registerFileHandlers } from './handlers/fileHandler.js';
import { registerTerminalHandlers, killAllTerminals } from './handlers/terminalHandler.js';
import {
  registerOllamaHandlers,
  autoStartOllama,
  stopManagedOllama,
  checkOllamaInstalled,
  checkOllamaRunning
} from './handlers/ollamaHandler.js';
import { abortAllAiStreams, registerAiHandlers } from './handlers/aiHandler.js';
import { registerVisionHandlers } from './handlers/visionHandler.js';
import { registerAgentHandlers } from './handlers/agentHandler.js';
import { registerGitHandlers } from './handlers/gitHandler.js';
import { registerEnvironmentHandlers } from './handlers/environmentHandler.js';
import { autoStartMcpServers, disconnectAllMcpServers, registerMcpHandlers, mcpListStates } from './handlers/mcpHandler.js';
import { browserGetState, registerBrowserHandlers, stopBrowserSession } from './handlers/browserHandler.js';
import { computerLock, registerComputerHandlers } from './handlers/computerHandler.js';
import { cleanupHookPortFiles, registerHookHandlers } from './handlers/hookHandler.js';
import { getHookServerState, startLocalHookServer, stopLocalHookServer } from './handlers/localServerHandler.js';
import { registerSandboxHandlers, sandboxStop } from './handlers/sandboxHandler.js';
import { registerSwarmHandlers, stopAllSwarms } from './handlers/swarmHandler.js';
import { registerVectorDbHandlers } from './handlers/vectorDbHandler.js';
import { registerSpeculativeHandlers } from './handlers/speculativeHandler.js';
import { registerGithubHandlers } from './handlers/githubHandler.js';
import { registerIncidentHandlers, stopIncidentPolling } from './handlers/incidentHandler.js';
import { stopAllAutoFixes } from './handlers/autoFixer.js';
import { registerNetworkDiscoveryHandlers, startNetworkDiscovery, stopNetworkDiscovery } from './handlers/networkDiscovery.js';
import { registerClusterClientHandlers, startClusterClient } from './handlers/websocketClient.js';
import { broadcastClusterClientEvent } from './handlers/websocketClient.js';
import { broadcastClusterServerEvent, startWebSocketServer, stopWebSocketServer } from './handlers/websocketServer.js';
import { disconnectAudioStream, registerAudioStreamHandlers } from './handlers/audioStreamHandler.js';
import { getRealtimeState } from './handlers/realtimeClient.js';
import { initLearningDatabase, registerLearningHandlers, registerLearningRulePublisher } from './handlers/learningHandler.js';
import { registerRetrospectiveHandlers, startRetrospectiveWorker, stopRetrospectiveWorker } from './handlers/retrospectiveHandler.js';
import { registerVaultHandlers } from './handlers/vaultHandler.js';
import { publishLearnedRule, registerP2pSyncHandlers, registerP2pTransports } from './handlers/p2pSyncHandler.js';
import { registerCicdHandlers } from './handlers/cicdHandler.js';
import { stopHealthMonitor } from './handlers/healthMonitor.js';
import { registerQaHandlers, stopSyntheticAgent } from './handlers/syntheticAgent.js';
import { registerOracleCloudHandlers } from './handlers/oracleCloudHandler.js';
import { registerAutomationHandlers } from './handlers/automationHandler.js';
import { registerFastSearchHandlers } from './handlers/fastSearchHandler.js';
import { registerShadowAIHandlers } from './handlers/shadowAIHandler.js';
import { registerChaosHandlers } from './handlers/chaosHandler.js';
import { registerPromptEngineHandlers } from './handlers/promptEngineHandler.js';
import { getPopoutState, togglePopoutWindow } from './windows/popoutWindow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
const startupArgs = new Set(process.argv.slice(1));
const isSmokeTest = startupArgs.has('--smoke-test');
const isSafeMode = startupArgs.has('--safe-mode');
const isFreshProfile = startupArgs.has('--fresh-profile') || startupArgs.has('--test-profile');

if (isSafeMode) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

if (isFreshProfile) {
  app.setPath('userData', path.join(app.getPath('appData'), 'ZenexCoder-TestProfile'));
}

let mainWindow;
let popoutHotkey = 'Alt+Space';
let popoutHotkeyRegistered = false;
let teardownComplete = false;
let factoryResetting = false;

const bypassSingleInstanceLock = isSafeMode || startupArgs.has('--multi-instance');
const gotSingleInstanceLock = bypassSingleInstanceLock ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

if (!bypassSingleInstanceLock) {
  app.on('second-instance', () => {
    focusMainWindow();
  });
}

class JsonStore {
  constructor({ name }) {
    this.name = name;
    this.data = null;
    this.filePath = null;
  }

  ensureLoaded() {
    if (this.data && this.filePath) return;
    const dir = app.getPath('userData');
    fsSync.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${this.name}.json`);
    try {
      this.data = JSON.parse(fsSync.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  get(key, defaultValue) {
    this.ensureLoaded();
    return this.data[key] ?? defaultValue;
  }

  set(key, value) {
    this.ensureLoaded();
    this.data[key] = value;
    try {
      fsSync.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error(`Failed to write store ${this.name}:`, err);
    }
  }

  clear() {
    this.data = {};
    if (this.filePath) {
      try {
        fsSync.writeFileSync(this.filePath, '{}', 'utf8');
      } catch {}
    }
  }
}

const store = new JsonStore({ name: 'zenexcoder-settings' });

function encryptedPayload(value) {
  const serialized = JSON.stringify(value);
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: 'safeStorage',
      value: safeStorage.encryptString(serialized).toString('base64')
    };
  }
  return {
    encoding: 'base64',
    value: Buffer.from(serialized, 'utf8').toString('base64')
  };
}

function decryptedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  try {
    if (payload.encoding === 'safeStorage') {
      return JSON.parse(
        safeStorage.decryptString(Buffer.from(payload.value, 'base64'))
      );
    }
    if (payload.encoding === 'base64') {
      return JSON.parse(Buffer.from(payload.value, 'base64').toString('utf8'));
    }
    return payload;
  } catch {
    return null;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getPreloadPath() {
  const candidates = [
    path.join(__dirname, '../preload/preload.mjs'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(app.getAppPath(), 'out/preload/preload.mjs'),
    path.join(app.getAppPath(), 'out/preload/index.mjs'),
    path.join(process.cwd(), 'out/preload/preload.mjs'),
    path.join(process.cwd(), 'out/preload/index.mjs'),
    path.join(process.cwd(), 'zenexcoder/out/preload/preload.mjs')
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../preload/preload.mjs');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZenexCoder',
    backgroundColor: '#0d0d0d',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function syncOllamaHost(host) {
  if (host) {
    process.env.OLLAMA_HOST = host;
  }
}

function registerStoreHandlers() {
  ipcMain.handle('store:get', (_event, key, defaultValue) => {
    const raw = store.get(key);
    if (raw === undefined) return defaultValue;
    return decryptedPayload(raw);
  });

  ipcMain.handle('store:set', (_event, key, value) => {
    store.set(key, encryptedPayload(value));
    return { ok: true };
  });

  ipcMain.handle('store:delete', (_event, key) => {
    store.set(key, undefined);
    return { ok: true };
  });
}

async function runAppDiagnostics(payload = {}) {
  const cards = [];
  const suggestions = [];

  function add(name, ok, details, suggestion = '') {
    cards.push({ name, ok, details });
    if (!ok && suggestion) {
      suggestions.push({ name, suggestion });
    }
  }

  const settings = decryptedPayload(store.get('settings')) || {};
  const projectPath = payload.projectPath || '';

  if (projectPath) {
    try {
      const stat = await fs.stat(projectPath);
      add('Workspace Path', stat.isDirectory(), `Path: ${projectPath}`);
    } catch {
      add('Workspace Path', false, `Invalid path: ${projectPath}`, 'Select a valid project folder in the top navigation bar.');
    }
  } else {
    add('Workspace Path', true, 'No project open.', 'Open a workspace folder to enable local git and indexer features.');
  }

  const ollamaRunning = await checkOllamaRunning().catch((err) => ({ error: err.message }));
  const ollamaInstalled = await checkOllamaInstalled().catch((err) => ({ error: err.message }));
  const browserState = await browserGetState().catch((err) => ({ error: err.message }));
  const voiceState = getRealtimeState();
  const mcpStates = mcpListStates();

  const providerChecks = [
    { key: 'openai', label: 'OpenAI', value: settings.apiKeys?.openai },
    { key: 'anthropic', label: 'Anthropic', value: settings.apiKeys?.anthropic },
    { key: 'google', label: 'Google', value: settings.apiKeys?.google },
    { key: 'groq', label: 'Groq', value: settings.apiKeys?.groq }
  ];

  for (const provider of providerChecks) {
    add(
      `${provider.label} API`,
      Boolean(provider.value),
      provider.value ? 'Key saved.' : 'Missing API key.',
      provider.value ? '' : `Add the ${provider.label} API key in Settings > API Keys.`
    );
  }

  add(
    'Ollama',
    !ollamaInstalled?.error && ollamaInstalled !== false && !ollamaRunning?.error && Boolean(ollamaRunning?.running),
    ollamaRunning?.error || (ollamaRunning?.running ? `Running ${ollamaRunning.version || 'unknown'}.` : 'Ollama not responding.'),
    'Start Ollama locally or set a working remote Ollama host in Settings.'
  );

  add(
    'Browser',
    !browserState?.error && Boolean(browserState?.active || browserState?.hasFrame),
    browserState?.error || (browserState?.active ? `${browserState.title || 'Browser ready'} ${browserState.url || ''}`.trim() : 'Browser is idle.'),
    'Open Browser and start a session before using browser tools.'
  );

  add(
    'Voice',
    !voiceState?.error && Boolean(voiceState?.connected),
    voiceState?.error || (voiceState?.connected ? `${voiceState.connectionState || 'connected'}` : 'Voice session disconnected.'),
    'Add OpenAI voice credentials and start the realtime voice session.'
  );

  const mcpCount = Array.isArray(mcpStates) ? mcpStates.length : 0;
  const connectedMcp = Array.isArray(mcpStates) ? mcpStates.filter((server) => server.status === 'connected').length : 0;
  add(
    'MCP',
    !mcpStates?.error && mcpCount === connectedMcp,
    mcpStates?.error || `${connectedMcp}/${mcpCount || 0} connected.`,
    'Open MCP Servers and connect the servers you actually want to use.'
  );

  return {
    ok: cards.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    cards,
    suggestions
  };
}

async function performTeardown() {
  if (teardownComplete) return;
  teardownComplete = true;
  stopHealthMonitor();
  stopIncidentPolling();
  stopRetrospectiveWorker();
  stopAllAutoFixes();
  stopSyntheticAgent();
  stopAllSwarms();
  killAllTerminals();
  cleanupHookPortFiles();
  await stopLocalHookServer().catch(() => {});
  await stopWebSocketServer().catch(() => {});
  await stopNetworkDiscovery().catch(() => {});
  await stopBrowserSession().catch(() => {});
  await disconnectAudioStream().catch(() => {});
  await disconnectAllMcpServers().catch(() => {});
  await sandboxStop().catch(() => {});
  stopManagedOllama();
  shutdownDatabase();
}

ipcMain.handle('app:factory-reset', async () => {
  if (factoryResetting) return { ok: false, message: 'Reset already in progress.' };
  factoryResetting = true;

  try {
    const session = await import('electron').then((m) => m.session);
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  } catch {}
  await performTeardown().catch(() => {});
  store.clear();
  wipeAllDatabaseData();
  syncOllamaHost('http://localhost:11434');

  if (isDev) {
    factoryResetting = false;
    return { ok: true };
  }

  app.relaunch();
  app.exit(0);
  return { ok: true };
});

ipcMain.handle('app:get-path', async (_event, name) => app.getPath(name));
ipcMain.handle('app:open-external', async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('app:run-diagnostics', async (_event, payload = {}) => runAppDiagnostics(payload));

function popoutOptions() {
  return {
    isDev,
    preloadPath: getPreloadPath(),
    htmlPath: path.join(__dirname, '../renderer/index.html')
  };
}

function registerPopoutShortcut() {
  globalShortcut.unregister(popoutHotkey);
  popoutHotkeyRegistered = globalShortcut.register(popoutHotkey, () => {
    const state = togglePopoutWindow(popoutOptions());
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('window:popout-state', { ...state, hotkey: popoutHotkey, registered: popoutHotkeyRegistered });
    });
  });
  return popoutHotkeyRegistered;
}

function registerWindowHandlers() {
  popoutHotkey = decryptedPayload(store.get('popout:hotkey')) || 'Alt+Space';
  ipcMain.handle('window:toggle-popout', async () => {
    const state = togglePopoutWindow(popoutOptions());
    const payload = { ...state, hotkey: popoutHotkey, registered: popoutHotkeyRegistered };
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('window:popout-state', payload));
    return payload;
  });
  ipcMain.handle('window:get-popout-state', async () => ({
    ...getPopoutState(),
    hotkey: popoutHotkey,
    registered: popoutHotkeyRegistered
  }));
  ipcMain.handle('window:set-popout-hotkey', async (_event, hotkey = 'Alt+Space') => {
    globalShortcut.unregister(popoutHotkey);
    popoutHotkey = hotkey || 'Alt+Space';
    store.set('popout:hotkey', encryptedPayload(popoutHotkey));
    const registered = registerPopoutShortcut();
    const payload = { ...getPopoutState(), hotkey: popoutHotkey, registered };
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('window:popout-state', payload));
    return payload;
  });
  ipcMain.handle('store:broadcast', async (event, payload = {}) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window.webContents.id !== event.sender.id) {
        window.webContents.send('store:sync', payload);
      }
    });
    return { ok: true };
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'zenexcoder', privileges: { standard: true, secure: true } }
]);

app.whenReady().then(() => {
  const savedSettings = decryptedPayload(store.get('settings'));
  if (savedSettings?.appSettings?.ollamaHost) {
    syncOllamaHost(savedSettings.appSettings.ollamaHost);
  }
  initDatabase();
  initLearningDatabase();
  registerP2pTransports([broadcastClusterClientEvent, broadcastClusterServerEvent]);
  registerLearningRulePublisher(publishLearnedRule);
  registerStoreHandlers();
  registerWindowHandlers();
  registerEnvironmentHandlers();
  registerDatabaseHandlers();
  registerFileHandlers();
  registerTerminalHandlers();
  registerOllamaHandlers();
  registerAiHandlers();
  registerVisionHandlers();
  registerAgentHandlers();
  registerGitHandlers();
  registerMcpHandlers();
  registerBrowserHandlers();
  registerComputerHandlers();
  registerHookHandlers();
  registerSandboxHandlers();
  registerSwarmHandlers();
  registerVectorDbHandlers();
  registerSpeculativeHandlers();
  registerGithubHandlers();
  registerIncidentHandlers();
  registerNetworkDiscoveryHandlers();
  registerClusterClientHandlers();
  registerAudioStreamHandlers();
  registerLearningHandlers();
  registerRetrospectiveHandlers();
  registerVaultHandlers();
  registerP2pSyncHandlers();
  registerCicdHandlers();
  registerOracleCloudHandlers();
  registerAutomationHandlers();
  registerFastSearchHandlers();
  registerShadowAIHandlers();
  registerChaosHandlers();
  registerPromptEngineHandlers();
  registerQaHandlers();
  registerPopoutShortcut();
  createWindow();

  Promise.resolve(startLocalHookServer()).catch((error) => console.warn("Hook server failed:", error.message));
  Promise.resolve(startWebSocketServer()).catch((error) => console.warn("Cluster WebSocket server failed:", error.message));
  Promise.resolve(startClusterClient()).catch((error) => console.warn("Cluster client failed:", error.message));
  Promise.resolve(autoStartOllama()).catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (teardownComplete || factoryResetting) return;
  event.preventDefault();
  performTeardown().finally(() => app.quit());
});
