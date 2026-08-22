import { create } from 'zustand';

const defaultHybridConfig = {
  enabled: false,
  instanceIp: '',
  sshPort: 22,
  sshUser: 'ubuntu',
  sshKeyPath: '',
  remoteOllamaPort: 11434,
  localTunnelPort: 11435,
  criticalRamThreshold: 85, // Offload when RAM usage exceeds 85%
  isOffloaded: false,
  activeTunnel: false,
  lastOffloadTime: null,
  localMetrics: {
    totalMemMb: 0,
    freeMemMb: 0,
    usedRamPercent: 0,
    cpuPercent: 0
  },
  status: 'idle', // 'idle' | 'monitoring' | 'tunneling' | 'offloaded' | 'fallback' | 'error'
  error: ''
};

export const useHybridCloudStore = create((set, get) => ({
  ...defaultHybridConfig,
  loading: false,

  async loadConfig() {
    set({ loading: true });
    try {
      if (typeof window !== 'undefined' && window.zenexcoder?.store) {
        const saved = await window.zenexcoder.store.get('hybrid_cloud_config', defaultHybridConfig);
        set({ ...defaultHybridConfig, ...saved, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  async updateConfig(patch) {
    const nextState = { ...get(), ...patch };
    set(patch);
    try {
      if (typeof window !== 'undefined' && window.zenexcoder?.store) {
        await window.zenexcoder.store.set('hybrid_cloud_config', {
          enabled: nextState.enabled,
          instanceIp: nextState.instanceIp,
          sshPort: nextState.sshPort,
          sshUser: nextState.sshUser,
          sshKeyPath: nextState.sshKeyPath,
          remoteOllamaPort: nextState.remoteOllamaPort,
          localTunnelPort: nextState.localTunnelPort,
          criticalRamThreshold: nextState.criticalRamThreshold
        });
      }
    } catch (err) {
      console.error('Failed to save hybrid cloud config:', err);
    }
  },

  setMetrics(metrics) {
    set({ localMetrics: metrics });
  },

  setOffloadState(isOffloaded, activeTunnel = false, status = 'offloaded', error = '') {
    set({
      isOffloaded,
      activeTunnel,
      status,
      error,
      lastOffloadTime: isOffloaded ? Date.now() : get().lastOffloadTime
    });
  }
}));
