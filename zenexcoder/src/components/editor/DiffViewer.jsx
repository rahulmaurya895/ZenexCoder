import { Check, X } from 'lucide-react';
import { makeLineDiff, countChangedLines } from '@/utils/diffUtils';

/**
 * @param {{original: string, updated: string, onApply: () => void, onReject: () => void}} props
 */
export default function DiffViewer({ original, updated, onApply, onReject }) {
  const parts = makeLineDiff(original, updated);
  const changed = countChangedLines(parts);

  return (
    <div>
      <div className="panel-header">
        <span className="panel-title">AI Diff</span>
        <span>{changed} changed lines</span>
        <div className="top-bar-spacer" />
        <button onClick={onApply}>
          <Check size={14} /> Apply All
        </button>
        <button onClick={onApply}>
          <Check size={14} /> Apply Hunk
        </button>
        <button onClick={onReject}>
          <X size={14} /> Reject All
        </button>
      </div>
      <div className="split-view">
        <div className="diff-column">
          <div className="panel-header">Original</div>
          <pre className="diff-code">
            {parts
              .filter((part) => !part.added)
              .map((part) => (
                <span key={part.id} className={part.removed ? 'diff-removed' : ''}>
                  {part.value}
                </span>
              ))}
          </pre>
        </div>
        <div className="diff-column">
          <div className="panel-header">AI Version</div>
          <pre className="diff-code">
            {parts
              .filter((part) => !part.removed)
              .map((part) => (
                <span key={part.id} className={part.added ? 'diff-added' : ''}>
                  {part.value}
                </span>
              ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
