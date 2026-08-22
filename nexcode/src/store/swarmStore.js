import { create } from 'zustand';

const initialState = {
  active: false,
  taskId: null,
  activePersonaId: null,
  provider: '',
  modelId: '',
  swarmInternalHistory: [],
  consensus: null,
  error: null,
  collapsed: false,
  startedAt: null,
  completedAt: null
};

export const useSwarmStore = create((set, get) => ({
  ...initialState,
  async startTask(payload = {}) {
    set({
      active: true,
      taskId: payload.taskId || null,
      activePersonaId: 'architect',
      provider: payload.provider || '',
      modelId: payload.modelId || '',
      swarmInternalHistory: [],
      consensus: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null
    });
    const result = await window.nexcode.swarm.startTask(payload);
    set((state) => ({
      taskId: result.taskId || state.taskId,
      active: true
    }));
    return result;
  },
  async halt(taskId = get().taskId) {
    if (taskId) {
      await window.nexcode.swarm.halt(taskId);
    }
    set({
      active: false,
      activePersonaId: null,
      completedAt: Date.now()
    });
  },
  applyTurn(payload = {}) {
    set({
      active: payload.activePersonaId !== 'user_approval',
      taskId: payload.taskId,
      activePersonaId: payload.activePersonaId,
      provider: payload.provider || get().provider,
      modelId: payload.modelId || get().modelId
    });
  },
  addInternalMessage(payload = {}) {
    set((state) => ({
      taskId: payload.taskId || state.taskId,
      swarmInternalHistory: [...state.swarmInternalHistory, payload].slice(-60)
    }));
  },
  applyConsensus(payload = {}) {
    set({
      active: false,
      taskId: payload.taskId || get().taskId,
      activePersonaId: 'user_approval',
      consensus: payload,
      error: null,
      completedAt: Date.now()
    });
  },
  applyHalt(payload = {}) {
    set({
      active: false,
      taskId: payload.taskId || get().taskId,
      activePersonaId: null,
      error: payload.message || null,
      completedAt: Date.now()
    });
  },
  applyError(payload = {}) {
    set({
      active: false,
      taskId: payload.taskId || get().taskId,
      activePersonaId: null,
      error: payload.message || 'Swarm failed.',
      completedAt: Date.now()
    });
  },
  toggleCollapsed() {
    set((state) => ({ collapsed: !state.collapsed }));
  },
  clear() {
    set(initialState);
  }
}));
