import { create } from 'zustand';

const SETTINGS_KEY = 'knowledge:settings';

const defaultSettings = {
  indexExternal: false,
  autoSync: false
};

export const useKnowledgeStore = create((set, get) => ({
  stats: {
    codeVectors: 0,
    externalVectors: 0,
    totalFiles: 0,
    lastSyncAt: null,
    mode: 'unknown',
    embedModel: 'nomic-embed-text'
  },
  progress: null,
  syncing: false,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  error: null,
  settings: defaultSettings,
  async loadSettings() {
    const settings = await window.zezenexcoderr.store.get(SETTINGS_KEY, defaultSettings).catch(() => defaultSettings);
    set({ settings: { ...defaultSettings, ...(settings || {}) } });
    return get().settings;
  },
  async saveSettings(patch = {}) {
    const settings = { ...get().settings, ...patch };
    await window.zezenexcoderr.store.set(SETTINGS_KEY, settings);
    set({ settings });
    return settings;
  },
  async refreshStats() {
    const stats = await window.zezenexcoderr.vector.stats();
    set({ stats });
    return stats;
  },
  async syncProject(projectPath, options = {}) {
    if (!projectPath) {
      set({ error: 'Open a project before indexing.' });
      return null;
    }
    set({
      syncing: true,
      error: null,
      progress: { current: 0, total: 0, status: options.force ? 'Starting full re-index' : 'Starting sync' }
    });
    return window.zezenexcoderr.vector.syncStart({
      projectPath,
      force: Boolean(options.force),
      indexExternal: options.indexExternal ?? get().settings.indexExternal
    });
  },
  applyProgress(payload = {}) {
    set({
      progress: payload,
      syncing: !payload.done && !payload.error,
      error: payload.error || null,
      stats: payload.stats || get().stats
    });
  },
  async search(queryText, projectPath) {
    const query = String(queryText || '').trim();
    set({ searchQuery: queryText, searchLoading: Boolean(query), error: null });
    if (!query) {
      set({ searchResults: [], searchLoading: false });
      return [];
    }
    try {
      const results = await window.zezenexcoderr.vector.search({ queryText: query, projectPath, limit: 8, externalLimit: 3 });
      set({ searchResults: results, searchLoading: false });
      return results;
    } catch (error) {
      set({ error: error.message, searchLoading: false, searchResults: [] });
      return [];
    }
  }
}));
