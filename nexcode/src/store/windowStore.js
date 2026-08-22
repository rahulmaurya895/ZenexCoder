import { create } from 'zustand';

function normalizePopoutState(payload = {}, previous = {}) {
  return {
    popoutExists: Boolean(payload.exists),
    popoutVisible: Boolean(payload.visible),
    popoutHotkey: payload.hotkey || previous.popoutHotkey || 'Alt+Space',
    popoutHotkeyRegistered: payload.registered ?? previous.popoutHotkeyRegistered ?? false
  };
}

export const useWindowStore = create((set, get) => ({
  popoutExists: false,
  popoutVisible: false,
  popoutHotkey: 'Alt+Space',
  popoutHotkeyRegistered: false,
  loading: false,
  error: '',
  applyPopoutState(payload = {}) {
    set((state) => ({ ...normalizePopoutState(payload, state), error: '' }));
  },
  async loadPopoutState() {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.window.getPopoutState();
      set((current) => ({ ...normalizePopoutState(state, current), loading: false, error: '' }));
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  async togglePopout() {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.window.togglePopout();
      set((current) => ({ ...normalizePopoutState(state, current), loading: false, error: '' }));
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  async setPopoutHotkey(hotkey) {
    set({ loading: true, error: '' });
    try {
      const state = await window.zenexcoder.window.setPopoutHotkey(hotkey);
      set((current) => ({ ...normalizePopoutState(state, current), loading: false, error: '' }));
      return state;
    } catch (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
  },
  currentPopoutState() {
    const state = get();
    return {
      exists: state.popoutExists,
      visible: state.popoutVisible,
      hotkey: state.popoutHotkey,
      registered: state.popoutHotkeyRegistered
    };
  }
}));
