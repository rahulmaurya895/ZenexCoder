import { Edit3, PlugZap, Plus, Server, Trash2, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMCP } from '@/hooks/useMCP';
import MCPServerCard from './MCPServerCard';
import MCPServerForm from './MCPServerForm';
import MCPToolList from './MCPToolList';

function commandLine(server) {
  return [server.command, ...(server.args || [])].filter(Boolean).join(' ');
}

function EnvSummary({ server }) {
  const keys = Object.keys(server.env || {});
  if (!keys.length) return <span className="muted-text">No custom env vars.</span>;
  return (
    <div className="mcp-env-summary">
      {keys.map((key) => (
        <span className="env-source-badge" key={key}>{key}</span>
      ))}
    </div>
  );
}

export default function MCPServersPanel() {
  const mcp = useMCP();
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState('view');
  const servers = mcp.servers || [];
  const selected = useMemo(() => servers.find((server) => server.id === selectedId) || servers[0] || null, [servers, selectedId]);
  const status = selected ? mcp.connectionStates[selected.id] || 'disconnected' : 'disconnected';
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const tools = selected ? mcp.serverTools[selected.id] || [] : [];
  const resources = selected ? mcp.serverResources[selected.id] || [] : [];
  const resourceTemplates = selected ? mcp.serverResourceTemplates[selected.id] || [] : [];
  const error = selected ? mcp.serverErrors[selected.id] || '' : '';

  useEffect(() => {
    if (!selectedId && selected?.id) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  async function connect(server = selected) {
    if (!server) return;
    await mcp.connectServer(server.id).catch((err) => {
      window.zezenexcoderr.notify.show({ title: 'Extension connection failed', body: err.message }).catch(() => {});
    });
  }

  async function disconnect(server = selected) {
    if (!server) return;
    await mcp.disconnectServer(server.id);
  }

  async function remove(server) {
    if (!server) return;
    const ok = true;

    await mcp.deleteServer(server.id);
    setSelectedId('');
    setMode('view');
  }

  async function saveServer(config) {
    try {
      const saved = selected && mode === 'edit'
        ? await mcp.updateServer(selected.id, config)
        : await mcp.addServer(config);
      setSelectedId(saved.id);
      setMode('view');
      if (mcp.connectionStates[saved.id] === 'connected') {
        await mcp.disconnectServer(saved.id);
      }
      await mcp.connectServer(saved.id);
    } catch (error) {
      await window.zezenexcoderr.notify.show({ title: 'Extension', body: error.message });
    }
  }

  return (
    <section className="panel mcp-panel">
      <div className="panel-header">
        <Server size={16} />
        <span className="panel-title">Extensions</span>
      </div>
      <div className="mcp-layout">
        <aside className="mcp-server-list">
          {servers.map((server) => (
            <MCPServerCard
              key={server.id}
              server={server}
              selected={selected?.id === server.id && mode !== 'add'}
              status={mcp.connectionStates[server.id] || 'disconnected'}
              onSelect={() => {
                setSelectedId(server.id);
                setMode('view');
              }}
              onConnect={() => connect(server)}
              onDisconnect={() => disconnect(server)}
              onDelete={() => remove(server)}
            />
          ))}
          {!servers.length && <div className="muted-text">No extensions configured.</div>}
          <button
            className="primary-button"
            onClick={() => {
              setSelectedId('');
              setMode('add');
            }}
          >
            <Plus size={14} /> Add Extension
          </button>
        </aside>

        <main className="mcp-detail">
          {mode === 'add' || mode === 'edit' ? (
            <MCPServerForm
              server={mode === 'edit' ? selected : null}
              onSubmit={saveServer}
              onCancel={() => setMode('view')}
            />
          ) : !selected ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <h2>Add an extension</h2>
                <p>Configure a local tool bridge or extension integration.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mcp-detail-header">
                <div>
                  <div className="mcp-title-row">
                    <span className={`mcp-status-dot ${status}`} />
                    <h2>{selected.name}</h2>
                  </div>
                  <code>{commandLine(selected)}</code>
                </div>
                <div className="top-bar-spacer" />
                <button onClick={() => (connected ? disconnect(selected) : connect(selected))} disabled={connecting || !selected.command}>
                  {connected ? <Unplug size={14} /> : <PlugZap size={14} />} {connected ? 'Disconnect' : connecting ? 'Connecting' : 'Connect'}
                </button>
                <button onClick={() => setMode('edit')}>
                  <Edit3 size={14} /> Edit
                </button>
                <button className="danger-button" onClick={() => remove(selected)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>

              {error && <div className="mcp-error-banner">{error}</div>}

              <div className="mcp-info-grid">
                <div>
                  <span className="mcp-muted-line">Auto-start</span>
                  <strong>{selected.autoStart ? 'Enabled' : 'Disabled'}</strong>
                </div>
                <div>
                  <span className="mcp-muted-line">Environment</span>
                  <EnvSummary server={selected} />
                </div>
              </div>

              {connected ? (
                <MCPToolList tools={tools} resources={resources} resourceTemplates={resourceTemplates} />
              ) : (
                <div className="empty-state compact-empty">
                  <div className="empty-state-inner">
                    <h2>Connect to inspect capabilities.</h2>
                    <p>Tools and resources appear here after a successful extension handshake.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
