import { Check, Edit3, Trash2, X } from 'lucide-react';
import { useState } from 'react';

export default function LessonCard({ rule, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rule);

  function save() {
    onSave(draft).then(() => setEditing(false));
  }

  if (editing) {
    return (
      <article className="lesson-card editing">
        <label>
          <span>Trigger</span>
          <input value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })} />
        </label>
        <label>
          <span>Avoid</span>
          <textarea rows={2} value={draft.avoid} onChange={(event) => setDraft({ ...draft, avoid: event.target.value })} />
        </label>
        <label>
          <span>Suggest</span>
          <textarea rows={2} value={draft.suggest} onChange={(event) => setDraft({ ...draft, suggest: event.target.value })} />
        </label>
        <div className="chat-input-actions">
          <button className="primary-button" onClick={save}>
            <Check size={14} /> Save
          </button>
          <button onClick={() => { setDraft(rule); setEditing(false); }}>
            <X size={14} /> Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className={`lesson-card ${rule.conflict ? 'conflict' : ''} ${rule.muted ? 'muted' : ''}`}>
      <div className="lesson-card-header">
        <div>
          <strong>{rule.trigger}</strong>
          <span>{rule.source} · {rule.evidenceCount} evidence · {Math.round((rule.confidence || 0) * 100)}%</span>
        </div>
        <div className="chat-input-actions">
          <button className="icon-button" title="Edit lesson" onClick={() => setEditing(true)}>
            <Edit3 size={14} />
          </button>
          <button className="icon-button danger-button" title="Delete lesson" onClick={() => onDelete(rule.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p><b>Avoid:</b> {rule.avoid}</p>
      <p><b>Use:</b> {rule.suggest}</p>
      {rule.conflict ? <div className="learning-warning">Conflict detected in team knowledge base. Newest active rule wins.</div> : null}
    </article>
  );
}
