import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { usePermissions } from './usePermissions';

export function useApprovalAction() {
  const { check } = usePermissions();
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);

  const requestApproval = useCallback(
    async (approval) =>
      new Promise((resolve) => {
        const id = approval.id || `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const dispose = window.nexcode.agent.onApprovalResolved((payload) => {
          if ((payload.actionId || payload.id) !== id) return;
          dispose();
          resolve(payload.decision === 'approve' ? payload : null);
        });
        window.nexcode.agent
          .requestApproval({ ...approval, id })
          .then(() => setRightPanelOpen(true))
          .catch(() => {
            dispose();
            resolve(null);
          });
      }),
    [setRightPanelOpen]
  );

  const runWithApproval = useCallback(
    async (action, operation) => {
      const permission = check(action);
      if (permission.requiresApproval) {
        const decision = await requestApproval({
          actionType: permission.actionType,
          title: action.title || `Approve ${permission.actionType.replaceAll('_', ' ')}`,
          description: action.description || '',
          riskLevel: permission.riskLevel
        });
        if (!decision) return null;
      }
      return operation();
    },
    [check, requestApproval]
  );

  return { check, requestApproval, runWithApproval };
}
