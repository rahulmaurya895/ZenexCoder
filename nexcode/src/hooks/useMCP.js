import { useEffect } from 'react';
import { useMCPStore } from '@/store/mcpStore';

let listenerUsers = 0;
let disposeStatus = null;

function ensureMcpListener() {
  if (!disposeStatus) {
    disposeStatus = window.zenexcoder.mcp.onStatusChanged((payload) => {
      useMCPStore.getState().applyStatus(payload);
    });
  }
  listenerUsers += 1;
}

function releaseMcpListener() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0 && disposeStatus) {
    disposeStatus();
    disposeStatus = null;
  }
}

export function useMCP() {
  const mcp = useMCPStore();

  useEffect(() => {
    useMCPStore.getState().loadServers();
  }, []);

  useEffect(() => {
    ensureMcpListener();
    return releaseMcpListener;
  }, []);

  return mcp;
}
