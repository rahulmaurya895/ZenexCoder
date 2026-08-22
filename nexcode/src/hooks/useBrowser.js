import { useEffect } from 'react';
import { useBrowserStore } from '@/store/browserStore';

let listenerUsers = 0;
let disposers = [];

function ensureBrowserListeners() {
  if (!disposers.length) {
    disposers = [
      window.zenexcoder.browser.onNavChanged((payload) => useBrowserStore.getState().applyState(payload)),
      window.zenexcoder.browser.onFrameUpdate((payload) => useBrowserStore.getState().applyFrame(payload))
    ];
  }
  listenerUsers += 1;
}

function releaseBrowserListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useBrowser() {
  const browser = useBrowserStore();

  useEffect(() => {
    ensureBrowserListeners();
    useBrowserStore.getState().refreshState().catch(() => {});
    return releaseBrowserListeners;
  }, []);

  return browser;
}
