/**
 * @param {{plugin: object, enabled: boolean, onToggle: () => void, children?: import('react').ReactNode}} props
 */
export default function PluginCard({ plugin, enabled, onToggle, children }) {
  return (
    <div className="model-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>{plugin.name}</strong>
        <label className="check-row" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={enabled} onChange={onToggle} /> Enabled
        </label>
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>{plugin.description}</div>
      {enabled && children}
    </div>
  );
}
