import { create } from 'zustand';
import { useProjectStore } from '@/store/projectStore';
import { useLearningStore } from '@/store/learningStore';

export const useCollaborationStore = create((set, get) => ({
  connected: false,
  peers: [],
  status: { connected: false, e2ee: false, lastSyncAt: 0, error: '' },
  vault: { ok: false, safeStorage: false, hasSecret: false, exists: false, vaultPath: '' },
  incomingRules: [],
  loading: false,
  error: '',

  projectPath() {
    return useProjectStore.getState().projectPath || '';
  },

  async load() {
    const [collab, vault] = await Promise.all([
      window.zenexcoder.collab.list().catch(() => ({ peers: [], status: {} })),
      window.zenexcoder.collab.vaultStatus({ projectPath: get().projectPath() }).catch((error) => ({ ok: false, error: error.message }))
    ]);
    set({
      peers: collab.peers || [],
      status: collab.status || {},
      connected: Boolean(collab.status?.connected),
      vault
    });
  },

  async connect() {
    set({ loading: true, error: '' });
    try {
      const result = await window.zenexcoder.collab.connect({ projectPath: get().projectPath() });
      set({
        connected: true,
        peers: result.peers || [],
        status: result.status || {},
        vault: result.vault || get().vault,
        loading: false
      });
      return result;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  async disconnect() {
    await window.zenexcoder.collab.disconnect();
    set((state) => ({ connected: false, status: { ...state.status, connected: false } }));
  },

  async setVaultSecret(secret) {
    const vault = await window.zenexcoder.collab.setVaultSecret({ projectPath: get().projectPath(), secret });
    set({ vault });
    return vault;
  },

  async syncRules() {
    const result = await window.zenexcoder.collab.syncRules();
    set({ status: result.status || get().status });
    return result;
  },

  async muteOrigin(originNodeId, muted = true) {
    await window.zenexcoder.collab.muteOrigin({ originNodeId, muted });
    set((state) => ({
      peers: state.peers.map((peer) => (peer.nodeId === originNodeId ? { ...peer, muted } : peer))
    }));
    useLearningStore.getState().load().catch(() => {});
  },

  updatePresence(file, status = 'Coding') {
    return window.zenexcoder.collab.updatePresence({ file, status }).catch(() => {});
  },

  applyPeers(payload = {}) {
    set({
      peers: payload.peers || [],
      status: payload.status || get().status,
      connected: Boolean(payload.status?.connected ?? get().connected)
    });
  },

  applyRuleSynced(payload = {}) {
    set((state) => ({
      incomingRules: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...payload
        },
        ...state.incomingRules
      ].slice(0, 30)
    }));
    useLearningStore.getState().applyRuleUpdate({ rule: payload.rule, reason: 'shared_sync' });
  },

  applyPresence(payload = {}) {
    set((state) => ({
      peers: [
        payload,
        ...state.peers.filter((peer) => peer.nodeId !== payload.nodeId && peer.userId !== payload.userId)
      ]
    }));
  }
}));
