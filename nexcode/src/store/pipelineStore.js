import { create } from 'zustand';
import { useProjectStore } from '@/store/projectStore';

const initialState = {
  status: 'idle',
  phase: 'ready',
  provider: 'vercel',
  target: 'staging',
  dryRun: true,
  approved: false,
  healthUrl: '',
  testCommand: '',
  buildCommand: '',
  deployment: null,
  logs: [],
  iac: null,
  loading: false,
  error: ''
};

export const usePipelineStore = create((set, get) => ({
  ...initialState,

  setField(key, value) {
    set({ [key]: value });
  },

  projectPath() {
    return useProjectStore.getState().projectPath || '';
  },

  async load() {
    const state = await window.nexcode.cicd.getState().catch(() => null);
    if (state) {
      set({
        status: state.status || 'idle',
        phase: state.phase || 'ready',
        deployment: state.deployment || null,
        logs: state.logs || []
      });
    }
  },

  async generateIaC() {
    set({ loading: true, error: '' });
    try {
      const result = await window.nexcode.cicd.generateIaC({
        projectPath: get().projectPath(),
        provider: get().provider,
        healthPath: '/health'
      });
      set({ iac: result, loading: false });
      return result;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  async startDeploy() {
    set({ loading: true, error: '' });
    try {
      const result = await window.nexcode.cicd.deployStart({
        projectPath: get().projectPath(),
        provider: get().provider,
        target: get().target,
        dryRun: get().dryRun,
        approved: get().approved,
        healthUrl: get().healthUrl,
        testCommand: get().testCommand,
        buildCommand: get().buildCommand
      });
      set({ deployment: result, loading: false });
      return result;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  async rollback() {
    set({ loading: true, error: '' });
    try {
      const result = await window.nexcode.cicd.rollbackManual({
        deploymentId: get().deployment?.id,
        projectPath: get().projectPath(),
        provider: get().provider,
        approved: true
      });
      set({ deployment: result.deployment || get().deployment, loading: false });
      return result;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  applyStatus(payload = {}) {
    set({
      status: payload.status || get().status,
      phase: payload.phase || get().phase,
      deployment: payload.deployment || get().deployment
    });
  },

  applyLog(payload = {}) {
    set((state) => ({
      logs: [{ id: `${Date.now()}-${Math.random()}`, ...payload }, ...state.logs].slice(0, 400)
    }));
  }
}));
