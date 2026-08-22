import { Flame, ShieldAlert, CheckCircle2, Play, AlertTriangle, ShieldCheck, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ChaosMonitor() {
  const [logs, setLogs] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (window.zenexcoder?.chaos) {
      window.zenexcoder.chaos.getLogs().then((res) => {
        if (res) {
          setLogs(res.logs || []);
          setActiveRuns(res.activeRuns || []);
        }
      });

      const unbindStatus = window.zenexcoder.chaos.onStatusChanged((data) => {
        if (data?.testRun) {
          setActiveRuns((prev) => {
            const index = prev.findIndex((r) => r.testId === data.testRun.testId);
            if (index >= 0) {
              const copy = [...prev];
              copy[index] = data.testRun;
              return copy;
            }
            return [data.testRun, ...prev];
          });
        }
      });

      const unbindLog = window.zenexcoder.chaos.onLog((logEntry) => {
        setLogs((prev) => [logEntry, ...prev.slice(0, 49)]);
      });

      return () => {
        unbindStatus?.();
        unbindLog?.();
      };
    }
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'crashed') return log.crashed;
    if (filter === 'passed') return !log.crashed;
    return true;
  });

  return (
    <div className="settings-section chaos-monitor-panel chaos-red-theme">
      <div className="panel-title flex-align gap-2 text-danger font-bold">
        <Flame size={20} className="text-danger animate-pulse" /> Proactive Chaos Engineering Red-Team
      </div>
      <p className="section-description">
        Continuous background stress testing operating inside the isolated Windows Sandbox. Discovers null pointers, OOM memory leaks, and input injection flaws before code deployment.
      </p>

      {/* Active Runs Summary */}
      <div className="chaos-active-runs mb-3">
        <div className="font-bold text-xs uppercase tracking-wider mb-2 text-danger flex-align gap-1">
          <Terminal size={14} /> Sandbox Isolated Execution Runs
        </div>
        {activeRuns.length === 0 ? (
          <div className="text-xs text-subtle italic p-2 border-danger-subtle rounded">
            No active chaos runs. Save any editor file to trigger instant background Sandbox stress tests.
          </div>
        ) : (
          <div className="space-y-2">
            {activeRuns.map((run) => (
              <div key={run.testId} className={`chaos-run-card ${run.status}`}>
                <div className="flex-between font-mono text-xs">
                  <span className="font-bold">{run.fileName}</span>
                  <span className={`badge ${run.status}`}>
                    {run.status === 'running' && '⚡ STRESS TESTING IN SANDBOX'}
                    {run.status === 'vulnerable' && '⚠️ VULNERABILITY FOUND'}
                    {run.status === 'passed' && '✓ RESILIENT'}
                  </span>
                </div>
                {run.crashes?.length > 0 && (
                  <div className="mt-2 text-xs bg-dark-red p-2 rounded text-red-200">
                    <div className="font-bold mb-1 flex-align gap-1">
                      <AlertTriangle size={12} /> Suggested Preemptive Patch:
                    </div>
                    <pre className="font-mono text-xs overflow-x-auto p-1 bg-black-50 rounded">
                      {run.crashes[0].suggestedPatch}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters & Attack Stream Log */}
      <div className="chaos-log-section">
        <div className="flex-between mb-2">
          <span className="font-bold text-xs uppercase text-subtle">Attack Simulation Feed</span>
          <div className="flex-align gap-1">
            <button
              className={`chip-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({logs.length})
            </button>
            <button
              className={`chip-btn ${filter === 'crashed' ? 'active-danger' : ''}`}
              onClick={() => setFilter('crashed')}
            >
              Crashes ({logs.filter((l) => l.crashed).length})
            </button>
            <button
              className={`chip-btn ${filter === 'passed' ? 'active-success' : ''}`}
              onClick={() => setFilter('passed')}
            >
              Passed ({logs.filter((l) => !l.crashed).length})
            </button>
          </div>
        </div>

        <div className="chaos-log-list space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center p-4 text-subtle italic">No stress attack logs captured yet.</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className={`chaos-log-item ${log.crashed ? 'crashed' : 'passed'}`}>
                <div className="flex-between">
                  <span className="font-bold text-danger flex-align gap-1">
                    {log.crashed ? <ShieldAlert size={14} /> : <ShieldCheck size={14} className="text-success" />}
                    {log.vectorType}
                  </span>
                  <span className="text-subtle text-xs">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-subtle mt-1">{log.command}</div>
                {log.crashed && (
                  <div className="chaos-stack-trace mt-1 p-1 rounded">
                    {log.output?.slice(0, 300)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
