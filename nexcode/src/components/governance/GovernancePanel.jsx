import { ShieldAlert, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function GovernancePanel() {
  const [logs, setLogs] = useState([]);
  const [policy, setPolicy] = useState({ blockUnsafeCode: true, warnOnSecretDetection: true });

  useEffect(() => {
    window.zenexcoder.audit.getLogs().then(setLogs).catch(() => {});
    window.zenexcoder.policy.getStatus().then(setPolicy).catch(() => {});
  }, []);

  async function toggle(ruleId, enabled) {
    const next = await window.zenexcoder.policy.updateSetting({ ruleId, enabled });
    setPolicy(next);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <ShieldAlert size={16} />
        <span className="panel-title">Governance</span>
      </div>
      <div className="panel-body settings-grid">
        <div className="settings-section">
          <div className="panel-title">Policy</div>
          <label className="settings-row">
            <span>Block Unsafe Code</span>
            <input type="checkbox" checked={policy.blockUnsafeCode !== false} onChange={(event) => toggle('blockUnsafeCode', event.target.checked)} />
          </label>
          <label className="settings-row">
            <span>Warn on Secret Detection</span>
            <input type="checkbox" checked={policy.warnOnSecretDetection !== false} onChange={(event) => toggle('warnOnSecretDetection', event.target.checked)} />
          </label>
        </div>
        <div className="settings-section">
          <div className="panel-title">Audit Log</div>
          <div className="session-list" style={{ maxHeight: 400 }}>
            {logs.slice().reverse().map((entry, index) => (
              <div className="session-item-row" key={`${entry.timestamp}-${index}`}>
                <div className="session-item session-item-main" style={{ cursor: 'default' }}>
                  <FileText size={12} />
                  <span>{entry.action || 'action'}</span>
                </div>
                <div className="muted-text" style={{ padding: '8px 10px' }}>{entry.approval_status || 'n/a'}</div>
              </div>
            ))}
            {!logs.length && <div className="muted-text">No audit entries yet.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}