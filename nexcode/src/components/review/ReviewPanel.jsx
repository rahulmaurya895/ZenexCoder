import { Check, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import DiffViewer from '@/components/editor/DiffViewer';

/**
 * @param {{records?: Array<object>, onChange?: () => void}} props
 */
export default function ReviewPanel({ records: providedRecords, onChange }) {
  const [records, setRecords] = useState(providedRecords || []);
  const [activeId, setActiveId] = useState(providedRecords?.[0]?.id || null);

  async function load() {
    if (providedRecords) {
      setRecords(providedRecords);
      setActiveId((current) => current || providedRecords[0]?.id || null);
      return;
    }
    const list = await window.zenexcoder.review.list('pending_review');
    setRecords(list);
    setActiveId((current) => current || list[0]?.id || null);
  }

  useEffect(() => {
    load().catch(() => {});
  }, [providedRecords]);

  const active = records.find((item) => item.id === activeId) || records[0];

  async function action(record, nextAction) {
    await window.zenexcoder.review.action({ id: record.id, action: nextAction });
    await load();
    onChange?.();
  }

  if (!records.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-inner">
          <h2>No pending changes</h2>
          <p>AI file edits that need review will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="review-panel">
      <div className="review-list">
        {records.map((record) => (
          <button
            key={record.id}
            className={record.id === active?.id ? 'active' : ''}
            onClick={() => setActiveId(record.id)}
            title={record.filePath}
          >
            {record.filePath.split(/[\\/]/).pop()}
          </button>
        ))}
      </div>
      {active && (
        <div className="review-detail">
          <div className="panel-header">
            <span className="panel-title">{active.filePath}</span>
            <div className="top-bar-spacer" />
            <button onClick={() => action(active, 'apply')}>
              <Check size={14} /> Apply All
            </button>
            <button onClick={() => action(active, 'mark_reviewed')}>Mark Reviewed</button>
            <button className="danger-button" onClick={() => action(active, 'reject')}>
              <X size={14} /> Reject All
            </button>
            <button onClick={() => action(active, 'revert')}>
              <RotateCcw size={14} /> Revert
            </button>
          </div>
          {active.explanation && <div className="review-explanation">{active.explanation}</div>}
          <DiffViewer original={active.beforeContent || ''} updated={active.afterContent || ''} onApply={() => action(active, 'apply')} onReject={() => action(active, 'reject')} />
        </div>
      )}
    </div>
  );
}
