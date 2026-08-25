import { GitMerge, X } from 'lucide-react';
import { useState } from 'react';

/**
 * @param {{sourceBranch: string, currentBranch: string, onConfirm: () => Promise<object>, onClose: () => void}} props
 */
export default function MergeDialog({ sourceBranch, currentBranch, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function confirm() {
    setBusy(true);
    try {
      const next = await onConfirm();
      setResult(next);
      if (next?.ok && !next?.conflict) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="merge-dialog">
      <div className="panel-header">
        <GitMerge size={16} />
        <span className="panel-title">Merge branch</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={onClose} title="Close merge dialog">
          <X size={14} />
        </button>
      </div>
      <p>
        Merge <strong>{sourceBranch}</strong> into <strong>{currentBranch || 'current branch'}</strong>?
      </p>
      {result?.conflict && (
        <div className="merge-conflict">
          <strong>Merge aborted due to conflicts in {result.files?.length || 0} files.</strong>
          <p>Resolve manually in the editor, or try a different branch.</p>
          <ul>
            {(result.files || []).map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="chat-input-actions">
        <button className="primary-button" onClick={confirm} disabled={busy}>
          <GitMerge size={14} /> {busy ? 'Merging...' : 'Confirm merge'}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
