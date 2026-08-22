import { CheckCircle2, Circle, CircleDashed, Edit3, Globe, MonitorPlay, PauseCircle, Server, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useAgentRun } from '@/hooks/useAgentRun';
import PlanCard from './PlanCard';
import ReviewButton from '@/components/review/ReviewButton';

function StepIcon({ status, actionType }) {
  if (actionType === 'mcp_tool_call') return <Server className={status === 'failed' ? 'step-failed' : status === 'done' ? 'step-done' : 'step-pending'} size={16} />;
  if (['browser_read', 'browser_interact'].includes(actionType)) return <Globe className={status === 'failed' ? 'step-failed' : status === 'done' ? 'step-done' : 'step-pending'} size={16} />;
  if (['computer_screenshot', 'computer_interact'].includes(actionType)) return <MonitorPlay className={status === 'failed' ? 'step-failed' : status === 'done' ? 'step-done' : 'step-pending'} size={16} />;
  if (status === 'done') return <CheckCircle2 className="step-done" size={16} />;
  if (status === 'failed') return <XCircle className="step-failed" size={16} />;
  if (status === 'paused') return <PauseCircle className="step-paused" size={16} />;
  if (status === 'skipped') return <CircleDashed className="step-skipped" size={16} />;
  if (status === 'running') return <span className="spinner" />;
  return <Circle className="step-pending" size={16} />;
}

export default function ProgressTracker() {
  const { plan, runState, editStep, completedAt, startedAt } = useAgentRun();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const changedFiles = new Set(plan.steps.flatMap((step) => step.files || []));
  const commandsRun = plan.steps.filter((step) => step.command).length;

  return (
    <div className="progress-tracker">
      <PlanCard />
      <div className="step-list">
        {plan.steps.map((step) => (
          <div className={`step-card ${step.status}`} key={step.id}>
            <div className="step-row">
              <StepIcon status={step.status} actionType={step.actionType} />
              <div className="step-main">
                <strong>{step.title}</strong>
                {editingId === step.id ? (
                  <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} />
                ) : (
                  <div>{step.description}</div>
                )}
              </div>
              {step.status === 'pending' && (
                <button
                  className="icon-button"
                  onClick={() => {
                    if (editingId === step.id) {
                      editStep(step.id, { description: draft });
                      setEditingId(null);
                    } else {
                      setDraft(step.description);
                      setEditingId(step.id);
                    }
                  }}
                  title="Edit step"
                >
                  <Edit3 size={14} />
                </button>
              )}
            </div>
            {(step.output || step.files?.length || step.durationMs || step.mcp || step.browser || step.computer) && (
              <details>
                <summary>Details</summary>
                {step.files?.length ? <div>Files: {step.files.join(', ')}</div> : null}
                {step.durationMs ? <div>Duration: {(step.durationMs / 1000).toFixed(1)}s</div> : null}
                {step.mcp ? (
                  <>
                    <div>Server: {step.mcp.serverName || step.mcp.serverId}</div>
                    <div>Tool: {step.mcp.toolName}</div>
                    <pre className="approval-json-block">{JSON.stringify(step.mcp.args || {}, null, 2)}</pre>
                  </>
                ) : null}
                {step.browser ? (
                  <>
                    <div>URL: {step.browser.url || 'Current page'}</div>
                    <div>Tool: {step.browser.toolName}</div>
                    <pre className="approval-json-block">{JSON.stringify(step.browser.args || {}, null, 2)}</pre>
                  </>
                ) : null}
                {step.computer ? (
                  <>
                    <div>Tool: {step.computer.toolName}</div>
                    <pre className="approval-json-block">{JSON.stringify(step.computer.args || {}, null, 2)}</pre>
                  </>
                ) : null}
                {step.output ? <pre className="diff-code">{step.output}</pre> : null}
                {step.files?.length ? <ReviewButton sourceId={step.id} /> : null}
              </details>
            )}
          </div>
        ))}
      </div>
      {runState === 'completed' && (
        <div className="plan-card">
          Completed in {startedAt && completedAt ? `${Math.round((completedAt - startedAt) / 1000)}s` : 'this session'}.
          {' '}{changedFiles.size} files changed, {commandsRun} commands run. <ReviewButton />
        </div>
      )}
    </div>
  );
}
