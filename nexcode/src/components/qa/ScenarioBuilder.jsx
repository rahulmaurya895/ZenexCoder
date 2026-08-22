import { FlaskConical, Play, Square, Wand2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQaStore } from '@/store/qaStore';
import TestReportPanel from './TestReportPanel';

export default function ScenarioBuilder() {
  const state = useQaStore();
  const steps = state.parsedSteps();

  useEffect(() => {
    const disposers = [
      window.zenexcoder.qa.onStreamLogs((payload) => state.applyLog(payload)),
      window.zenexcoder.qa.onScreenshotCapture((payload) => state.applyScreenshot(payload)),
      window.zenexcoder.qa.onResultFinal((payload) => state.applyResult(payload))
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, []);

  return (
    <section className="panel qa-panel">
      <div className="panel-header">
        <FlaskConical size={16} />
        <span className="panel-title">Synthetic QA</span>
        <div className="top-bar-spacer" />
        <button onClick={() => state.stop()} disabled={!state.active}>
          <Square size={14} /> Stop
        </button>
        <button className="primary-button" onClick={() => state.runScenario()} disabled={state.active}>
          <Play size={14} /> Run Scenario
        </button>
      </div>
      <div className="panel-body qa-body">
        {state.error ? <div className="git-error">{state.error}</div> : null}
        <section className="qa-builder-grid">
          <div className="scenario-editor">
            <div className="learning-section-header">
              <strong><Wand2 size={14} /> Scenario Builder</strong>
              <span>{steps.length} steps</span>
            </div>
            <div className="qa-controls">
              <label>
                <span>Persona</span>
                <select value={state.persona} onChange={(event) => state.setField('persona', event.target.value)}>
                  <option value="normal">Normal User</option>
                  <option value="chaos">Chaos Monkey</option>
                </select>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={state.allowProduction} onChange={(event) => state.setField('allowProduction', event.target.checked)} />
                <span>Allow production URLs</span>
              </label>
            </div>
            <textarea
              className="scenario-textarea"
              value={state.scenarioText}
              onChange={(event) => state.setField('scenarioText', event.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="scenario-steps">
            <div className="learning-section-header">
              <strong>Parsed Steps</strong>
              <span>{state.active ? 'running' : 'ready'}</span>
            </div>
            {steps.length ? steps.map((step) => (
              <article className="scenario-step" key={step.id}>
                <strong>{step.action}</strong>
                <span>{step.url || step.selector || step.text || step.name}</span>
              </article>
            )) : <div className="incident-empty">Add scenario steps to begin.</div>}
          </div>
        </section>
        <TestReportPanel result={state.result} logs={state.logs} screenshots={state.screenshots} />
      </div>
    </section>
  );
}
