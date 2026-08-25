import { create } from 'zustand';
import { useProjectStore } from '@/store/projectStore';
import { normalizeScenario, parseScenario } from '@/utils/scenarioParser';

const defaultScenario = `navigate http://localhost:5173
click button
screenshot home`;

export const useQaStore = create((set, get) => ({
  scenarioText: defaultScenario,
  persona: 'normal',
  allowProduction: false,
  active: false,
  logs: [],
  screenshots: [],
  result: null,
  error: '',

  setField(key, value) {
    set({ [key]: value });
  },

  parsedSteps() {
    return parseScenario(get().scenarioText);
  },

  projectPath() {
    return useProjectStore.getState().projectPath || '';
  },

  async runScenario() {
    set({ active: true, error: '', result: null, logs: [], screenshots: [] });
    const scenario = normalizeScenario({
      text: get().scenarioText,
      persona: get().persona,
      allowProduction: get().allowProduction,
      projectPath: get().projectPath()
    });
    try {
      const result = await window.zezenexcoderr.qa.runScenario(scenario);
      set({ result, active: false });
      return result;
    } catch (error) {
      set({ error: error.message, active: false });
      throw error;
    }
  },

  stop() {
    return window.zezenexcoderr.qa.stop().catch(() => {});
  },

  applyLog(payload = {}) {
    set((state) => ({
      logs: [{ id: `${Date.now()}-${Math.random()}`, ...payload }, ...state.logs].slice(0, 400)
    }));
  },

  applyScreenshot(payload = {}) {
    set((state) => ({
      screenshots: [{ id: `${Date.now()}-${Math.random()}`, ...payload }, ...state.screenshots].slice(0, 60)
    }));
  },

  applyResult(payload = {}) {
    set({ result: payload, active: false });
  }
}));
