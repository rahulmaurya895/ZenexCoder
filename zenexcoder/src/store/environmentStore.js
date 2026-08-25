import { create } from 'zustand';
import { useProjectStore } from './projectStore';

export const DEFAULT_RUNTIME_CONFIG = {
  node: { mode: 'system' },
  python: { mode: 'system' },
  go: { mode: 'system' },
  java: { mode: 'system' },
  ruby: { mode: 'system' },
  rust: { mode: 'system' },
  custom: []
};

const empty = {
  environments: {},
  activeEnvId: {},
  loading: false,
  error: null
};

function projectPath() {
  return useProjectStore.getState().projectPath;
}

function envsFor(state, path) {
  return state.environments[path] || [];
}

function activeIdFor(state, path) {
  return state.activeEnvId[path] || envsFor(state, path).find((env) => env.isActive)?.id || null;
}

export const useEnvironmentStore = create((set, get) => ({
  ...empty,
  getEnvsForProject(path = projectPath()) {
    return path ? envsFor(get(), path) : [];
  },
  getActiveEnv(path = projectPath()) {
    if (!path) return null;
    const id = activeIdFor(get(), path);
    return envsFor(get(), path).find((env) => env.id === id) || null;
  },
  getActiveVars(path = projectPath()) {
    const active = get().getActiveEnv(path);
    if (!active) return {};
    return Object.fromEntries(
      (active.vars || [])
        .filter((item) => item.enabled !== false && !item.masked && item.key)
        .map((item) => [item.key, item.value])
    );
  },
  async refresh(path = projectPath()) {
    if (!path) {
      set({ loading: false, error: null });
      return [];
    }
    set({ loading: true, error: null });
    try {
      const list = await window.zezenexcoderr.env.list(path);
      set((state) => ({
        environments: { ...state.environments, [path]: list },
        activeEnvId: { ...state.activeEnvId, [path]: list.find((env) => env.isActive)?.id || null },
        loading: false
      }));
      return list;
    } catch (error) {
      set({ loading: false, error: error.message });
      return [];
    }
  },
  async createEnv(path, payload) {
    const env = await window.zezenexcoderr.env.create({ projectPath: path, ...payload });
    await get().refresh(path);
    return env;
  },
  async updateEnv(path, envId, patch) {
    const env = await window.zezenexcoderr.env.update(path, envId, patch);
    await get().refresh(path);
    return env;
  },
  async deleteEnv(path, envId) {
    const result = await window.zezenexcoderr.env.delete(path, envId);
    if (result?.error) return result;
    await get().refresh(path);
    return result;
  },
  async activateEnv(path, envId) {
    const env = await window.zezenexcoderr.env.activate(path, envId);
    await get().refresh(path);
    return env;
  },
  async addVar(path, envId, item) {
    const env = get().getEnvsForProject(path).find((entry) => entry.id === envId);
    if (!env) return null;
    const nextVar = {
      id: `var-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      key: item.key,
      value: item.value || '',
      masked: Boolean(item.masked),
      source: item.source || 'manual',
      enabled: item.enabled !== false
    };
    return get().updateEnv(path, envId, { vars: [...(env.vars || []), nextVar] });
  },
  async updateVar(path, envId, varId, patch) {
    const env = get().getEnvsForProject(path).find((entry) => entry.id === envId);
    if (!env) return null;
    return get().updateEnv(path, envId, {
      vars: (env.vars || []).map((item) => (item.id === varId ? { ...item, ...patch } : item))
    });
  },
  async deleteVar(path, envId, varId) {
    const env = get().getEnvsForProject(path).find((entry) => entry.id === envId);
    if (!env) return null;
    return get().updateEnv(path, envId, { vars: (env.vars || []).filter((item) => item.id !== varId) });
  },
  async toggleVar(path, envId, varId) {
    const env = get().getEnvsForProject(path).find((entry) => entry.id === envId);
    const item = env?.vars?.find((entry) => entry.id === varId);
    return item ? get().updateVar(path, envId, varId, { enabled: item.enabled === false }) : null;
  },
  async importVars(path, envId, parsed) {
    const env = get().getEnvsForProject(path).find((entry) => entry.id === envId);
    if (!env) return null;
    const map = new Map((env.vars || []).map((item) => [item.key, item]));
    parsed.forEach((item) => {
      map.set(item.key, { ...(map.get(item.key) || {}), ...item, id: map.get(item.key)?.id || item.id });
    });
    return get().updateEnv(path, envId, { vars: [...map.values()] });
  },
  applyActiveChanged(payload) {
    if (!payload?.projectPath) return;
    set((state) => ({
      activeEnvId: { ...state.activeEnvId, [payload.projectPath]: payload.envId },
      environments: {
        ...state.environments,
        [payload.projectPath]: envsFor(state, payload.projectPath).map((env) => ({ ...env, isActive: env.id === payload.envId }))
      }
    }));
  }
}));
