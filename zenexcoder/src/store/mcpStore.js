import { create } from 'zustand';

const emptyState = {
  servers: [],
  connectionStates: {},
  serverErrors: {},
  serverTools: {},
  serverResources: {},
  serverResourceTemplates: {},
  loading: false,
  error: null
};

function stateOf(status = {}) {
  return status.status || 'disconnected';
}

export const useMCPStore = create((set, get) => ({
  ...emptyState,
  async loadServers() {
    set({ loading: true, error: null });
    try {
      const [servers, states] = await Promise.all([
        window.zezenexcoderr.mcp.list(),
        window.zezenexcoderr.mcp.states().catch(() => ({}))
      ]);
      set({
        servers,
        connectionStates: Object.fromEntries(Object.entries(states || {}).map(([id, item]) => [id, stateOf(item)])),
        serverErrors: Object.fromEntries(Object.entries(states || {}).map(([id, item]) => [id, item.error || ''])),
        serverTools: Object.fromEntries(Object.entries(states || {}).map(([id, item]) => [id, item.tools || []])),
        serverResources: Object.fromEntries(Object.entries(states || {}).map(([id, item]) => [id, item.resources || []])),
        serverResourceTemplates: Object.fromEntries(Object.entries(states || {}).map(([id, item]) => [id, item.resourceTemplates || []])),
        loading: false
      });
      return servers;
    } catch (error) {
      set({ loading: false, error: error.message });
      return [];
    }
  },
  async addServer(config) {
    const server = await window.zezenexcoderr.mcp.add(config);
    await get().loadServers();
    return server;
  },
  async updateServer(id, patch) {
    const server = await window.zezenexcoderr.mcp.update(id, patch);
    await get().loadServers();
    return server;
  },
  async deleteServer(id) {
    const result = await window.zezenexcoderr.mcp.delete(id);
    set((state) => {
      const { [id]: _removedStatus, ...connectionStates } = state.connectionStates;
      const { [id]: _removedError, ...serverErrors } = state.serverErrors;
      const { [id]: _removedTools, ...serverTools } = state.serverTools;
      const { [id]: _removedResources, ...serverResources } = state.serverResources;
      const { [id]: _removedTemplates, ...serverResourceTemplates } = state.serverResourceTemplates;
      return {
        servers: state.servers.filter((server) => server.id !== id),
        connectionStates,
        serverErrors,
        serverTools,
        serverResources,
        serverResourceTemplates
      };
    });
    return result;
  },
  async connectServer(id) {
    get().applyStatus({ id, status: 'connecting', error: '', tools: [], resources: [], resourceTemplates: [] });
    const status = await window.zezenexcoderr.mcp.connect(id);
    get().applyStatus(status);
    return status;
  },
  async disconnectServer(id) {
    const status = await window.zezenexcoderr.mcp.disconnect(id);
    get().applyStatus(status);
    return status;
  },
  async callTool(serverId, toolName, args = {}) {
    return window.zezenexcoderr.mcp.callTool(serverId, toolName, args);
  },
  applyStatus(payload = {}) {
    if (!payload.id) return;
    set((state) => ({
      connectionStates: { ...state.connectionStates, [payload.id]: payload.status || 'disconnected' },
      serverErrors: { ...state.serverErrors, [payload.id]: payload.error || '' },
      serverTools: { ...state.serverTools, [payload.id]: payload.tools || [] },
      serverResources: { ...state.serverResources, [payload.id]: payload.resources || [] },
      serverResourceTemplates: { ...state.serverResourceTemplates, [payload.id]: payload.resourceTemplates || [] }
    }));
  }
}));
