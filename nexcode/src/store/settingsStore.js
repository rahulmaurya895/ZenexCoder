import { create } from 'zustand';
import { SYSTEM_PROMPTS } from '@/utils/promptTemplates';

const defaultSettings = {
  apiKeys: { openai: '', anthropic: '', google: '', groq: '' },
  defaultModels: {
    coding: { provider: 'google', modelId: 'gemini-3.6-flash', modelName: 'Gemini 3.6 Flash (Latest Flagship)' },
    chat: { provider: 'google', modelId: 'gemini-3.6-flash', modelName: 'Gemini 3.6 Flash (Latest Flagship)' },
    vision: { provider: 'google', modelId: 'gemini-3.6-flash', modelName: 'Gemini 3.6 Flash (Latest Flagship)' }
  },
  editorSettings: {
    fontSize: 13,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    tabSize: 2,
    wordWrap: true,
    minimap: true,
    autoSave: false,
    autoSaveInterval: 2000
  },
  aiSettings: {
    temperature: 0.7,
    maxTokens: 4096,
    contextMessages: 12,
    systemPrompt: SYSTEM_PROMPTS.coding,
    streaming: true,
    followUpDefault: { coding: 'steer', everyday: 'queue' }
  },
  appSettings: {
    language: 'auto',
    startWithOs: false,
    hardwareAcceleration: true,
    showApprovalNotifications: true,
    chromePath: ''
  },
  connections: {
    enabledIntegrations: { git: true }
  },
  isFirstLaunch: true
};

export const useSettingsStore = create((set, get) => ({
  ...defaultSettings,
  loading: false,
  async loadSettings() {
    set({ loading: true });
    try {
      const saved = await window.zenexcoder.store.get('settings', defaultSettings);
      set({
        ...defaultSettings,
        ...saved,
        apiKeys: {
          ...defaultSettings.apiKeys,
          ...(saved.apiKeys || {})
        },
        connections: {
          ...defaultSettings.connections,
          ...(saved.connections || {}),
          enabledIntegrations: {
            ...defaultSettings.connections.enabledIntegrations,
            ...(saved.connections?.enabledIntegrations || {})
          }
        },
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async saveSettings(partial) {
    const saved = await window.zenexcoder.store.get('settings', {}).catch(() => ({}));
    const next = { ...get(), ...partial };
    const serializable = {
      apiKeys: next.apiKeys,
      defaultModels: next.defaultModels,
      editorSettings: next.editorSettings,
      aiSettings: next.aiSettings,
      appSettings: next.appSettings,
      connections: partial.connections ?? saved.connections ?? next.connections,
      isFirstLaunch: next.isFirstLaunch
    };
    await window.zenexcoder.store.set('settings', serializable);
    set(partial);
  },
  async saveApiKey(provider, apiKey) {
    const apiKeys = { ...get().apiKeys, [provider]: apiKey };
    await get().saveSettings({ apiKeys });
  },
  async updateAiSettings(aiSettings) {
    await get().saveSettings({ aiSettings: { ...get().aiSettings, ...aiSettings } });
  },
  async updateEditorSettings(editorSettings) {
    await get().saveSettings({ editorSettings: { ...get().editorSettings, ...editorSettings } });
  },
  async finishFirstLaunch() {
    await get().saveSettings({ isFirstLaunch: false });
  },
  async resetSettings() {
    await window.zenexcoder.app.factoryReset();
    set(defaultSettings);
  }
}));


