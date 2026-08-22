import { useEffect } from 'react';
import { useEnvironmentStore } from '@/store/environmentStore';
import { useProjectStore } from '@/store/projectStore';

let listenerUsers = 0;
let disposeActive = null;

function ensureEnvListener() {
  if (!disposeActive) {
    disposeActive = window.nexcode.env.onActiveChanged((payload) => {
      useEnvironmentStore.getState().applyActiveChanged(payload);
      window.nexcode.notify
        .show({ title: 'Environment changed', body: 'Restart terminal sessions to apply.' })
        .catch(() => {});
    });
  }
  listenerUsers += 1;
}

function releaseEnvListener() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0 && disposeActive) {
    disposeActive();
    disposeActive = null;
  }
}

export function useEnvironment() {
  const environment = useEnvironmentStore();
  const projectPath = useProjectStore((state) => state.projectPath);

  useEffect(() => {
    if (projectPath) {
      useEnvironmentStore.getState().refresh(projectPath);
    }
  }, [projectPath]);

  useEffect(() => {
    ensureEnvListener();
    return releaseEnvListener;
  }, []);

  return environment;
}
