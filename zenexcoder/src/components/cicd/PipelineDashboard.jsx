import { Cloud, FileCode2, Play, RefreshCw, Rocket, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { usePipelineStore } from '@/store/pipelineStore';
import DeploymentLogs from './DeploymentLogs';
import RollbackControl from './RollbackControl';

function statusClass(status = 'idle') {
  if (['deployed', 'monitoring', 'healthy', 'success'].includes(status)) return 'green';
  if (['running', 'testing', 'building', 'deploying', 'rollback'].includes(status)) return 'amber';
  if (['failed', 'unhealthy', 'blocked'].includes(status)) return 'red';
  return 'off';
}

export default function PipelineDashboard() {
  const state = usePipelineStore();

  useEffect(() => {
    state.load().catch(() => {});
    const disposers = [
      window.zezenexcoderr.cicd.onStatusUpdate((payload) => state.applyStatus(payload)),
      window.zezenexcoderr.cicd.onLogsStream((payload) => state.applyLog(payload))
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, []);

  const liveDeploy = !state.dryRun || state.target === 'production';
  const approvalNeeded = liveDeploy && !state.approved;

  return (
    <section className="panel cicd-panel">
      <div className="panel-header">
        <Rocket size={16} />
        <span className="panel-title">CI/CD Autopilot</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => state.load()} title="Refresh pipeline">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => state.generateIaC()} disabled={state.loading}>
          <FileCode2 size={14} /> Generate IaC
        </button>
        <button className="primary-button" onClick={() => state.startDeploy()} disabled={state.loading || approvalNeeded}>
          <Play size={14} /> {state.dryRun ? 'Dry Run' : 'Deploy'}
        </button>
      </div>
      <div className="panel-body cicd-body">
        {state.error ? <div className="git-error">{state.error}</div> : null}

        <section className="pipeline-hero">
          <div className={`traffic-light ${statusClass(state.status)}`}>
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>{state.status.toUpperCase()}</strong>
            <span>{state.phase}</span>
          </div>
          <div className="pipeline-stat">
            <span>Provider</span>
            <strong>{state.provider.toUpperCase()}</strong>
          </div>
          <div className="pipeline-stat">
            <span>Mode</span>
            <strong>{state.dryRun ? 'DRY RUN' : state.target.toUpperCase()}</strong>
          </div>
          <div className="pipeline-stat">
            <span>Health</span>
            <strong>{state.deployment?.health?.status || 'pending'}</strong>
          </div>
          <div className="pipeline-stat">
            <span>Last Success</span>
            <strong>
              {state.deployment?.lastSuccessfulAt
                ? new Date(state.deployment.lastSuccessfulAt).toLocaleTimeString()
                : 'pending'}
            </strong>
          </div>
        </section>

        <section className="pipeline-grid">
          <div className="pipeline-config">
            <label>
              <span>Cloud Provider</span>
              <select value={state.provider} onChange={(event) => state.setField('provider', event.target.value)}>
                <option value="vercel">Vercel</option>
                <option value="aws">AWS</option>
                <option value="gcp">GCP</option>
              </select>
            </label>
            <label>
              <span>Target</span>
              <select value={state.target} onChange={(event) => state.setField('target', event.target.value)}>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
            </label>
            <label>
              <span>Health URL</span>
              <input value={state.healthUrl} onChange={(event) => state.setField('healthUrl', event.target.value)} placeholder="http://localhost:3000/health" />
            </label>
            <label>
              <span>Test Command</span>
              <input value={state.testCommand} onChange={(event) => state.setField('testCommand', event.target.value)} placeholder="pnpm test" />
            </label>
            <label>
              <span>Build Command</span>
              <input value={state.buildCommand} onChange={(event) => state.setField('buildCommand', event.target.value)} placeholder="pnpm run build" />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={state.dryRun} onChange={(event) => state.setField('dryRun', event.target.checked)} />
              <span>Dry-run mode</span>
            </label>
            <label className={`check-row ${approvalNeeded ? 'needs-approval' : ''}`}>
              <input type="checkbox" checked={state.approved} onChange={(event) => state.setField('approved', event.target.checked)} />
              <span><ShieldCheck size={14} /> Approve live or production deployment</span>
            </label>
          </div>

          <div className="iac-preview">
            <div className="learning-section-header">
              <strong><Cloud size={14} /> Generated Infrastructure</strong>
              <span>{state.iac?.files?.length || 0} files</span>
            </div>
            {state.iac ? (
              <div className="iac-file-list">
                {state.iac.files.map((file) => (
                  <div key={file.fileName}>
                    <strong>{file.fileName}</strong>
                    <pre>{file.content.slice(0, 700)}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="incident-empty">Generate IaC to preview files in .zezenexcoderr/deploy.</div>
            )}
          </div>
        </section>

        <RollbackControl deployment={state.deployment} loading={state.loading} onRollback={() => state.rollback()} />
        <DeploymentLogs logs={state.logs} />
      </div>
    </section>
  );
}
