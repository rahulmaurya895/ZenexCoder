import { create } from 'zustand';

const initialState = {
  hooks: [],
  installed: {},
  server: { running: false, host: '127.0.0.1', port: 0, url: '' },
  loading: false,
  error: ''
};

export const useHookStore = create((set, get) => ({
  ...initialState,
  async loadHooks() {
    set({ loading: true, error: '' });
    try {
      const [hooks, server] = await Promise.all([
        window.zenexcoder.hooks.list(),
        window.zenexcoder.hooks.serverState()
      ]);
      set({ hooks, server, loading: false });
      return hooks;
    } catch (error) {
      set({ loading: false, error: error.message });
      return [];
    }
  },
  async saveHook(hook) {
    const saved = await window.zenexcoder.hooks.save(hook);
    set((state) => ({ hooks: [saved, ...state.hooks.filter((item) => item.id !== saved.id)] }));
    return saved;
  },
  async deleteHook(id) {
    await window.zenexcoder.hooks.delete(id);
    set((state) => ({ hooks: state.hooks.filter((item) => item.id !== id) }));
  },
  async setHookEnabled(id, enabled) {
    const saved = await window.zenexcoder.hooks.setEnabled(id, enabled);
    set((state) => ({
      hooks: state.hooks.map((item) => (item.id === id ? { ...item, ...saved } : item))
    }));
    return saved;
  },
  async refreshInstalled(projectPath) {
    if (!projectPath) {
      set({ installed: {} });
      return {};
    }
    const installed = await window.zenexcoder.hooks.listInstalled(projectPath);
    set({ installed });
    return installed;
  },
  async installGitHook(projectPath, hookType) {
    const result = await window.zenexcoder.hooks.installGitHook(projectPath, hookType);
    await get().refreshInstalled(projectPath);
    return result;
  },
  async removeGitHook(projectPath, hookType) {
    const result = await window.zenexcoder.hooks.removeGitHook(projectPath, hookType);
    await get().refreshInstalled(projectPath);
    return result;
  },
  async registerProject(projectPath) {
    const result = await window.zenexcoder.hooks.registerProject(projectPath);
    await get().refreshInstalled(projectPath);
    return result;
  },
  setServer(server) {
    set({ server });
  },
  setError(error) {
    set({ error: error ? String(error) : '' });
  }
}));
