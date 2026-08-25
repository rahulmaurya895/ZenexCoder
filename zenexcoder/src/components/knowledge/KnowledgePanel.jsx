import { Database, RefreshCw, Server, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useKnowledgeStore } from '@/store/knowledgeStore';
import { useMCPStore } from '@/store/mcpStore';
import { useProjectStore } from '@/store/projectStore';
import SemanticSearchBox from './SemanticSearchBox';

function timeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default function KnowledgePanel() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const stats = useKnowledgeStore((state) => state.stats);
  const progress = useKnowledgeStore((state) => state.progress);
  const syncing = useKnowledgeStore((state) => state.syncing);
  const error = useKnowledgeStore((state) => state.error);
  const settings = useKnowledgeStore((state) => state.settings);
  const loadSettings = useKnowledgeStore((state) => state.loadSettings);
  const saveSettings = useKnowledgeStore((state) => state.saveSettings);
  const refreshStats = useKnowledgeStore((state) => state.refreshStats);
  const syncProject = useKnowledgeStore((state) => state.syncProject);
  const servers = useMCPStore((state) => state.servers);
  const connectionStates = useMCPStore((state) => state.connectionStates);
  const loadServers = useMCPStore((state) => state.loadServers);

  useEffect(() => {
    loadSettings().catch(() => {});
    refreshStats().catch(() => {});
    loadServers().catch(() => {});
  }, [loadServers, loadSettings, refreshStats]);

  const percent = progress?.total ? Math.round((progress.current / progress.total) * 100) : syncing ? 8 : 0;

  return (
    <section className="panel knowledge-panel">
      <div className="panel-header">
        <Database size={15} />
        <span className="panel-title">Knowledge Graph</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => refreshStats()} title="Refresh stats">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="panel-body knowledge-body">
        <section className="knowledge-section">
          <div className="knowledge-section-header">
            <div>
              <h3>Local Codebase Sync</h3>
              <p>{projectPath || 'Open a project to start indexing.'}</p>
            </div>
            <button className="primary-button" disabled={!projectPath || syncing} onClick={() => syncProject(projectPath, { force: true })}>
              <Zap size={14} /> Re-index
            </button>
          </div>
          <div className="knowledge-stat-grid">
            <div className="knowledge-stat">
              <span>Files</span>
              <strong>{stats.totalFiles}</strong>
            </div>
            <div className="knowledge-stat">
              <span>Code vectors</span>
              <strong>{stats.codeVectors}</strong>
            </div>
            <div className="knowledge-stat">
              <span>External vectors</span>
              <strong>{stats.externalVectors}</strong>
            </div>
            <div className="knowledge-stat">
              <span>Storage</span>
              <strong>{stats.mode}</strong>
            </div>
          </div>
          {syncing || progress ? (
            <div className="knowledge-progress">
              <div className="knowledge-progress-row">
                <span>{progress?.status || 'Idle'}</span>
                <span>{progress?.total ? `${progress.current}/${progress.total}` : ''}</span>
              </div>
              <div className="knowledge-progress-track">
                <div style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
              </div>
            </div>
          ) : null}
          {error ? <div className="error-text">{error}</div> : null}
          <div className="muted-text">Last synced: {timeAgo(stats.lastSyncAt)}. Embeddings: {stats.embedModel || 'nomic-embed-text'}.</div>
        </section>

        <section className="knowledge-section">
          <div className="knowledge-section-header">
            <div>
              <h3>External Memory (MCP)</h3>
              <p>Connected read-only MCP resources can be embedded when enabled.</p>
            </div>
            <Server size={18} />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.indexExternal}
              onChange={(event) => saveSettings({ indexExternal: event.target.checked })}
            />
            Index External Data
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.autoSync}
              onChange={(event) => saveSettings({ autoSync: event.target.checked })}
            />
            Auto-sync every hour
          </label>
          <div className="mcp-sync-list">
            {servers.length === 0 ? <div className="muted-text">No MCP servers configured.</div> : null}
            {servers.map((server) => (
              <div className="mcp-sync-row" key={server.id}>
                <span>{server.name}</span>
                <strong className={connectionStates[server.id] === 'connected' ? 'step-done' : 'step-pending'}>
                  {connectionStates[server.id] || 'disconnected'}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <SemanticSearchBox />
      </div>
    </section>
  );
}
