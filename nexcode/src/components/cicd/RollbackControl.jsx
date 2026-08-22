import { RotateCcw, ShieldAlert } from 'lucide-react';

export default function RollbackControl({ deployment, loading, onRollback }) {
  const canRollback = Boolean(deployment && ['deployed', 'monitoring', 'failed', 'unhealthy'].includes(deployment.status));
  return (
    <section className="rollback-control">
      <div>
        <strong><ShieldAlert size={15} /> Rollback Control</strong>
        <span>{deployment?.rollbackRef ? `Previous ref ${deployment.rollbackRef.slice(0, 10)}` : 'Rollback metadata is captured before live deploy.'}</span>
      </div>
      <button className="danger-button" disabled={!canRollback || loading} onClick={onRollback}>
        <RotateCcw size={14} /> Rollback
      </button>
    </section>
  );
}
