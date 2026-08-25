import { create } from 'zustand';
import { useProjectStore } from '@/store/projectStore';

const defaultSettings = {
  pollingEnabled: false,
  autoHealEnabled: false,
  pollIntervalMinutes: 5,
  projectPath: '',
  baseBranch: '',
  modelProvider: '',
  modelId: '',
  sentry: {
    baseUrl: 'https://sentry.io',
    organizationSlug: '',
    projectSlug: '',
    token: '',
    hasToken: false
  },
  datadog: {
    apiUrl: '',
    apiKey: '',
    appKey: '',
    hasApiKey: false,
    hasAppKey: false
  },
  generic: {
    apiUrl: '',
    token: '',
    tokenHeader: 'Authorization',
    hasToken: false
  }
};

function mergeIncident(list, incident) {
  if (!incident?.id) return list;
  const next = [incident, ...list.filter((item) => item.id !== incident.id)];
  return next.sort((a, b) => (b.updatedAt || b.lastSeen || 0) - (a.updatedAt || a.lastSeen || 0));
}

export const useIncidentStore = create((set, get) => ({
  incidents: [],
  settings: defaultSettings,
  github: { hasToken: false },
  loading: false,
  fetching: false,
  saving: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const [incidents, settings, github] = await Promise.all([
        window.zezenexcoderr.incident.list(),
        window.zezenexcoderr.incident.getSettings(),
        window.zezenexcoderr.github.tokenStatus()
      ]);
      set({
        incidents: Array.isArray(incidents) ? incidents : [],
        settings: { ...defaultSettings, ...(settings || {}) },
        github: github || { hasToken: false },
        loading: false
      });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  async saveSettings(patch) {
    set({ saving: true, error: null });
    try {
      const settings = await window.zezenexcoderr.incident.saveSettings(patch);
      set({ settings: { ...defaultSettings, ...(settings || {}) }, saving: false });
      return settings;
    } catch (error) {
      set({ error: error.message, saving: false });
      throw error;
    }
  },

  async saveGitHubToken(token) {
    const result = await window.zezenexcoderr.github.saveToken(token);
    set({ github: result || { hasToken: false } });
    return result;
  },

  async fetchManual(payload = {}) {
    set({ fetching: true, error: null });
    try {
      const result = await window.zezenexcoderr.incident.fetchManual(payload);
      set((state) => ({
        fetching: false,
        incidents: (result.incidents || []).reduce((list, incident) => mergeIncident(list, incident), state.incidents)
      }));
      return result;
    } catch (error) {
      set({ error: error.message, fetching: false });
      throw error;
    }
  },

  async startHealing(incidentId) {
    await window.zezenexcoderr.incident.startHealing(incidentId);
    set((state) => ({
      incidents: state.incidents.map((incident) =>
        incident.id === incidentId ? { ...incident, status: 'healing' } : incident
      )
    }));
  },

  async takeOver(incidentId) {
    const result = await window.zezenexcoderr.autoFix.takeOver(incidentId);
    if (result?.incident) {
      get().applyIncident(result.incident);
    }
    const worktreePath = result?.worktreePath || result?.projectPath;
    if (worktreePath) {
      await useProjectStore.getState().openProject(worktreePath);
    }
    return result;
  },

  applyIncident(incident) {
    set((state) => ({ incidents: mergeIncident(state.incidents, incident) }));
  },

  applyNewAlert(payload = {}) {
    const incident = payload.incidentData || payload.incident || payload;
    get().applyIncident(incident);
  },

  applyHealingStatus(payload = {}) {
    if (payload.incident) {
      get().applyIncident(payload.incident);
      return;
    }
    set((state) => ({
      incidents: state.incidents.map((incident) =>
        incident.id === payload.incidentId
          ? {
              ...incident,
              status: payload.status || incident.status,
              healingLog: [
                ...(incident.healingLog || []),
                {
                  step: payload.step,
                  status: payload.status,
                  message: payload.message,
                  timestamp: payload.timestamp || Date.now()
                }
              ].slice(-120),
              updatedAt: payload.timestamp || Date.now()
            }
          : incident
      )
    }));
  }
}));
