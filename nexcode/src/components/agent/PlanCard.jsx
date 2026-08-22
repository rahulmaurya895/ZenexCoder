import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useAgentRun } from '@/hooks/useAgentRun';

export default function PlanCard() {
  const { plan, runState, pause, resume, stop, skipStep } = useAgentRun();
  const done = plan.steps.filter((step) => ['done', 'skipped'].includes(step.status)).length;
  const percent = plan.steps.length ? Math.round((done / plan.steps.length) * 100) : 0;
  const current = Math.min(plan.steps.length, Math.max(1, plan.currentStepIndex + 1));

  if (!plan.steps.length) {
    return (
      <div className="plan-card">
        <div className="panel-title">No active plan</div>
        <p>Agent plans and approvals will appear here when a task starts.</p>
      </div>
    );
  }

  return (
    <div className="plan-card">
      <div className="panel-title">{plan.title || 'Agent Plan'}</div>
      <div>Step {current} of {plan.steps.length} - {percent}%</div>
      <div className="progress" style={{ '--progress': `${percent}%` }}>
        <span />
      </div>
      <div className="chat-input-actions">
        {runState === 'paused' ? (
          <button onClick={resume}>
            <Play size={14} /> Resume
          </button>
        ) : (
          <button onClick={pause} disabled={runState !== 'running'}>
            <Pause size={14} /> Pause
          </button>
        )}
        <button onClick={stop} disabled={!['running', 'paused'].includes(runState)}>
          <Square size={14} /> Stop
        </button>
        <button onClick={() => skipStep(plan.steps[plan.currentStepIndex]?.id)} disabled={!plan.steps[plan.currentStepIndex]}>
          <SkipForward size={14} /> Skip Step
        </button>
      </div>
    </div>
  );
}
