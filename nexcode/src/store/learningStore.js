import { create } from 'zustand';

export const useLearningStore = create((set, get) => ({
  rules: [],
  stats: { total: 0, local: 0, shared: 0, muted: 0, conflicts: 0, autoFixed: 0, humanInterventions: 0 },
  analysisState: { analyzedAt: 0, rulesCreated: 0, scannedApprovals: 0, scannedChanges: 0, error: '' },
  loading: false,
  error: '',

  async load() {
    set({ loading: true, error: '' });
    try {
      const [rules, stats, analysisState] = await Promise.all([
        window.zenexcoder.learning.getRules(),
        window.zenexcoder.learning.getStats(),
        window.zenexcoder.learning.getAnalysisState()
      ]);
      set({ rules, stats, analysisState, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  async saveRule(rule) {
    const saved = await window.zenexcoder.learning.updateRule(rule);
    set((state) => ({
      rules: [saved, ...state.rules.filter((item) => item.id !== saved.id)]
    }));
    await get().refreshStats();
    return saved;
  },

  async deleteRule(id) {
    await window.zenexcoder.learning.deleteRule(id);
    set((state) => ({ rules: state.rules.filter((rule) => rule.id !== id) }));
    await get().refreshStats();
  },

  async triggerAnalysis() {
    const result = await window.zenexcoder.learning.triggerAnalysis();
    set({ analysisState: result });
    await get().load();
    return result;
  },

  async refreshStats() {
    const stats = await window.zenexcoder.learning.getStats();
    set({ stats });
    return stats;
  },

  applyRuleUpdate(payload = {}) {
    if (payload.reason === 'delete' && payload.id) {
      set((state) => ({ rules: state.rules.filter((rule) => rule.id !== payload.id) }));
      get().refreshStats().catch(() => {});
      return;
    }
    if (!payload.rule) return;
    set((state) => ({
      rules: [payload.rule, ...state.rules.filter((rule) => rule.id !== payload.rule.id)]
    }));
    get().refreshStats().catch(() => {});
  },

  applyAnalysis(payload = {}) {
    set({ analysisState: payload });
    get().load().catch(() => {});
  }
}));
