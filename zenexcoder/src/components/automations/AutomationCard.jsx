import { Edit3, Play, Trash2 } from 'lucide-react';

/**
 * @param {{automation: object, onRun: () => void, onEdit: () => void, onDelete: () => void, onToggle: () => void}} props
 */
export default function AutomationCard({ automation, onRun, onEdit, onDelete, onToggle }) {
  return (
    <div className="model-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>{automation.name}</strong>
        <label className="check-row" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={automation.enabled} onChange={onToggle} /> Enabled
        </label>
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {automation.triggerType} {automation.triggerParams?.glob ? `| ${automation.triggerParams.glob}` : ''}
      </div>
      <div>Runs: {automation.runCount || 0} | Last: {automation.lastRun ? new Date(automation.lastRun).toLocaleString() : 'Never'}</div>
      <div className="chat-input-actions">
        <button onClick={onRun}>
          <Play size={14} /> Run Now
        </button>
        <button onClick={onEdit}>
          <Edit3 size={14} /> Edit
        </button>
        <button className="danger-button" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
