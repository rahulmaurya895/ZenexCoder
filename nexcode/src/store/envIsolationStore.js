import { create } from 'zustand';

const defaultState = {
  isolation: 'host',
  running: false,
  projectPath: '',
  bridgeDir: '',
  sandboxProjectPath: 'C:\\ZenexCoderProject',
  lastWsbPath: '',
  lastError: '',
  feature: {
    platform: '',
    productName: '',
    editionId: '',
    featureName: 'Containers-DisposableClientVM',
    state: 'Unknown',
    restartNeeded: false,
    executablePresent: false,
    enabled: false,
    canEnable: false,
    likelyUnsupported: false,
    message: ''
  },
  enableResult: null
};

function normalizeState(payload = {}) {
  return {
    ...defaultState,
    ...payload,
    isolation: payload.isolation === 'windows_sandbox' ? 'windows_sandbox' : 'host',
    running: Boolean(payload.running)
  };
}

export const useEnvIsolationStore = create((set, get) => ({
  ...defaultState,
  loading: false,
  error: '',
  async load() {
    const [state, feature] = await Promise.all([
      window.zenexcoder.sandbox.state(),
      window.zenexcoder.sandbox.featureStatus().catch((error) => ({ ...defaultState.feature, message: error.message }))
    ]);
    set({ ...normalizeState(state), feature, error: '', loading: false });
    return { ...state, feature };
  },
  async refreshFeature() {
    const feature = await window.zenexcoder.sandbox.featureStatus();
    set({ feature, error: '' });
    return feature;
  },
  async enableFeature() {
    set({ loading: true, error: '' });
    try {
      const result = await window.zenexcoder.sandbox.enableFeature();
      set({
        feature: result.status || result.feature || get().feature,
        enableResult: result,
        loading: false,
        error: ''
      });
      return result;
    } catch (error) {
      const feature = await window.zenexcoder.sandbox.featureStatus().catch(() => get().feature);
      set({ feature, loading: false, error: error.message });
      throw error;
    }
  },
  async setIsolation(isolation) {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.sandbox.setIsolation(isolation);
      set({ ...normalizeState(state), loading: false, error: '' });
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  async start(projectPath) {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.sandbox.start(projectPath);
      set({ ...normalizeState(state), loading: false, error: '' });
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  async stop() {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.sandbox.stop();
      set({ ...normalizeState(state), loading: false, error: '' });
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  isSandboxEnabled() {
    return get().isolation === 'windows_sandbox';
  }
}));
