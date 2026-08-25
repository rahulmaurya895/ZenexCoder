import { useEffect } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { useAppStore } from '@/store/appStore';
import { useChatStore } from '@/store/chatStore';
import { useWindowStore } from '@/store/windowStore';

const sourceId = globalThis.crypto?.randomUUID?.() || `window-${Date.now()}-${Math.random()}`;
let applyingRemote = false;

const syncFields = {
  chat: ['sessions', 'activeSessionId', 'messages', 'searchQuery', 'highlightMessageId', 'tokenEstimate'],
  agent: ['plan', 'runState', 'pendingApprovals', 'sessionAllows', 'followUps', 'startedAt', 'completedAt'],
  app: [
    'theme',
    'sidebarOpen',
    'chatPanelOpen',
    'fileTreeOpen',
    'rightPanelOpen',
    'devToolsVisible',
    'workMode',
    'reviewMode',
    'pendingReviewCount',
    'fullAccessBannerDismissed',
    'activePanel',
    'ollamaStatus',
    'ollamaVersion',
    'hardware',
    'activeModel',
    'isStreaming',
    'lastResponseMs',
    'modelRamUsed',
    'notice'
  ]
};

function pickState(state, fields) {
  return fields.reduce((payload, field) => {
    payload[field] = state[field];
    return payload;
  }, {});
}

function broadcast(storeName, state) {
  if (applyingRemote || !window.zezenexcoderr?.storeSync) return;
  const fields = syncFields[storeName];
  if (!fields) return;
  window.zezenexcoderr.storeSync.broadcast({
    sourceId,
    store: storeName,
    state: pickState(state, fields),
    at: Date.now()
  }).catch(() => {});
}

function applyRemote(payload = {}) {
  if (!payload.state || payload.sourceId === sourceId) return;
  const fields = syncFields[payload.store];
  if (!fields) return;
  const nextState = pickState(payload.state, fields);
  applyingRemote = true;
  try {
    if (payload.store === 'chat') useChatStore.setState(nextState);
    if (payload.store === 'agent') useAgentStore.setState(nextState);
    if (payload.store === 'app') useAppStore.setState(nextState);
  } finally {
    applyingRemote = false;
  }
}

export function usePopout() {
  useEffect(() => {
    useWindowStore.getState().loadPopoutState().catch(() => {});

    if (!window.zezenexcoderr?.window || !window.zezenexcoderr?.storeSync) {
      return undefined;
    }

    const disposers = [
      window.zezenexcoderr.window.onPopoutState((state) => useWindowStore.getState().applyPopoutState(state)),
      window.zezenexcoderr.storeSync.onSync(applyRemote),
      useChatStore.subscribe((state) => broadcast('chat', state)),
      useAgentStore.subscribe((state) => broadcast('agent', state)),
      useAppStore.subscribe((state) => broadcast('app', state))
    ];

    const syncTimer = window.setTimeout(() => {
      broadcast('chat', useChatStore.getState());
      broadcast('agent', useAgentStore.getState());
      broadcast('app', useAppStore.getState());
    }, 250);

    return () => {
      window.clearTimeout(syncTimer);
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  return useWindowStore();
}
