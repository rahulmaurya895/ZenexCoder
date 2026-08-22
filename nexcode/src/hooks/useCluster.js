import { useEffect } from 'react';
import { useClusterStore } from '@/store/clusterStore';

let listenerUsers = 0;
let disposers = [];

function ensureListeners() {
  if (!disposers.length) {
    disposers = [
      window.zenexcoder.cluster.onNodeFound((node) => useClusterStore.getState().applyNode(node)),
      window.zenexcoder.cluster.onStatusUpdate((node) => useClusterStore.getState().applyStatus(node)),
      window.zenexcoder.cluster.onStateUpdate((state) => useClusterStore.getState().applyState(state))
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
