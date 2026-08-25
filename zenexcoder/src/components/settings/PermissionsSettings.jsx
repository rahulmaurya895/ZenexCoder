import { ShieldAlert } from 'lucide-react';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { ACTION_RISK } from '@/utils/approvalRules';

const modes = [
  {
    id: 'default',
    label: 'Default',
    description: 'Ask before file writes, terminal commands, package installs, and git changes.'
  },
  {
    id: 'auto-review',
    label: 'Auto-review',
    description: 'Run medium-risk actions automatically and log changes for review.'
  },
  {
    id: 'full-access',
    label: 'Full access',
    description: 'Run non-destructive writes and commands without asking; destructive actions still require approval.'
  }
];

export default function PermissionsSettings() {
  const mode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const showSystemNotifications = usePermissionsStore((state) => state.showSystemNotifications);
  const setMode = usePermissionsStore((state) => state.setMode);
  const setProjectRule = usePermissionsStore((state) => state.setProjectRule);
  const setSystemNotifications = usePermissionsStore((state) => state.setSystemNotifications);
  const projectPath = useProjectStore((state) => state.projectPath);
  const rules = projectPath ? projectRules[projectPath] || {} : {};

  return (
    <div className="settings-section">
      <div className="panel-title">Permissions</div>
      <div className="mode-list">
        {modes.map((item) => (
          <button
            key={item.id}
            className={`mode-option ${mode === item.id ? 'active' : ''}`}
            onClick={() => setMode(item.id)}
          >
            <ShieldAlert size={16} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={showSystemNotifications}
          onChange={(event) => setSystemNotifications(event.target.checked)}
        />
        Show system notifications for approvals and review batches
      </label>
      <div className="panel-title">Project Overrides</div>
      {!projectPath ? (
        <div className="muted-text">Open a folder to manage per-project allow rules.</div>
      ) : (
        <div className="permission-grid">
          {Object.keys(ACTION_RISK).map((actionType) => (
            <label key={actionType} className="form-row compact-row">
              <span>{actionType.replaceAll('_', ' ')}</span>
              <select
                value={rules[actionType] || 'ask'}
                onChange={(event) => setProjectRule(projectPath, actionType, event.target.value)}
              >
                <option value="ask">Ask / follow mode</option>
                <option value="allow">Always allow here</option>
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
