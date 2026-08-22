export const ACTION_RISK = {
  file_read: 'low',
  network_request: 'low',
  browser_read: 'low',
  computer_screenshot: 'medium',
  file_write: 'medium',
  file_create: 'medium',
  terminal_run: 'medium',
  package_install: 'medium',
  git_commit: 'medium',
  git_stash: 'medium',
  mcp_tool_call: 'medium',
  browser_interact: 'medium',
  computer_interact: 'high',
  file_delete: 'high',
  git_push: 'high',
  git_destructive: 'high'
};

export const HIGH_RISK_ACTIONS = new Set(['file_delete', 'git_push', 'git_destructive', 'computer_interact']);
export const LOW_RISK_ACTIONS = new Set(['file_read', 'network_request', 'browser_read']);

export function classifyAction(action = {}) {
  const actionType = action.actionType || inferActionType(action);
  return {
    actionType,
    riskLevel: ACTION_RISK[actionType] || 'medium'
  };
}

export function inferActionType(action = {}) {
  const command = action.command || '';
  if (action.actionType) return action.actionType;
  if (action.filePath && action.delete) return 'file_delete';
  if (action.filePath && action.create) return 'file_create';
  if (action.filePath && action.content != null) return 'file_write';
  if (/git\s+push/i.test(command)) return 'git_push';
  if (/git\s+reset\s+--hard|git\s+clean\s+-fd|rm\s+-rf|Remove-Item.*-Recurse|drop\s+database|format\s+/i.test(command)) {
    return 'git_destructive';
  }
  if (/npm\s+(i|install)|pnpm\s+(add|install)|yarn\s+(add|install)|pip\s+install|cargo\s+add/i.test(command)) {
    return 'package_install';
  }
  if (/git\s+commit/i.test(command)) return 'git_commit';
  if (command) return 'terminal_run';
  return 'file_read';
}

export function actionNeedsApproval({ actionType, mode, projectRule, sessionAllows = [] }) {
  if (HIGH_RISK_ACTIONS.has(actionType)) return true;
  if (LOW_RISK_ACTIONS.has(actionType)) return false;
  if (sessionAllows.includes(actionType)) return false;
  if (projectRule === 'allow') return false;
  return mode === 'default';
}
