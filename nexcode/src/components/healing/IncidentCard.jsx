import { AlertTriangle, CheckCircle2, Circle, ExternalLink, GitPullRequest, Hand, Loader2, Play, ShieldAlert } from 'lucide-react';

const STEPS = [
  { id: 'fetch_error', label: 'Fetch Error' },
  { id: 'create_worktree', label: 'Create Worktree' },
  { id: 'swarm', label: 'Swarm Analyzing' },
  { id: 'write_tests', label: 'Writing Tests' },
  { id: 'pr', label: 'PR Raised' }
];

const DONE_STATUSES = new Set(['done', 'blocked']);
const RUNNING_STATUSES = new Set(['running', 'retry']);

function latestLog(incident, step) {
  return [...(incident.healingLog || [])].reverse().find((entry) => entry.step === step);
}

function stepState(incident, step) {
  const log = latestLog(incident, step.id);
  if (log?.status === 'failed') return 'failed';
  if (RUNNING_STATUSES.has(log?.status)) return 'running';
  if (DONE_STATUSES.has(log?.status)) return log.status === 'blocked' ? 'blocked' : 'done';
  if (step.id === 'fetch_error' && incident.createdAt) return 'done';
  if (step.id === 'create_worktree' && incident.worktreePath) return 'done';
  if (step.id === 'pr' && incident.prUrl) return 'done';
  if (step.id === 'pr' && incident.status === 'awaiting_pr_credentials') return 'blocked';
  if (step.id === 'swarm' && incident.status === 'swarm_running') return 'running';
  if (step.id === 'write_tests' && incident.status === 'testing') return 'running';
  return 'pending';
}

function StepIcon({ state }) {
  if (state === 'done') return <CheckCircle2 size={14} className="step-done" />;
  if (state === 'running') return <Loader2 size={14} className="spin step-pending" />;
  if (state === 'failed') return <AlertTriangle size={14} className="step-failed" />;
  if (state === 'blocked') return <AlertTriangle size={14} className="step-pending" />;
  return <Circle size={14} className="step-pending" />;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}

function statusLabel(status = '') {
  return status.replaceAll('_', ' ') || 'fetched';
}

export default function IncidentCard({ incident, onStartHealing, onTakeOver }) {
  const stackTrace = incident.stackTrace || 'No stack trace captured.';
  const active = ['healing', 'worktree_ready', 'swarm_running', 'testing', 'committed', 'awaiting_pr'].includes(incident.status);
  const canStart = !active && !['pr_raised'].includes(incident.status);

  return (
    <article className={`incident-card ${incident.status === 'manual_required' ? 'needs-review' : ''}`}>
      <div className="incident-card-header">
        <div className="incident-title-wrap">
          <ShieldAlert size={16} />
          <div>
            <h3>{incident.title}</h3>
            <div className="muted-text">
              {incident.provider} · {incident.externalId || incident.id} · {formatTime(incident.lastSeen || incident.createdAt)}
            </div>
          </div>
        </div>
        <span className={`incident-status status-${incident.status || 'fetched'}`}>{statusLabel(incident.status)}</span>
      </div>

      <pre className="incident-stack">{stackTrace}</pre>

      <div className="incident-tracker">
        {STEPS.map((step) => {
          const state = stepState(incident, step);
          return (
            <div className={`incident-step ${state}`} key={step.id}>
              <StepIcon state={state} />
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      {(incident.healingLog || []).length ? (
        <div className="incident-log">
          {(incident.healingLog || []).slice(-3).map((entry) => (
            <div key={`${entry.step}-${entry.timestamp}`}>
              <span>{entry.step}</span>
              <strong>{entry.message}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className="incident-actions">
        {incident.url ? (
          <button type="button" onClick={() => window.zenexcoder.app.openExternal(incident.url)}>
            <ExternalLink size={14} /> View on Sentry
          </button>
        ) : null}
        {incident.prUrl ? (
          <button type="button" className="primary-button" onClick={() => window.zenexcoder.app.openExternal(incident.prUrl)}>
            <GitPullRequest size={14} /> View PR
          </button>
        ) : null}
        {canStart ? (
          <button type="button" onClick={() => onStartHealing(incident.id)}>
            <Play size={14} /> Start Healing
          </button>
        ) : null}
        <button type="button" onClick={() => onTakeOver(incident.id)}>
          <Hand size={14} /> Take Over Manually
        </button>
      </div>
    </article>
  );
}
