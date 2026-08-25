import { useEffect, useRef } from 'react';
import { useKnowledgeStore } from '@/store/knowledgeStore';
import { useProjectStore } from '@/store/projectStore';

export function useKnowledge() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const autoSync = useKnowledgeStore((state) => state.settings.autoSync);
  const loadedRef = useRef(false);
  const indexedProjectRef = useRef(null);
  const autoSyncTimerRef = useRef(null);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    useKnowledgeStore.getState().loadSettings().then(() => {
      useKnowledgeStore.getState().refreshStats().catch(() => {});
    });
    const dispose = window.zezenexcoderr.vector.onSyncProgress((payload) => {
      useKnowledgeStore.getState().applyProgress(payload);
      if (payload.done) {
        useKnowledgeStore.getState().refreshStats().catch(() => {});
      }
    });
    return dispose;
  }, []);

  useEffect(() => {
    if (!projectPath || indexedProjectRef.current === projectPath) return;
    indexedProjectRef.current = projectPath;
    const settings = useKnowledgeStore.getState().settings;
    window.setTimeout(() => {
      useKnowledgeStore.getState().syncProject(projectPath, { indexExternal: settings.indexExternal }).catch(() => {});
    }, 500);
  }, [projectPath]);

  useEffect(() => {
    window.clearInterval(autoSyncTimerRef.current);
    autoSyncTimerRef.current = null;
    if (autoSync && projectPath) {
      autoSyncTimerRef.current = window.setInterval(() => {
        useKnowledgeStore.getState().syncProject(projectPath).catch(() => {});
      }, 60 * 60 * 1000);
    }
    return () => {
      window.clearInterval(autoSyncTimerRef.current);
    };
  }, [autoSync, projectPath]);
}
