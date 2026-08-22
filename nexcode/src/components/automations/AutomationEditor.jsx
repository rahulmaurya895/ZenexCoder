import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

const empty = {
  name: '',
  triggerType: 'manual',
  triggerParams: { glob: '**/*', intervalMinutes: 30 },
  promptTemplate: 'Review {{filePath}}:\n\n{{fileContent}}',
  permissionMode: 'default',
  enabled: true
};

/**
 * @param {{automation?: object, onSave: (automation: object) => void}} props
 */
export default function AutomationEditor({ automation, onSave }) {
  const [draft, setDraft] = useState(empty);
  useEffect(() => setDraft(automation || empty), [automation]);

  return (
    <div className="settings-section">
      <div className="panel-title">{draft.id ? 'Edit Automation' : 'Create Automation'}</div>
      <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Automation name" />
      <select value={draft.triggerType} onChange={(event) => setDraft({ ...draft, triggerType: event.target.value })}>
        <option value="manual">Manual</option>
        <option value="on_file_save">On file save</option>
        <option value="on_schedule">Schedule</option>
      </select>
      {draft.triggerType === 'on_file_save' && (
        <input
          value={draft.triggerParams?.glob || '**/*'}
          onChange={(event) => setDraft({ ...draft, triggerParams: { ...draft.triggerParams, glob: event.target.value } })}
          placeholder="Glob, e.g. **/*.test.js"
        />
      )}
      {draft.triggerType === 'on_schedule' && (
        <input
          type="number"
          value={draft.triggerParams?.intervalMinutes || 30}
          onChange={(event) => setDraft({ ...draft, triggerParams: { ...draft.triggerParams, intervalMinutes: Number(event.target.value) } })}
          placeholder="Interval minutes"
        />
      )}
      <textarea rows={5} value={draft.promptTemplate} onChange={(event) => setDraft({ ...draft, promptTemplate: event.target.value })} />
      <select value={draft.permissionMode} onChange={(event) => setDraft({ ...draft, permissionMode: event.target.value })}>
        <option value="default">Default</option>
        <option value="auto-review">Auto-review</option>
        <option value="full-access">Full access</option>
      </select>
      <button className="primary-button" onClick={() => onSave(draft)}>
        <Save size={14} /> Save Automation
      </button>
    </div>
  );
}
