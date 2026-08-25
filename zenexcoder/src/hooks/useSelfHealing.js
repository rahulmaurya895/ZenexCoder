import { useEffect } from 'react';
import { useIncidentStore } from '@/store/incidentStore';

let listenerUsers = 0;
let disposers = [];

function ensureListeners() {
  if (!disposers.length) {
    disposers = [
      window.zezenexcoderr.incident.onNewAlert((payload) => useIncidentStore.getState().applyNewAlert(payload)),
      window.zezenexcoderr.incident.onHealingStatus((payload) => useIncidentStore.getState().applyHealingStatus(payload))
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

export function useSelfHealing() {
  useEffect(() => {
    ensureListeners();
    useIncidentStore.getState().load().catch(() => {});
    return releaseListeners;
  }, []);
}
