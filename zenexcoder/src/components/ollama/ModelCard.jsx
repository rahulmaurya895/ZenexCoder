import { Download, Play, Trash2 } from 'lucide-react';

/**
 * @param {{model: object, downloaded?: boolean, running?: boolean, progress?: object, onDownload: () => void, onLoad: () => void, onDelete: () => void}} props
 */
export default function ModelCard({ model, downloaded, running, progress, onDownload, onLoad, onDelete }) {
  const percent = progress?.percent || (downloaded ? 100 : 0);
  return (
    <div className="model-card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>{model.name}</strong>
        <span className="attachment-pill">{model.badge}</span>
      </div>
      <div>{model.strength}</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        Size: {model.size} | RAM: {model.ram}
      </div>
      {model.warning && <div style={{ color: 'var(--warning)' }}>{model.warning}</div>}
      <div>Status: {running ? 'Running' : downloaded ? 'Ready' : progress?.status || 'Not Downloaded'}</div>
      <div className="progress" style={{ '--progress': `${percent}%` }}>
        <span />
      </div>
      {progress?.completed && (
        <div style={{ color: 'var(--text-secondary)' }}>
          {Math.round(progress.completed / 1024 / 1024)} MB downloaded
          {progress.speed ? ` | ${Math.round(progress.speed / 1024 / 1024)} MB/s` : ''}
          {progress.etaSeconds ? ` | ETA ${progress.etaSeconds}s` : ''}
        </div>
      )}
      <div className="chat-input-actions">
        {!downloaded && (
          <button onClick={onDownload}>
            <Download size={14} /> Download
          </button>
        )}
        {downloaded && (
          <button onClick={onLoad}>
            <Play size={14} /> Load Model
          </button>
        )}
        {downloaded && (
          <button className="danger-button" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
