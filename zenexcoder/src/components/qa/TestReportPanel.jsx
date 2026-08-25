import { Camera, CheckCircle2, XCircle } from 'lucide-react';

export default function TestReportPanel({ result, logs = [], screenshots = [] }) {
  return (
    <section className="qa-report">
      <div className="learning-section-header">
        <strong>{result?.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} Test Report</strong>
        <span>{result ? `${result.passed || 0}/${result.total || 0} passed` : 'Pending'}</span>
      </div>
      <div className="qa-report-grid">
        <div className="deploy-log-list">
          {logs.length ? logs.map((log) => (
            <div className={`deploy-log-row ${log.level || 'info'}`} key={log.id || `${log.time}-${log.message}`}>
              <span>{log.time ? new Date(log.time).toLocaleTimeString() : '--:--'}</span>
              <strong>{log.step || 'qa'}</strong>
              <p>{log.message}</p>
            </div>
          )) : <div className="incident-empty">No QA logs yet.</div>}
        </div>
        <div className="qa-screenshot-list">
          {screenshots.length ? screenshots.map((shot) => (
            <article key={shot.id || shot.name} className="qa-shot">
              <div>
                <Camera size={14} />
                <strong>{shot.name}</strong>
                <span>{shot.diff?.status || 'captured'}</span>
              </div>
              {shot.base64Image ? <img src={`data:image/png;base64,${shot.base64Image}`} alt={shot.name} /> : null}
              {shot.diff?.diffBase64 ? <img src={`data:image/png;base64,${shot.diff.diffBase64}`} alt={`${shot.name} diff`} /> : null}
            </article>
          )) : <div className="incident-empty">Screenshots will appear here.</div>}
        </div>
      </div>
    </section>
  );
}
