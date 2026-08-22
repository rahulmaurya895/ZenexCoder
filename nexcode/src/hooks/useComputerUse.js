import { useEffect } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { useComputerStore } from '@/store/computerStore';

let listenerUsers = 0;
let disposers = [];
let keyListenerUsers = 0;
let keyDisposer = null;

function terminateAgent(reason = 'AI CONTROL TERMINATED') {
  const agent = useAgentStore.getState();
  if (['running', 'paused'].includes(agent.runState)) {
    agent.stop().catch(() => {});
  }
  window.zenexcoder.ai?.abortAll?.(reason).catch(() => {});
  window.zenexcoder.notify?.show?.({ title: 'AI CONTROL TERMINATED', body: reason }).catch(() => {});
}

function ensureComputerListeners() {
  if (!window.zenexcoder?.computer) return;
  if (!disposers.length) {
    disposers = [
      window.zenexcoder.computer.onStateChanged((payload) => useComputerStore.getState().applyState(payload)),
      window.zenexcoder.computer.onActionLogged((payload) => useComputerStore.getState().addLog(payload)),
      window.zenexcoder.computer.onEmergencyStop((payload) => {
        useComputerStore.getState().refreshState().catch(() => {});
        terminateAgent(payload?.reason || 'Emergency stop triggered.');
      })
    ];
  }
  listenerUsers += 1;
}

function releaseComputerListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useComputerUse() {
  const computer = useComputerStore();

  useEffect(() => {
    ensureComputerListeners();
    useComputerStore.getState().refreshState().catch(() => {});
    return releaseComputerListeners;
  }, []);

  useEffect(() => {
    if (!keyDisposer) {
      let escapes = [];
      const onKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        const now = Date.now();
        escapes = [...escapes.filter((time) => now - time < 1400), now];
        if (escapes.length >= 3) {
          escapes = [];
          useComputerStore.getState().lock('escape-x3').finally(() => terminateAgent('Esc x3 emergency stop.'));
        }
      };
      window.addEventListener('keydown', onKeyDown, true);
      keyDisposer = () => {
        window.removeEventListener('keydown', onKeyDown, true);
        keyDisposer = null;
      };
    }
    keyListenerUsers += 1;
    return () => {
      keyListenerUsers = Math.max(0, keyListenerUsers - 1);
      if (keyListenerUsers === 0 && keyDisposer) {
        keyDisposer();
      }
    };
  }, []);

  return computer;
}
