import { Radio, RefreshCw, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useCollaborationStore } from '@/store/collaborationStore';
import { useLearningStore } from '@/store/learningStore';
import E2EEStatus from './E2EEStatus';
import SharedRuleTable from './SharedRuleTable';

export default function TeamDashboard() {
  const peers = useCollaborationStore((state) => state.peers);
  const status = useCollaborationStore((state) => state.status);
  const vault = useCollaborationStore((state) => state.vault);
  const connected = useCollaborationStore((state) => state.connected);
  const loading = useCollaborationStore((state) => state.loading);
  const error = useCollaborationStore((state) => state.error);
  const loadCollab = useCollaborationStore((state) => state.load);
  const connect = useCollaborationStore((state) => state.connect);
  const disconnect = useCollaborationStore((state) => state.disconnect);
  const setVaultSecret = useCollaborationStore((state) => state.setVaultSecret);
  const syncRules = useCollaborationStore((state) => state.syncRules);
  const muteOrigin = useCollaborationStore((state) => state.muteOrigin);
  const rules = useLearningStore((state) => state.rules);
  const loadRules = useLearningStore((state) => state.load);

  useEffect(() => {
    loadCollab().catch(() => {});
    loadRules().catch(() => {});
  }, [loadCollab, loadRules]);

  return (
    <section className="panel team-panel">
      <div className="panel-header">
        <Users size={16} />
        <span className="panel-title">Collaborative Intelligence</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => { loadCollab(); loadRules(); }} title="Refresh team sync">
          <RefreshCw size={14} />
        </button>
        <button className={connected ? '' : 'primary-button'} onClick={() => (connected ? disconnect() : connect())} disabled={loading}>
          <Radio size={14} /> {connected ? 'Disconnect' : 'Join Sync'}
        </button>
      </div>
      <div className="panel-body team-body">
        {error ? <div className="git-error">{error}</div> : null}
        <E2EEStatus vault={vault} status={status} onSetSecret={setVaultSecret} />

        <section className="team-grid">
          <div className="team-column">
            <div className="learning-section-header">
              <strong>Active Teammates</strong>
              <span className={`computer-status ${connected ? 'active' : ''}`}>{connected ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="peer-list">
              {peers.length ? peers.map((peer) => (
                <article className={`peer-card ${peer.muted ? 'muted' : ''}`} key={peer.nodeId || peer.userId}>
                  <div className="peer-avatar">{(peer.name || peer.hostname || 'T').slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{peer.name || peer.hostname}</strong>
                    <span>{peer.status || 'Idle'}{peer.file ? ` in ${peer.file.split(/[\\/]/).pop()}` : ''}</span>
                  </div>
                </article>
              )) : <div className="incident-empty">No paired teammates online.</div>}
            </div>
          </div>

          <SharedRuleTable rules={rules} peers={peers} onMuteOrigin={muteOrigin} onSync={syncRules} />
        </section>
      </div>
    </section>
  );
}
