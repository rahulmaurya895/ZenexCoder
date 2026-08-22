import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { useAgentStore } from '@/store/agentStore';
import { actionNeedsApproval, classifyAction } from '@/utils/approvalRules';

export function usePermissions() {
  const mode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const setProjectRule = usePermissionsStore((state) => state.setProjectRule);
  const projectPath = useProjectStore((state) => state.projectPath);
  const sessionAllows = useAgentStore((state) => state.sessionAllows);

  function check(action) {
    const { actionType, riskLevel } = classifyAction(action);
    const projectRule = projectPath ? projectRules[projectPath]?.[actionType] : undefined;
    return {
      actionType,
      riskLevel,
      requiresApproval: actionNeedsApproval({ actionType, mode, projectRule, sessionAllows }),
      mode,
      projectRule
    };
  }

  return { mode, projectRules, projectPath, check, setProjectRule };
}
