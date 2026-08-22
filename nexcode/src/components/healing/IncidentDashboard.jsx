import { Activity, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useIncidentStore } from '@/store/incidentStore';
import IncidentCard from './IncidentCard';
import IntegrationSettings from './IntegrationSettings';

const HEALED = new Set(['pr_raised', 'healed']);

export default function IncidentDashboard() {
  const incidents = useIncidentStore((state) => state.incidents);
  const loading = useIncidentStore((state) => state.loading);
  const fetching = useIncidentStore((state) => state.fetching);
  const error = useIncidentStore((state) => state.error);
  const load = useIncidentStore((state) => state.load);
  const fetchManual = useIncidentStore((state) => state.fetchManual);
  const startHealing = useIncidentStore((state) => state.startHealing);
  const takeOver = useIncidentStore((state) => state.takeOver);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const [active, healed] = useMemo(() => {
    const activeItems = [];
    const healedItems = [];
    incidents.forEach((incident) => {
      if (HEALED.has(incident.status)) healedItems.push(incident);
      else activeItems.push(incident);
    });
    return [activeItems, healedItems];
  }, [incidents]);

  return (
    <section className="panel healing-panel">
      <div className="panel-header">
        <Activity size={15} />
        <span className="panel-title">Incident Command</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => load()} title="Refresh incidents">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => fetchManual()} disabled={fetching}>
          <RefreshCw size={14} /> {fetching ? 'Polling...' : 'Poll'}
        </button>
      </div>

      <div className="panel-body healing-body">
        <IntegrationSettings />
        {error ? <div className="git-error">{error}</div> : null}

        <div className="incident-columns">
          <section className="incident-column">
            <div className="incident-column-header">
              <div>
                <h2>Active Incidents</h2>
                <span>{active.length} open</span>
              </div>
              <Activity size={18} />
            </div>
            <div className="incident-list">
              {loading ? <div className="muted-text">Loading incidents...</div> : null}
              {!loading && !active.length ? (
                <div className="incident-empty">
                  <ShieldCheck size={22} />
                  <strong>Production is stable.</strong>
                  <span>Zero errors in last 24h.</span>
                </div>
              ) : null}
              {active.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} onStartHealing={startHealing} onTakeOver={takeOver} />
              ))}
            </div>
          </section>

          <section className="incident-column">
            <div className="incident-column-header">
              <div>
                <h2>Healed / PR Raised</h2>
                <span>{healed.length} ready</span>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="incident-list">
              {!healed.length ? <div className="muted-text">No healed incidents yet.</div> : null}
              {healed.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} onStartHealing={startHealing} onTakeOver={takeOver} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
