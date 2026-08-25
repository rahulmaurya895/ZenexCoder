import { FolderPlus, GitBranch, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGit } from '@/hooks/useGit';
import { useWorktrees } from '@/hooks/useWorktrees';
import WorktreeCard from './WorktreeCard';

export default function WorktreePanel() {
  const { branches } = useGit();
  const { worktrees, loading, error, refresh, add, prune } = useWorktrees();
  const [newPath, setNewPath] = useState('');
  const [branchName, setBranchName] = useState('');
  const [createBranch, setCreateBranch] = useState(true);
  const [fromRef, setFromRef] = useState('HEAD');
  const [busy, setBusy] = useState(false);
  const refs = useMemo(() => ['HEAD', ...(branches.local || []), ...(branches.remote || [])], [branches]);
  const branchOptions = useMemo(() => [...(branches.local || []), ...(branches.remote || [])], [branches]);

  async function pickFolder() {
    const folder = await window.zezenexcoderr.folder.openDialog();
    if (folder) setNewPath(folder);
  }

  async function submit(event) {
    event.preventDefault();
    if (!newPath.trim() || !branchName.trim()) return;
    setBusy(true);
    try {
      await add({ newPath: newPath.trim(), branchName: branchName.trim(), createBranch, fromRef });
      setNewPath('');
      setBranchName('');
      await window.zezenexcoderr.notify.show({ title: 'Git worktree', body: 'Worktree created.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="worktree-panel">
      <div className="git-section-header">
        <div>
          <div className="panel-title">Worktrees</div>
          <div className="muted-text">Manage linked working directories for this repo.</div>
        </div>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => refresh()} title="Refresh worktrees">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => prune()} title="Prune stale worktree metadata">
          Prune
        </button>
      </div>

      <form className="worktree-form" onSubmit={submit}>
        <div className="form-row">
          <label>Path</label>
          <div className="chat-input-actions">
            <input value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="D:\\path\\to\\worktree" />
            <button type="button" onClick={pickFolder}>
              <FolderPlus size={14} /> Pick
            </button>
          </div>
        </div>
        <div className="form-row">
          <label>Branch</label>
          <div className="chat-input-actions">
            {createBranch ? (
              <input value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="feature/my-work" />
            ) : (
              <select value={branchName} onChange={(event) => setBranchName(event.target.value)}>
                <option value="">Select branch</option>
                {branchOptions.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            )}
            <label className="check-row compact">
              <input type="checkbox" checked={createBranch} onChange={(event) => setCreateBranch(event.target.checked)} />
              Create new
            </label>
          </div>
        </div>
        {createBranch && (
          <div className="form-row">
            <label>From</label>
            <select value={fromRef} onChange={(event) => setFromRef(event.target.value)}>
              {refs.map((ref) => (
                <option key={ref} value={ref}>
                  {ref}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="primary-button" type="submit" disabled={busy || !newPath.trim() || !branchName.trim()}>
          <GitBranch size={14} /> {busy ? 'Adding...' : 'Add worktree'}
        </button>
      </form>

      {error && <div className="git-error">{error}</div>}
      {loading && <div className="muted-text">Refreshing worktrees...</div>}
      <div className="worktree-list">
        {worktrees.map((worktree) => (
          <WorktreeCard key={worktree.path} worktree={worktree} />
        ))}
        {!worktrees.length && !loading && <div className="muted-text">No worktrees found.</div>}
      </div>
    </div>
  );
}
