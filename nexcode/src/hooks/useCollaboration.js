import { useEffect } from 'react';
import { useCollaborationStore } from '@/store/collaborationStore';
import { useLearningStore } from '@/store/learningStore';
import { useProjectStore } from '@/store/projectStore';

export function useCollaboration() {
  const activeFile = useProjectStore((state) => state.getActiveFile?.());

  useEffect(() => {
    if (!window.zenexcoder?.collab || !window.zenexcoder?.learning) {
      return undefined;
    }
    const disposers = [
      window.zenexcoder.collab.onPeersUpdated((payload) => useCollaborationStore.getState().applyPeers(payload)),
      window.zenexcoder.collab.onRuleSynced((payload) => useCollaborationStore.getState().applyRuleSynced(payload)),
      window.zenexcoder.collab.onPresenceUpdate((payload) => useCollaborationStore.getState().applyPresence(payload)),
      window.zenexcoder.learning.onRulesUpdated((payload) => useLearningStore.getState().applyRuleUpdate(payload)),
      window.zenexcoder.learning.onAnalysisComplete((payload) => useLearningStore.getState().applyAnalysis(payload))
    ];
    useCollaborationStore.getState().load().catch(() => {});
    useLearningStore.getState().load().catch(() => {});
    return () => disposers.forEach((dispose) => dispose());
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = useCollaborationStore.getState();
      if (state.connected) {
        state.updatePresence(activeFile?.path || '', activeFile ? 'Coding' : 'Idle');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeFile?.path]);
}
