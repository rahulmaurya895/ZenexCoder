import { useEffect } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { useAppStore } from '@/store/appStore';

let listenerUsers = 0;
let disposers = [];

function ensureAgentListeners() {
  if (!window.zenexcoder?.agent) return;
  if (!disposers.length) {
    disposers = [
      window.zenexcoder.agent.onStepUpdate(({ step }) => useAgentStore.getState().updateStep(step)),
      window.zenexcoder.agent.onRunUpdate((payload) => {
        if (payload.plan) useAgentStore.getState().hydrateRun(payload.plan);
        if (payload.runState) useAgentStore.getState().setRunState(payload.runState);
        if (['running', 'paused'].includes(payload.runState)) {
          useAppStore.getState().setRightPanelOpen(true);
        }
      }),
      window.zenexcoder.agent.onApprovalPending((approval) => {
        useAgentStore.getState().addApproval(approval);
        useAppStore.getState().setRightPanelOpen(true);
      }),
      window.zenexcoder.agent.onApprovalResolved((payload) => {
        useAgentStore.setState((state) => ({
          pendingApprovals: state.pendingApprovals.filter((item) => item.id !== (payload.actionId || payload.id))
        }));
      })
    ];
  }
  listenerUsers += 1;
}

function releaseAgentListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useAgentRun() {
  const agent = useAgentStore();
  const mode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const showSystemNotifications = usePermissionsStore((state) => state.showSystemNotifications);
  const projectPath = useProjectStore((state) => state.projectPath);
  const workMode = useAppStore((state) => state.workMode);
  const devToolsVisible = useAppStore((state) => state.devToolsVisible);

  useEffect(() => {
    ensureAgentListeners();
    return releaseAgentListeners;
  }, []);

  function startPlan(plan) {
    const rules = projectPath ? projectRules[projectPath] || {} : {};
    return agent.startRun(plan, {
      cwd: projectPath,
      permissions: {
        mode,
        projectRules: rules,
        sessionAllows: agent.sessionAllows,
        showSystemNotifications,
        workMode,
        devToolsVisible
      }
    });
  }

  return { ...agent, startPlan };
}

