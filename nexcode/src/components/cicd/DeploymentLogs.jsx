import { TerminalSquare } from 'lucide-react';

export default function DeploymentLogs({ logs = [] }) {
  return (
    <section className="deploy-log-panel">
      <div className="learning-section-header">
        <strong><TerminalSquare size={14} /> Deployment Logs</strong>
        <span>{logs.length} events</span>
      </div>
      <div className="deploy-log-list">
        {logs.length ? logs.map((log) => (
          <div className={`deploy-log-row ${log.level || 'info'}`} key={log.id || `${log.time}-${log.message}`}>
            <span>{log.time ? new Date(log.time).toLocaleTimeString() : '--:--'}</span>
            <strong>{log.phase || 'system'}</strong>
            <p>{log.message}</p>
          </div>
        )) : <div className="incident-empty">No deployment logs yet.</div>}
      </div>
    </section>
  );
}
