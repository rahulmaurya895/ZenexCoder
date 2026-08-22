import { CheckCircle2, Copy, Trash2 } from 'lucide-react';

/**
 * @param {{env: object, selected: boolean, onSelect: () => void, onActivate: () => void, onDuplicate: () => void, onDelete: () => void}} props
 */
export default function EnvironmentCard({ env, selected, onSelect, onActivate, onDuplicate, onDelete }) {
  return (
    <div
      className={`environment-card ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="environment-card-title">
        <span className={`env-active-dot ${env.isActive ? 'active' : ''}`} />
        <strong>{env.name}</strong>
      </div>
      <div className="environment-card-meta">
        <span className={`env-type-pill ${env.type}`}>{env.type}</span>
        <span>{env.vars?.length || 0} variables</span>
      </div>
      <div className="environment-card-actions" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button" onClick={onActivate} disabled={env.isActive} title="Activate environment">
          <CheckCircle2 size={14} />
        </button>
        <button className="icon-button" onClick={onDuplicate} title="Duplicate environment">
          <Copy size={14} />
        </button>
        <button className="icon-button danger-icon" onClick={onDelete} disabled={env.isActive} title="Delete environment">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
