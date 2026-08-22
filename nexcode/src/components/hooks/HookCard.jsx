import { GitBranch, Pencil, PlugZap, Trash2, Unplug } from 'lucide-react';

const eventNames = {
  'pre-commit': 'Pre-Commit',
  'pre-push': 'Pre-Push',
  onProjectOpen: 'Project Opened',
  onBranchChange: 'Branch Changed',
  onEnvChange: 'Environment Changed',
  on_file_save: 'File Saved'
};

function actionLabel(hook, automations = []) {
  if (hook.actionType === 'automation') {
    const automation = automations.find((item) => item.id === hook.automationId);
    return `Run Automation: ${automation?.name || 'Missing automation'}`;
  }
  if (hook.actionType === 'terminal_command') return `Run Command: ${hook.command || 'No command'}`;
  return `Run Agent Prompt: ${hook.prompt ? hook.prompt.slice(0, 54) : 'No prompt'}`;
}

function conditionLabel(condition = {}) {
  const parts = [];
  if (condition.branchPattern) parts.push(`branch ${condition.branchPattern}`);
  if (condition.fileExtensions) parts.push(`files ${condition.fileExtensions}`);
  if (condition.glob) parts.push(`glob ${condition.glob}`);
  return parts.join(' | ');
}

/**
 * @param {{hook: object, automations: object[], installed?: object, projectPath?: string, onToggle: () => void, onEdit: () => void, onDelete: () => void, onInstall: () => void, onRemove: () => void}} props
 */
export default function HookCard({ hook, automations, installed, projectPath, onToggle, onEdit, onDelete, onInstall, onRemove }) {
  const isGitHook = ['pre-commit', 'pre-push'].includes(hook.eventType);
  const physicalInstalled = installed?.[hook.eventType]?.installed;
  const condition = conditionLabel(hook.condition);

  return (
    <div className={`hook-card ${hook.enabled ? '' : 'disabled'}`}>
      <div className="hook-card-main">
        <div className="hook-title-row">
          <GitBranch size={16} />
          <strong>{hook.name}</strong>
          <span className={`connection-pill ${hook.enabled ? 'available' : 'coming-soon'}`}>{hook.enabled ? 'Enabled' : 'Disabled'}</span>
          {isGitHook && (
            <span className={`connection-pill ${physicalInstalled ? 'available' : 'coming-soon'}`}>
              {physicalInstalled ? 'Installed' : 'Not installed'}
            </span>
          )}
        </div>
        <div className="hook-rule">
          [{eventNames[hook.eventType] || hook.eventType}] to {actionLabel(hook, automations)}
        </div>
        {condition && <div className="hook-condition">{condition}</div>}
        {hook.blockOnIssues && <div className="hook-condition">Blocks Git execution on failure/denial.</div>}
      </div>
      <div className="hook-card-actions">
        <label className="check-row compact-check">
          <input type="checkbox" checked={hook.enabled} onChange={onToggle} />
          Enabled
        </label>
        {isGitHook && physicalInstalled ? (
          <button onClick={onRemove} disabled={!projectPath} title="Remove physical Git hook">
            <Unplug size={14} /> Remove
          </button>
        ) : isGitHook ? (
          <button onClick={onInstall} disabled={!projectPath} title="Install physical Git hook">
            <PlugZap size={14} /> Install
          </button>
        ) : null}
        <button onClick={onEdit} title="Edit hook">
          <Pencil size={14} /> Edit
        </button>
        <button className="danger-button" onClick={onDelete} title="Delete hook">
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
