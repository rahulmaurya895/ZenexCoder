import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { useLearningStore } from '@/store/learningStore';
import LessonCard from './LessonCard';

export default function LearningDashboard() {
  const rules = useLearningStore((state) => state.rules);
  const stats = useLearningStore((state) => state.stats);
  const analysisState = useLearningStore((state) => state.analysisState);
  const loading = useLearningStore((state) => state.loading);
  const error = useLearningStore((state) => state.error);
  const load = useLearningStore((state) => state.load);
  const saveRule = useLearningStore((state) => state.saveRule);
  const deleteRule = useLearningStore((state) => state.deleteRule);
  const triggerAnalysis = useLearningStore((state) => state.triggerAnalysis);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const max = Math.max(stats.autoFixed, stats.humanInterventions, stats.shared, 1);

  return (
    <section className="panel learning-panel">
      <div className="panel-header">
        <BrainCircuit size={16} />
        <span className="panel-title">Self-Learning Engine</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => load()} title="Refresh learned rules">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => triggerAnalysis()} disabled={loading}>
          <Sparkles size={14} /> Analyze Logs
        </button>
      </div>
      <div className="panel-body learning-body">
        {error ? <div className="git-error">{error}</div> : null}
        <section className="learning-stats-grid">
          <div>
            <span>Total learned rules</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span>Errors fixed automatically</span>
            <strong>{stats.autoFixed}</strong>
            <div className="learning-bar"><i style={{ width: `${(stats.autoFixed / max) * 100}%` }} /></div>
          </div>
          <div>
            <span>Human interventions</span>
            <strong>{stats.humanInterventions}</strong>
            <div className="learning-bar warning"><i style={{ width: `${(stats.humanInterventions / max) * 100}%` }} /></div>
          </div>
          <div>
            <span>Shared lessons</span>
            <strong>{stats.shared}</strong>
            <div className="learning-bar success"><i style={{ width: `${(stats.shared / max) * 100}%` }} /></div>
          </div>
        </section>

        <section className="learning-analysis-row">
          <span>Last analysis: {analysisState.analyzedAt ? new Date(analysisState.analyzedAt).toLocaleString() : 'Pending'}</span>
          <span>Scanned approvals: {analysisState.scannedApprovals || 0}</span>
          <span>Scanned changes: {analysisState.scannedChanges || 0}</span>
          <span>New rules: {analysisState.rulesCreated || 0}</span>
        </section>

        <section className="learning-rules-list">
          {rules.length ? (
            rules.map((rule) => (
              <LessonCard key={rule.id} rule={rule} onSave={saveRule} onDelete={deleteRule} />
            ))
          ) : (
            <div className="incident-empty">
              <BrainCircuit size={24} />
              <strong>No learned rules yet.</strong>
              <span>Rejected approvals and reverted changes will become rules after three matching failures.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
