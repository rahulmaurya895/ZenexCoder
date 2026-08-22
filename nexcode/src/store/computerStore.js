import { create } from 'zustand';

const initialState = {
  enabled: false,
  locked: true,
  allowUnattended: false,
  activeSession: false,
  logs: [],
  lastScreen: null,
  error: ''
};

export const useComputerStore = create((set, get) => ({
  ...initialState,
  applyState(payload = {}) {
    set((state) => ({
      ...state,
      enabled: Boolean(payload.enabled ?? state.enabled),
      locked: Boolean(payload.locked ?? state.locked),
      allowUnattended: Boolean(payload.allowUnattended ?? state.allowUnattended),
      activeSession: Boolean(payload.activeSession ?? state.activeSession),
      logs: payload.logs || state.logs
    }));
  },
  addLog(entry) {
    set((state) => ({ logs: [...state.logs.filter((item) => item.id !== entry.id), entry].slice(-200) }));
  },
  async refreshState() {
    const state = await window.nexcode.computer.state();
    get().applyState(state);
    return state;
  },
  async setEnabled(enabled) {
    const state = await window.nexcode.computer.setEnabled(enabled);
    get().applyState(state);
    return state;
  },
  async setUnattended(allowUnattended) {
    const state = await window.nexcode.computer.setUnattended(allowUnattended);
    get().applyState(state);
    return state;
  },
  async unlock() {
    const state = await window.nexcode.computer.unlock();
    get().applyState(state);
    return state;
  },
  async lock(reason = 'manual') {
    const state = await window.nexcode.computer.lock(reason);
    get().applyState(state);
    return state;
  },
  async getScreen() {
    set({ error: '' });
    try {
      const screen = await window.nexcode.computer.getScreen();
      set({ lastScreen: screen });
      return screen;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  }
}));
