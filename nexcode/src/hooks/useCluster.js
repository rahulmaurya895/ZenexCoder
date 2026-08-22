import { useEffect } from 'react';
import { useClusterStore } from '@/store/clusterStore';

let listenerUsers = 0;
let disposers = [];

function ensureListeners() {
  if (!disposers.length) {
    disposers = [
      window.nexcode.cluster.onNodeFound((node) => useClusterStore.getState().applyNode(node)),
      window.nexcode.cluster.onStatusUpdate((node) => useClusterStore.getState().applyStatus(node)),
      window.nexcode.cluster.onStateUpdate((state) => useClusterStore.getState().applyState(state))
    ];
  }
  listenerUsers += 1;
}

function releaseListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useCluster() {
  useEffect(() => {
    ensureListeners();
    useClusterStore.getState().load().catch(() => {});
    return releaseListeners;
  }, []);
}
