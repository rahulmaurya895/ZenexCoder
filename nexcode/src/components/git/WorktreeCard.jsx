import { FolderOpen, Lock, Trash2 } from 'lucide-react';
import { useApprovalAction } from '@/hooks/useApprovalAction';
import { useWorktrees } from '@/hooks/useWorktrees';

/**
 * @param {{worktree: object}} props
 */
export default function WorktreeCard({ worktree }) {
  const { openInNexCode, remove } = useWorktrees();
  const { runWithApproval } = useApprovalAction();

  async function removeWorktree(force = false) {
    if (!window.confirm(`Remove worktree?\n\n${worktree.path}`)) return;
    await runWithApproval(
      {
        actionType: 'git_destructive',
        title: 'Remove Git worktree',
        description: `git worktree remove${force ? ' --force' : ''} ${worktree.path}`
      },
      () => remove(worktree.path, { force })
    );
  }

  return (
    <div className={`worktree-card ${worktree.isMain ? 'main' : ''}`}>
      <div className="worktree-main">
        <div className="worktree-path" title={worktree.path}>
          {worktree.path}
        </div>
        <span className="branch-pill">{worktree.branch || 'detached'}</span>
        {worktree.isLocked && (
          <span className="worktree-lock" title={worktree.lockReason || 'Locked'}>
            <Lock size={13} /> Locked
          </span>
        )}
        {worktree.prunable && <span className="warning-pill">Prunable</span>}
      </div>
      <div className="chat-input-actions">
        <button onClick={() => openInNexCode(worktree.path)} title="Open this worktree in NexCode">
          <FolderOpen size={14} /> Open
        </button>
        {worktree.isMain ? (
          <span className="muted-text">Main worktree</span>
        ) : (
          <>
            {worktree.isLocked && (
              <button className="danger-button" onClick={() => removeWorktree(true)} title="Force remove locked worktree">
                <Trash2 size={14} /> Force Remove
              </button>
            )}
            <button className="danger-button" onClick={() => removeWorktree(false)} title="Remove worktree">
              <Trash2 size={14} /> Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
