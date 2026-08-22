import { create } from 'zustand';

const defaultRouting = {
  ollamaOffloadEnabled: false,
  indexingOffloadEnabled: false,
  primaryNodeId: '',
  keepArchitectLocal: true
};

function mergeNode(list, node) {
  if (!node?.nodeId) return list;
  const previous = list.find((item) => item.nodeId === node.nodeId) || {};
  const cpuValue = node.hardware?.cpuLoad;
  const ramValue = node.hardware?.ramLoad;
  const enriched = {
    ...previous,
    ...node,
    cpuHistory: cpuValue === undefined ? previous.cpuHistory || [] : [...(previous.cpuHistory || []), cpuValue].slice(-24),
    ramHistory: ramValue === undefined ? previous.ramHistory || [] : [...(previous.ramHistory || []), ramValue].slice(-24)
  };
  return [enriched, ...list.filter((item) => item.nodeId !== node.nodeId)].sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });
}

export const useClusterStore = create((set, get) => ({
  localNode: null,
  nodes: [],
  routing: defaultRouting,
  scanning: false,
  loading: false,
  error: null,
  pairingNode: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const state = await window.nexcode.cluster.list();
      set({
        localNode: state.localNode || null,
        nodes: state.nodes || [],
        routing: { ...defaultRouting, ...(state.routing || {}) },
        loading: false
      });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  async scanStart() {
    set({ scanning: true, error: null });
    try {
      const result = await window.nexcode.cluster.scanStart();
      if (result.state) get().applyState(result.state);
      set({ scanning: Boolean(result.ok), error: result.ok ? null : result.message || 'Discovery failed.' });
      return result;
    } catch (error) {
      set({ scanning: false, error: error.message });
      throw error;
    }
  },

  async requestPair(node) {
    set({ pairingNode: node, error: null });
    await window.nexcode.cluster.requestPair({ nodeId: node.nodeId, ip: node.ip, port: node.port });
  },

  async verifyPin(pin) {
    const node = get().pairingNode;
    if (!node) return null;
    const result = await window.nexcode.cluster.verifyPin({ nodeId: node.nodeId, ip: node.ip, pin });
    set({ pairingNode: null });
    return result;
  },

  cancelPairing() {
    set({ pairingNode: null });
  },

  async disconnect(nodeId) {
    await window.nexcode.cluster.disconnect(nodeId);
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.nodeId === nodeId ? { ...node, connected: false, status: 'disconnected' } : node
      )
    }));
  },

  async setRouting(patch) {
    const state = await window.nexcode.cluster.setRouting(patch);
    get().applyState(state);
    return state;
  },

  async setUseForAI(nodeId, enabled) {
    await get().setRouting({
      primaryNodeId: enabled ? nodeId : get().routing.primaryNodeId === nodeId ? '' : get().routing.primaryNodeId,
      ollamaOffloadEnabled: enabled
    });
  },

  async setUseForIndexing(nodeId, enabled) {
    await get().setRouting({
      primaryNodeId: enabled ? nodeId : get().routing.primaryNodeId,
      indexingOffloadEnabled: enabled
    });
  },

  applyNode(node) {
    set((state) => ({ nodes: mergeNode(state.nodes, node) }));
  },

  applyStatus(node) {
    if (node.role === 'master' && get().localNode?.nodeId === node.nodeId) {
      set((state) => {
        const cpuValue = node.hardware?.cpuLoad;
        const ramValue = node.hardware?.ramLoad;
        return {
          localNode: {
            ...state.localNode,
            ...node,
            cpuHistory: cpuValue === undefined ? state.localNode?.cpuHistory || [] : [...(state.localNode?.cpuHistory || []), cpuValue].slice(-24),
            ramHistory: ramValue === undefined ? state.localNode?.ramHistory || [] : [...(state.localNode?.ramHistory || []), ramValue].slice(-24)
          }
        };
      });
      return;
    }
    get().applyNode(node);
  },

  applyState(state = {}) {
    set({
      localNode: state.localNode || get().localNode,
      nodes: state.nodes || get().nodes,
      routing: { ...defaultRouting, ...(state.routing || get().routing) }
    });
  }
}));
