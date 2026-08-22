import { BellOff, RefreshCw } from 'lucide-react';

export default function SharedRuleTable({ rules, peers, onMuteOrigin, onSync }) {
  const peerName = (nodeId) => peers.find((peer) => peer.nodeId === nodeId || peer.userId === nodeId)?.name || 'Local';

  return (
    <section className="shared-rule-table">
      <div className="learning-section-header">
        <strong>Shared Knowledge Rules</strong>
        <button onClick={onSync}>
          <RefreshCw size={14} /> Sync Now
        </button>
      </div>
      <div className="shared-rule-head">
        <span>Rule</span>
        <span>Origin</span>
        <span>Source</span>
        <span />
      </div>
      {rules.map((rule) => (
        <div className={`shared-rule-row ${rule.conflict ? 'conflict' : ''}`} key={rule.id}>
          <span title={rule.trigger}>{rule.trigger}</span>
          <span>{peerName(rule.originNodeId)}</span>
          <span>{rule.source === 'shared' ? 'Shared' : 'Local'}</span>
          <button className="icon-button" title="Mute teammate" disabled={rule.originNodeId === 'local'} onClick={() => onMuteOrigin(rule.originNodeId, true)}>
            <BellOff size={14} />
          </button>
        </div>
      ))}
      {!rules.length ? <div className="muted-text">No local or shared rules available yet.</div> : null}
    </section>
  );
}
