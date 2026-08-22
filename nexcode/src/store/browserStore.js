import { create } from 'zustand';

const initialState = {
  active: false,
  url: '',
  title: '',
  isLoading: false,
  error: '',
  base64Image: '',
  dom: ''
};

export const useBrowserStore = create((set, get) => ({
  ...initialState,
  applyState(payload = {}) {
    set((state) => ({
      ...state,
      active: Boolean(payload.active ?? state.active),
      url: payload.url ?? state.url,
      title: payload.title ?? state.title,
      isLoading: Boolean(payload.isLoading ?? state.isLoading),
      error: payload.error ?? state.error
    }));
  },
  applyFrame(payload = {}) {
    set((state) => ({
      ...state,
      base64Image: payload.base64Image ?? state.base64Image,
      url: payload.url ?? state.url,
      title: payload.title ?? state.title
    }));
  },
  async refreshState() {
    const state = await window.zenexcoder.browser.state();
    set((current) => ({
      ...current,
      ...state,
      base64Image: state.base64Image ?? current.base64Image
    }));
    return state;
  },
  async start() {
    set({ isLoading: true, error: '' });
    try {
      const state = await window.zenexcoder.browser.start();
      set((current) => ({ ...current, ...state, isLoading: false, base64Image: state.base64Image ?? current.base64Image }));
      return state;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },
  async stop() {
    const state = await window.zenexcoder.browser.stop();
    set({ ...initialState, ...state });
    return state;
  },
  async navigate(url) {
    set({ isLoading: true, error: '' });
    try {
      const result = await window.zenexcoder.browser.navigate(url);
      set((state) => ({ ...state, ...result, dom: result.dom || state.dom, isLoading: false }));
      return result;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },
  async back() {
    const result = await window.zenexcoder.browser.back();
    set((state) => ({ ...state, ...result, dom: result.dom || state.dom }));
    return result;
  },
  async forward() {
    const result = await window.zenexcoder.browser.forward();
    set((state) => ({ ...state, ...result, dom: result.dom || state.dom }));
    return result;
  },
  async reload() {
    const result = await window.zenexcoder.browser.reload();
    set((state) => ({ ...state, ...result, dom: result.dom || state.dom }));
    return result;
  },
  async readPage() {
    set({ isLoading: true, error: '' });
    try {
      const dom = await window.zenexcoder.browser.getDOM();
      set({ dom, isLoading: false });
      return dom;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  }
}));
