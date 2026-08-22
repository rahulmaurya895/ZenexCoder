import { Cable, PlugZap, Trash2, Unplug } from 'lucide-react';

const STATUS_LABELS = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error'
};

function commandSnippet(server) {
  return [server.command, ...(server.args || [])].filter(Boolean).join(' ') || 'No command configured';
}

/**
 * @param {{server: object, selected: boolean, status: string, onSelect: () => void, onConnect: () => void, onDisconnect: () => void, onDelete: () => void}} props
 */
export default function MCPServerCard({ server, selected, status = 'disconnected', onSelect, onConnect, onDisconnect, onDelete }) {
  const connected = status === 'connected';
  const connecting = status === 'connecting';

  return (
    <div
      className={`mcp-server-card ${selected ? 'selected' : ''}`}
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
      <div className="mcp-server-card-header">
        <span className={`mcp-status-dot ${status}`} />
        <strong>{server.name}</strong>
      </div>
      <code>{commandSnippet(server)}</code>
      <div className="mcp-server-card-footer">
        <span>{STATUS_LABELS[status] || STATUS_LABELS.disconnected}</span>
        <div className="top-bar-spacer" />
        <button
          className="icon-button"
          onClick={(event) => {
            event.stopPropagation();
            connected ? onDisconnect() : onConnect();
          }}
          disabled={connecting || !server.command}
          title={connected ? 'Disconnect MCP server' : 'Connect MCP server'}
        >
          {connected ? <Unplug size={14} /> : connecting ? <Cable size={14} /> : <PlugZap size={14} />}
        </button>
        <button
          className="icon-button danger-icon"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          title="Delete MCP server"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
