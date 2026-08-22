import { create } from 'zustand';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';

const defaultVoiceSettings = {
  provider: 'openai',
  endpoint: '',
  model: 'gpt-realtime-2',
  voice: 'marin',
  apiKey: '',
  useStoredOpenAiKey: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  turnDetection: 'semantic_vad'
};

const disconnectedState = {
  connected: false,
  connectionState: 'disconnected',
  inputLevel: 0,
  outputLevel: 0,
  error: ''
};

function deviceLabel(device, index, fallback) {
  return device.label || `${fallback} ${index + 1}`;
}

export const useVoiceStore = create((set, get) => ({
  ...disconnectedState,
  muted: false,
  settings: defaultVoiceSettings,
  devices: { inputs: [], outputs: [] },
  transcript: [],
  toolCalls: [],
  loading: false,

  async loadSettings() {
    const saved = await window.zenexcoder.store.get('voice:settings', defaultVoiceSettings).catch(() => defaultVoiceSettings);
    set({
      settings: {
        ...defaultVoiceSettings,
        ...(saved || {})
      }
    });
    await get().enumerateDevices();
  },

  async saveSettings(patch = {}) {
    const settings = { ...get().settings, ...patch };
    await window.zenexcoder.store.set('voice:settings', settings);
    set({ settings });
    return settings;
  },

  async enumerateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      set({ devices: { inputs: [], outputs: [] } });
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    set({
      devices: {
        inputs: devices
          .filter((device) => device.kind === 'audioinput')
          .map((device, index) => ({ id: device.deviceId || 'default', label: deviceLabel(device, index, 'Microphone') })),
        outputs: devices
          .filter((device) => device.kind === 'audiooutput')
          .map((device, index) => ({ id: device.deviceId || 'default', label: deviceLabel(device, index, 'Speaker') }))
      }
    });
  },

  async connect() {
    const { settings } = get();
    const appSettings = useSettingsStore.getState();
    const apiKey = settings.useStoredOpenAiKey ? appSettings.apiKeys?.openai || '' : settings.apiKey || '';
    const projectPath = useProjectStore.getState().projectPath;
    set({ loading: true, connectionState: 'connecting', error: '' });
    try {
      const state = await window.zenexcoder.voice.connect({
        ...settings,
        apiKey,
        projectPath
      });
      set({
        loading: false,
        connected: true,
        connectionState: state.connectionState || 'listening',
        error: ''
      });
      return state;
    } catch (error) {
      set({
        ...disconnectedState,
        loading: false,
        error: error.message || 'Unable to connect voice session.'
      });
      window.zenexcoder.notify.show({
        title: 'Voice connection failed',
        body: error.message || 'Unable to connect voice session.',
        type: 'error'
      }).catch(() => {});
      throw error;
    }
  },

  async disconnect() {
    await window.zenexcoder.voice.disconnect().catch(() => {});
    set({
      ...disconnectedState,
      loading: false
    });
  },

  applyRemoteState(payload = {}) {
    set({
      connected: Boolean(payload.connected),
      connectionState: payload.connectionState || 'disconnected',
      error: payload.error || ''
    });
  },

  setMuted(muted) {
    set({ muted });
  },

  toggleMuted() {
    set((state) => ({ muted: !state.muted }));
  },

  setInputLevel(inputLevel) {
    set({ inputLevel: Math.max(0, Math.min(1, inputLevel || 0)) });
  },

  setOutputLevel(outputLevel) {
    set({ outputLevel: Math.max(0, Math.min(1, outputLevel || 0)) });
  },

  addTranscriptDelta(delta = {}) {
    const text = delta.text || '';
    if (!text) return;
    set((state) => ({
      transcript: [
        ...state.transcript.slice(-80),
        {
          id: `voice-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: delta.role || 'assistant',
          text,
          createdAt: delta.createdAt || Date.now()
        }
      ]
    }));
  },

  addToolCall(payload = {}) {
    set((state) => ({
      toolCalls: [
        ...state.toolCalls.slice(-20),
        {
          id: `voice-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...payload
        }
      ]
    }));
  },

  sendContextUpdate(payload = {}) {
    const state = get();
    if (!state.connected) return Promise.resolve({ ok: false, reason: 'not_connected' });
    return window.zenexcoder.voice.sendContextUpdate(payload).catch((error) => ({ ok: false, error: error.message }));
  }
}));
