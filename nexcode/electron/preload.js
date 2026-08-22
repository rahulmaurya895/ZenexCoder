import { contextBridge, ipcRenderer } from 'electron';

function id(prefix = 'req') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function streamInvoker(baseChannel, params, handlers = {}) {
  const requestId = params?.requestId || id(baseChannel.replace(':', '-'));
  const disposers = [
    handlers.onToken && on(`${baseChannel}:token:${requestId}`, handlers.onToken),
    handlers.onProgress && on(`${baseChannel}:progress:${requestId}`, handlers.onProgress),
    handlers.onDone && on(`${baseChannel}:done:${requestId}`, handlers.onDone),
    handlers.onError && on(`${baseChannel}:error:${requestId}`, handlers.onError)
  ].filter(Boolean);

  ipcRenderer.invoke(baseChannel, { ...params, requestId }).catch((error) => {
    handlers.onError?.({ message: error.message });
  });

  return {
    requestId,
    dispose: () => disposers.forEach((dispose) => dispose()),
    abort: () => ipcRenderer.invoke(`${baseChannel}:abort`, requestId)
  };
}

const api = {
  ai: {
    stream: (params, handlers) => streamInvoker('ai:stream', params, handlers),
    abort: (requestId) => ipcRenderer.invoke('ai:stream:abort', requestId),
    abortAll: (reason) => ipcRenderer.invoke('ai:abort-all', reason),
    testProvider: (params) => ipcRenderer.invoke('ai:test-provider', params)
  },
  file: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', { filePath, content }),
    patch: (filePath, searchTarget, replacementContent) => ipcRenderer.invoke('file:patch', { filePath, searchTarget, replacementContent }),
    rename: (oldPath, newPath) => ipcRenderer.invoke('file:rename', { oldPath, newPath }),

    delete: (filePath) => ipcRenderer.invoke('file:delete', filePath),
    stat: (filePath) => ipcRenderer.invoke('file:stat', filePath),
    openDialog: (options) => ipcRenderer.invoke('file:open-dialog', options),
    reveal: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
    onSaved: (callback) => on('file:saved', callback)
  },
  folder: {
    openDialog: () => ipcRenderer.invoke('folder:open-dialog'),
    readTree: (folderPath) => ipcRenderer.invoke('folder:read-tree', folderPath)
  },
  terminal: {
    run: (params, handlers = {}) => {
      const runId = params?.runId || id('run');
      const disposers = [
        on('terminal:run-output', (payload) => payload.runId === runId && handlers.onOutput?.(payload)),
        on('terminal:run-exit', (payload) => payload.runId === runId && handlers.onExit?.(payload))
      ];
      ipcRenderer.invoke('terminal:run', { ...params, runId }).catch((error) => {
        handlers.onOutput?.({ runId, type: 'stderr', data: error.message });
      });
      return { runId, dispose: () => disposers.forEach((dispose) => dispose()) };
    },
    create: (params) => ipcRenderer.invoke('terminal:create', params),
    getShells: () => ipcRenderer.invoke('terminal:get-shells'),
    setShell: (shellPath) => ipcRenderer.invoke('terminal:set-shell', { shellPath }),
    write: (terminalId, data) => ipcRenderer.send('terminal:write', { terminalId, data }),
    resize: (terminalId, cols, rows) => ipcRenderer.send('terminal:resize', { terminalId, cols, rows }),
    kill: (terminalId) => ipcRenderer.invoke('terminal:kill', terminalId),
    onData: (callback) => on('terminal:data', callback),
    onExit: (callback) => on('terminal:exit', callback),
    onShellChanged: (callback) => on('terminal:shell-changed', callback)
  },
  ollama: {
    check: () => ipcRenderer.invoke('ollama:check'),
    install: (params, handlers) => streamInvoker('ollama:install', params, handlers),
    pull: (modelName, handlers) => streamInvoker('ollama:pull', { modelName }, handlers),
    abortPull: (requestId) => ipcRenderer.invoke('ollama:pull:abort', requestId),
    models: () => ipcRenderer.invoke('ollama:models'),
    deleteModel: (modelName) => ipcRenderer.invoke('ollama:delete', modelName),
    start: () => ipcRenderer.invoke('ollama:start'),
    stop: () => ipcRenderer.invoke('ollama:stop'),
    ps: () => ipcRenderer.invoke('ollama:ps'),
    loadModel: (modelName) => ipcRenderer.invoke('ollama:load', modelName),
    runPrompt: (params, handlers) => streamInvoker('ollama:prompt', params, handlers),
    runChat: (params, handlers) => streamInvoker('ollama:chat', params, handlers)
  },
  vision: {
    captureScreen: () => ipcRenderer.invoke('screen:capture'),
    readImage: (filePath) => ipcRenderer.invoke('vision:read-image', filePath),
    openImageDialog: () => ipcRenderer.invoke('vision:open-image-dialog'),
    compressImage: (dataUrl) => ipcRenderer.invoke('vision:compress-image', dataUrl)
  },
  agent: {
    startRun: (payload) => ipcRenderer.invoke('agent:start-run', payload),
    control: (payload) => ipcRenderer.invoke('agent:control', payload),
    requestApproval: (payload) => ipcRenderer.invoke('agent:approval-request', payload),
    respondApproval: (payload) => ipcRenderer.invoke('agent:approval-response', payload),
    onStepUpdate: (callback) => on('agent:step-update', callback),
    onRunUpdate: (callback) => on('agent:run-update', callback),
    onApprovalPending: (callback) => on('agent:approval-pending', callback),
    onApprovalResolved: (callback) => on('agent:approval-resolved', callback)
  },
  swarm: {
    startTask: (payload) => ipcRenderer.invoke('swarm:start-task', payload),
    halt: (taskId) => ipcRenderer.invoke('swarm:halt', { taskId }),
    onAgentTurn: (callback) => on('swarm:agent-turn', callback),
    onInternalMessage: (callback) => on('swarm:internal-msg', callback),
    onConsensus: (callback) => on('swarm:consensus', callback),
    onHalt: (callback) => on('swarm:halt', callback),
    onError: (callback) => on('swarm:error', callback)
  },
  review: {
    list: (status) => ipcRenderer.invoke('review:list', status),
    add: (payload) => ipcRenderer.invoke('review:add', payload),
    action: (payload) => ipcRenderer.invoke('review:action', payload),
    openDetached: () => ipcRenderer.invoke('review:open-detached'),
    onUpdate: (callback) => on('review:update', callback)
  },
  approvals: {
    log: (payload) => ipcRenderer.invoke('approvals:log', payload)
  },
  env: {
    list: (projectPath) => ipcRenderer.invoke('env:list', { projectPath }),
    create: (payload) => ipcRenderer.invoke('env:create', payload),
    update: (projectPath, envId, patch) => ipcRenderer.invoke('env:update', { projectPath, envId, patch }),
    delete: (projectPath, envId) => ipcRenderer.invoke('env:delete', { projectPath, envId }),
    activate: (projectPath, envId) => ipcRenderer.invoke('env:activate', { projectPath, envId }),
    getActiveVars: (projectPath) => ipcRenderer.invoke('env:get-active-vars', { projectPath }),
    readDotFile: (filePath) => ipcRenderer.invoke('env:read-dot-file', { filePath }),
    writeDotFile: (filePath, content) => ipcRenderer.invoke('env:write-dot-file', { filePath, content }),
    onActiveChanged: (callback) => on('env:active-changed', callback)
  },
  runtime: {
    detect: (payload = {}) => ipcRenderer.invoke('runtime:detect', payload),
    resolve: (payload = {}) => ipcRenderer.invoke('runtime:resolve', payload)
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    states: () => ipcRenderer.invoke('mcp:states'),
    add: (config) => ipcRenderer.invoke('mcp:add', config),
    update: (id, patch) => ipcRenderer.invoke('mcp:update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('mcp:delete', { id }),
    connect: (id) => ipcRenderer.invoke('mcp:connect', { id }),
    disconnect: (id) => ipcRenderer.invoke('mcp:disconnect', { id }),
    callTool: (serverId, toolName, args = {}) => ipcRenderer.invoke('mcp:call-tool', { serverId, toolName, args }),
    onStatusChanged: (callback) => on('mcp:status-changed', callback)
  },
  browser: {
    start: () => ipcRenderer.invoke('browser:start'),
    stop: () => ipcRenderer.invoke('browser:stop'),
    state: () => ipcRenderer.invoke('browser:state'),
    navigate: (url) => ipcRenderer.invoke('browser:navigate', { url }),
    back: () => ipcRenderer.invoke('browser:back'),
    forward: () => ipcRenderer.invoke('browser:forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    click: (selector) => ipcRenderer.invoke('browser:click', { selector }),
    type: (selector, text) => ipcRenderer.invoke('browser:type', { selector, text }),
    executeWebAi: (payload) => ipcRenderer.invoke('browser:execute-web-ai', payload),
    getDOM: () => ipcRenderer.invoke('browser:get-dom'),
    getScreenshot: () => ipcRenderer.invoke('browser:get-screenshot'),
    onNavChanged: (callback) => on('browser:nav-changed', callback),
    onFrameUpdate: (callback) => on('browser:frame-update', callback)
  },
  computer: {
    state: () => ipcRenderer.invoke('computer:state'),
    setEnabled: (enabled) => ipcRenderer.invoke('computer:set-enabled', { enabled }),
    setUnattended: (allowUnattended) => ipcRenderer.invoke('computer:set-unattended', { allowUnattended }),
    getScreen: () => ipcRenderer.invoke('computer:get-screen'),
    mouseAction: (payload) => ipcRenderer.invoke('computer:mouse-action', payload),
    keyboardType: (text) => ipcRenderer.invoke('computer:keyboard-type', { text }),
    keyboardKeys: (keys) => ipcRenderer.invoke('computer:keyboard-keys', { keys }),
    lock: (reason = 'manual') => ipcRenderer.invoke('computer:lock', { reason }),
    unlock: () => ipcRenderer.invoke('computer:unlock'),
    onStateChanged: (callback) => on('computer:state-changed', callback),
    onActionLogged: (callback) => on('computer:action-logged', callback),
    onEmergencyStop: (callback) => on('computer:emergency-stop', callback)
  },
  automation: {
    list: () => ipcRenderer.invoke('automation:list'),
    save: (payload) => ipcRenderer.invoke('automation:save', payload),
    delete: (id) => ipcRenderer.invoke('automation:delete', id),
    run: (id) => ipcRenderer.invoke('automation:run', id),
    markRun: (id) => ipcRenderer.invoke('automation:mark-run', id),
    onFileSaved: (callback) => on('file:saved', callback),
    onTrigger: (callback) => on('automation:trigger', callback)
  },
  hooks: {
    serverState: () => ipcRenderer.invoke('hook:server-state'),
    list: () => ipcRenderer.invoke('hook:list'),
    save: (payload) => ipcRenderer.invoke('hook:save', payload),
    delete: (id) => ipcRenderer.invoke('hook:delete', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('hook:set-enabled', { id, enabled }),
    installGitHook: (projectPath, hookType) => ipcRenderer.invoke('hook:install-git-hook', { projectPath, hookType }),
    removeGitHook: (projectPath, hookType) => ipcRenderer.invoke('hook:remove-git-hook', { projectPath, hookType }),
    listInstalled: (projectPath) => ipcRenderer.invoke('hook:list-installed', projectPath),
    registerProject: (projectPath) => ipcRenderer.invoke('hook:register-project', projectPath),
    triggerAppEvent: (payload) => ipcRenderer.invoke('hook:trigger-app-event', payload),
    resolveTrigger: (payload) => ipcRenderer.invoke('hook:resolve-trigger', payload),
    onExternalTrigger: (callback) => on('hook:external-trigger', callback)
  },
  sandbox: {
    state: () => ipcRenderer.invoke('sandbox:state'),
    featureStatus: () => ipcRenderer.invoke('sandbox:feature-status'),
    enableFeature: () => ipcRenderer.invoke('sandbox:enable-feature'),
    setIsolation: (isolation) => ipcRenderer.invoke('sandbox:set-isolation', { isolation }),
    start: (projectPath) => ipcRenderer.invoke('sandbox:start', { projectPath }),
    stop: () => ipcRenderer.invoke('sandbox:stop')
  },
  vector: {
    syncStart: (payload) => ipcRenderer.invoke('vector:sync-start', payload),
    search: (payload) => ipcRenderer.invoke('vector:search', payload),
    stats: () => ipcRenderer.invoke('vector:stats'),
    onSyncProgress: (callback) => on('vector:sync-progress', callback)
  },
  speculative: {
    trigger: (payload) => ipcRenderer.invoke('speculative:trigger', payload),
    abort: (payload = {}) => ipcRenderer.invoke('speculative:abort', payload),
    onCacheReady: (callback) => on('speculative:cache-ready', callback)
  },
  incident: {
    list: () => ipcRenderer.invoke('incident:list'),
    getSettings: () => ipcRenderer.invoke('incident:settings:get'),
    saveSettings: (payload) => ipcRenderer.invoke('incident:settings:save', payload),
    fetchManual: (payload = {}) => ipcRenderer.invoke('incident:fetch-manual', payload),
    startHealing: (incidentId) => ipcRenderer.invoke('incident:start-healing', { incidentId }),
    onNewAlert: (callback) => on('incident:new-alert', callback),
    onHealingStatus: (callback) => on('incident:healing-status', callback)
  },
  github: {
    saveToken: (token) => ipcRenderer.invoke('github:save-token', { token }),
    tokenStatus: () => ipcRenderer.invoke('github:token-status')
  },
  autoFix: {
    takeOver: (incidentId) => ipcRenderer.invoke('auto-fix:take-over', { incidentId })
  },
  cluster: {
    list: () => ipcRenderer.invoke('cluster:list'),
    scanStart: () => ipcRenderer.invoke('cluster:scan-start'),
    requestPair: (payload) => ipcRenderer.invoke('cluster:request-pair', payload),
    verifyPin: (payload) => ipcRenderer.invoke('cluster:verify-pin', payload),
    disconnect: (nodeId) => ipcRenderer.invoke('cluster:disconnect', { nodeId }),
    setRouting: (payload) => ipcRenderer.invoke('cluster:set-routing', payload),
    ping: (nodeId) => ipcRenderer.invoke('cluster:ping', { nodeId }),
    onNodeFound: (callback) => on('cluster:node-found', callback),
    onPairRequest: (callback) => on('cluster:pair-request', callback),
    onStatusUpdate: (callback) => on('cluster:status-update', callback),
    onStateUpdate: (callback) => on('cluster:state-update', callback)
  },
  learning: {
    getRules: (payload = {}) => ipcRenderer.invoke('learning:get-rules', payload),
    updateRule: (rule) => ipcRenderer.invoke('learning:update-rule', rule),
    deleteRule: (id) => ipcRenderer.invoke('learning:delete-rule', id),
    getStats: () => ipcRenderer.invoke('learning:get-stats'),
    triggerAnalysis: () => ipcRenderer.invoke('learning:trigger-analysis'),
    getAnalysisState: () => ipcRenderer.invoke('learning:get-analysis-state'),
    matchRules: (payload) => ipcRenderer.invoke('learning:match-rules', payload),
    onRulesUpdated: (callback) => on('learning:rules-updated', callback),
    onAnalysisComplete: (callback) => on('learning:analysis-complete', callback)
  },
  collab: {
    connect: (payload = {}) => ipcRenderer.invoke('collab:connect', payload),
    disconnect: () => ipcRenderer.invoke('collab:disconnect'),
    list: () => ipcRenderer.invoke('collab:list'),
    updatePresence: (payload = {}) => ipcRenderer.invoke('collab:update-presence', payload),
    syncRules: () => ipcRenderer.invoke('collab:sync-rules'),
    muteOrigin: (payload = {}) => ipcRenderer.invoke('collab:mute-origin', payload),
    vaultStatus: (payload = {}) => ipcRenderer.invoke('vault:status', payload),
    setVaultSecret: (payload = {}) => ipcRenderer.invoke('vault:set-secret', payload),
    exportVault: (payload = {}) => ipcRenderer.invoke('vault:export', payload),
    readVault: (payload = {}) => ipcRenderer.invoke('vault:read', payload),
    onPeersUpdated: (callback) => on('collab:peers-updated', callback),
    onRuleSynced: (callback) => on('collab:rule-synced', callback),
    onPresenceUpdate: (callback) => on('collab:presence-update', callback)
  },
  cicd: {
    getState: () => ipcRenderer.invoke('cicd:get-state'),
    generateIaC: (payload) => ipcRenderer.invoke('cicd:generate-iac', payload),
    deployStart: (payload) => ipcRenderer.invoke('cicd:deploy-start', payload),
    rollbackManual: (payload) => ipcRenderer.invoke('cicd:rollback-manual', payload),
    saveProviderToken: (payload) => ipcRenderer.invoke('cicd:save-provider-token', payload),
    onStatusUpdate: (callback) => on('cicd:status-update', callback),
    onLogsStream: (callback) => on('cicd:logs-stream', callback)
  },
  qa: {
    runScenario: (payload) => ipcRenderer.invoke('qa:run-scenario', payload),
    state: () => ipcRenderer.invoke('qa:get-state'),
    stop: () => ipcRenderer.invoke('qa:stop'),
    onStreamLogs: (callback) => on('qa:stream-logs', callback),
    onScreenshotCapture: (callback) => on('qa:screenshot-capture', callback),
    onResultFinal: (callback) => on('qa:result-final', callback)
  },
  voice: {
    connect: (payload) => ipcRenderer.invoke('voice:connect', payload),
    disconnect: () => ipcRenderer.invoke('voice:disconnect'),
    getState: () => ipcRenderer.invoke('voice:get-state'),
    sendPcmChunk: (payload) => ipcRenderer.send('voice:pcm-chunk-out', payload),
    sendContextUpdate: (payload) => ipcRenderer.invoke('voice:context-update', payload),
    onPcmChunk: (callback) => on('voice:pcm-chunk-in', callback),
    onStateChange: (callback) => on('voice:state-change', callback),
    onPlaybackClear: (callback) => on('voice:playback-clear', callback),
    onTranscriptDelta: (callback) => on('voice:transcript-delta', callback),
    onToolCall: (callback) => on('voice:tool-call', callback)
  },
  window: {
    togglePopout: () => ipcRenderer.invoke('window:toggle-popout'),
    getPopoutState: () => ipcRenderer.invoke('window:get-popout-state'),
    setPopoutHotkey: (hotkey) => ipcRenderer.invoke('window:set-popout-hotkey', hotkey),
    onPopoutState: (callback) => on('window:popout-state', callback)
  },
  storeSync: {
    broadcast: (payload) => ipcRenderer.invoke('store:broadcast', payload),
    onSync: (callback) => on('store:sync', callback)
  },
  search: {
    query: (payload) => ipcRenderer.invoke('search:query', payload)
  },
  notify: {
    show: (payload) => ipcRenderer.invoke('notify:show', payload),
    onShow: (callback) => on('notify:show', callback),
    onClick: (callback) => on('notify:click', callback)
  },
  export: {
    chatPdf: (payload) => ipcRenderer.invoke('export:chat-pdf', payload)
  },
  git: {
    status: (projectPath) => ipcRenderer.invoke('git:status', { projectPath }),
    branches: (projectPath) => ipcRenderer.invoke('git:branches', { projectPath }),
    checkout: (projectPath, branchName) => ipcRenderer.invoke('git:checkout', { projectPath, branchName }),
    createBranch: (projectPath, branchName, fromRef) =>
      ipcRenderer.invoke('git:create-branch', { projectPath, branchName, fromRef }),
    stage: (projectPath, filePath) => ipcRenderer.invoke('git:stage', { projectPath, filePath }),
    unstage: (projectPath, filePath) => ipcRenderer.invoke('git:unstage', { projectPath, filePath }),
    commit: (projectPath, message) => ipcRenderer.invoke('git:commit', { projectPath, message }),
    diff: (projectPath, filePath, staged = false) => ipcRenderer.invoke('git:diff', { projectPath, filePath, staged }),
    log: (projectPath, limit = 20) => ipcRenderer.invoke('git:log', { projectPath, limit }),
    worktreeList: (projectPath) => ipcRenderer.invoke('git:worktree-list', { projectPath }),
    worktreeAdd: (projectPath, payload) => ipcRenderer.invoke('git:worktree-add', { projectPath, ...payload }),
    worktreeRemove: (projectPath, worktreePath, options = {}) =>
      ipcRenderer.invoke('git:worktree-remove', { projectPath, worktreePath, ...options }),
    worktreePrune: (projectPath) => ipcRenderer.invoke('git:worktree-prune', { projectPath }),
    branchRename: (projectPath, oldName, newName) => ipcRenderer.invoke('git:branch-rename', { projectPath, oldName, newName }),
    branchDelete: (projectPath, payload) => ipcRenderer.invoke('git:branch-delete', { projectPath, ...payload }),
    setUpstream: (projectPath, branchName, remoteRef) => ipcRenderer.invoke('git:set-upstream', { projectPath, branchName, remoteRef }),
    merge: (projectPath, sourceBranch) => ipcRenderer.invoke('git:merge', { projectPath, sourceBranch }),
    fetch: (projectPath, payload = {}) => ipcRenderer.invoke('git:fetch', { projectPath, ...payload }),
    pull: (projectPath, payload = {}) => ipcRenderer.invoke('git:pull', { projectPath, ...payload }),
    push: (projectPath, payload = {}) => ipcRenderer.invoke('git:push', { projectPath, ...payload }),
    stash: (projectPath, payload = {}) => ipcRenderer.invoke('git:stash', { projectPath, ...payload }),
    onStatusChanged: (callback) => on('git:status-changed', callback)
  },
  db: {
    listSessions: () => ipcRenderer.invoke('db:chat:list-sessions'),
    createSession: (payload) => ipcRenderer.invoke('db:chat:create-session', payload),
    updateSession: (payload) => ipcRenderer.invoke('db:chat:update-session', payload),
    deleteSession: (id) => ipcRenderer.invoke('db:chat:delete-session', id),
    listMessages: (sessionId) => ipcRenderer.invoke('db:chat:list-messages', sessionId),
    addMessage: (payload) => ipcRenderer.invoke('db:chat:add-message', payload),
    upsertProject: (payload) => ipcRenderer.invoke('db:projects:upsert', payload),
    listProjects: () => ipcRenderer.invoke('db:projects:list'),
    addSnippet: (payload) => ipcRenderer.invoke('db:snippet:add', payload),
    listSnippets: () => ipcRenderer.invoke('db:snippet:list')
  },
  store: {
    get: (key, fallback) => ipcRenderer.invoke('store:get', key, fallback),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
    resetAll: () => ipcRenderer.invoke('db:reset-all')
  },
  app: {
    getPath: (name) => ipcRenderer.invoke('app:get-path', name),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    runDiagnostics: () => ipcRenderer.invoke('app:run-diagnostics'),
    factoryReset: () => ipcRenderer.invoke('app:factory-reset'),
    onMenu: (channel, callback) => on(channel, callback),
    onDeepLink: (callback) => on('app:deep-link', callback)
  },
  hybridCloud: {
    getState: () => ipcRenderer.invoke('hybrid-cloud:get-state'),
    updateConfig: (config) => ipcRenderer.invoke('hybrid-cloud:update-config', config),
    triggerOffload: () => ipcRenderer.invoke('hybrid-cloud:trigger-offload'),
    stopOffload: () => ipcRenderer.invoke('hybrid-cloud:stop-offload'),
    getMetrics: () => ipcRenderer.invoke('hybrid-cloud:get-metrics'),
    onStateChanged: (callback) => on('hybrid-cloud:state-changed', callback),
    onMetrics: (callback) => on('hybrid-cloud:metrics', callback)
  },
  n8n: {
    getConfig: () => ipcRenderer.invoke('n8n:get-config'),
    saveConfig: (config) => ipcRenderer.invoke('n8n:save-config', config),
    triggerWebhook: (payload) => ipcRenderer.invoke('n8n:trigger-webhook', payload),
    onStatusChanged: (callback) => on('n8n:webhook:status', callback)
  },
  fastSearch: {
    getKey: () => ipcRenderer.invoke('serpapi:get-key'),
    saveKey: (key) => ipcRenderer.invoke('serpapi:save-key', key),
    execute: (query) => ipcRenderer.invoke('fast-search:execute', query),
    onStatusChanged: (callback) => on('fast-search:status', callback)
  },
  shadowAI: {
    getProfile: () => ipcRenderer.invoke('shadow-ai:get-profile'),
    saveProfile: (profile) => ipcRenderer.invoke('shadow-ai:save-profile', profile),
    train: (repos, token) => ipcRenderer.invoke('shadow-ai:train', { repos, token }),
    onStatusChanged: (callback) => on('shadow-ai:status', callback)
  },
  chaos: {
    triggerFileSave: (payload) => ipcRenderer.invoke('chaos:trigger-file-save', payload),
    getLogs: () => ipcRenderer.invoke('chaos:get-logs'),
    onStatusChanged: (callback) => on('chaos:status', callback),
    onLog: (callback) => on('chaos:log', callback)
  },
  prompt: {
    optimize: (prompt, options) => ipcRenderer.invoke('prompt:optimize', { prompt, options })
  }
};

contextBridge.exposeInMainWorld('nexcode', api);


