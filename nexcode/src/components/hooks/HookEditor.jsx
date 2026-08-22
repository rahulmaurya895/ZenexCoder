import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAutomationStore } from '@/store/automationStore';

const empty = {
  name: '',
  eventType: 'pre-commit',
  condition: { branchPattern: '', fileExtensions: '', glob: '' },
  actionType: 'agent_prompt',
  automationId: '',
  prompt: 'Review this hook event for risks before continuing.\n\nEvent: {{event}}\nProject: {{projectPath}}\nBranch: {{branch}}\nFile: {{filePath}}',
  command: '',
  blockOnIssues: true,
  enabled: true
};

const eventLabels = [
  ['pre-commit', 'Git Pre-Commit'],
  ['pre-push', 'Git Pre-Push'],
  ['onProjectOpen', 'Project Opened'],
  ['onBranchChange', 'Branch Changed'],
  ['onEnvChange', 'Environment Changed'],
  ['on_file_save', 'File Saved']
];

/**
 * @param {{hook?: object, onSave: (hook: object) => void, onCancel: () => void}} props
 */
export default function HookEditor({ hook, onSave, onCancel }) {
  const [draft, setDraft] = useState(empty);
  const automations = useAutomationStore((state) => state.automations);

  useEffect(() => {
    setDraft(hook ? { ...empty, ...hook, condition: { ...empty.condition, ...(hook.condition || {}) } } : empty);
  }, [hook]);

  function updateCondition(patch) {
    setDraft((current) => ({ ...current, condition: { ...(current.condition || {}), ...patch } }));
  }

  return (
    <div className="hook-editor">
      <div className="panel-title">{draft.id ? 'Edit Hook' : 'Create Hook'}</div>
      <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Hook name" />

      <div className="hook-editor-grid">
        <label>
          <span>When</span>
          <select value={draft.eventType} onChange={(event) => setDraft({ ...draft, eventType: event.target.value })}>
            {eventLabels.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Then</span>
          <select value={draft.actionType} onChange={(event) => setDraft({ ...draft, actionType: event.target.value })}>
            <option value="agent_prompt">Run Agent Prompt</option>
            <option value="automation">Run Automation</option>
            <option value="terminal_command">Run Terminal Command</option>
          </select>
        </label>
      </div>

      <div className="hook-condition-grid">
        <input
          value={draft.condition?.branchPattern || ''}
          onChange={(event) => updateCondition({ branchPattern: event.target.value })}
          placeholder="Branch pattern, e.g. feature/*"
        />
        <input
          value={draft.condition?.fileExtensions || ''}
          onChange={(event) => updateCondition({ fileExtensions: event.target.value })}
          placeholder="File extensions, e.g. .js, .jsx"
        />
        <input
          value={draft.condition?.glob || ''}
          onChange={(event) => updateCondition({ glob: event.target.value })}
          placeholder="File glob, e.g. **/*.test.js"
        />
      </div>

      {draft.actionType === 'automation' ? (
        <select value={draft.automationId} onChange={(event) => setDraft({ ...draft, automationId: event.target.value })}>
          <option value="">Select automation</option>
          {automations.map((automation) => (
            <option value={automation.id} key={automation.id}>{automation.name}</option>
          ))}
        </select>
      ) : draft.actionType === 'terminal_command' ? (
        <textarea
          rows={3}
          value={draft.command}
          onChange={(event) => setDraft({ ...draft, command: event.target.value })}
          placeholder="Command to run in project root"
        />
      ) : (
        <textarea
          rows={5}
          value={draft.prompt}
          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
          placeholder="Prompt template"
        />
      )}

      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.blockOnIssues}
          onChange={(event) => setDraft({ ...draft, blockOnIssues: event.target.checked })}
        />
        Block Git execution if this hook fails or is denied
      </label>

      <label className="check-row">
        <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
        Enabled
      </label>

      <div className="chat-input-actions">
        <button className="primary-button" onClick={() => onSave({ ...draft, name: draft.name || eventLabels.find(([value]) => value === draft.eventType)?.[1] || 'Hook' })}>
          <Save size={14} /> Save Hook
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
