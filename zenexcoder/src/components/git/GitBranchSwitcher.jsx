import { GitBranch, Plus } from 'lucide-react';
import { useState } from 'react';
import { useGit } from '@/hooks/useGit';
import BranchManager from './BranchManager';

export default function GitBranchSwitcher() {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const {
    branch,
    branches,
    staged,
    unstaged,
    untracked,
    checkout,
    createBranch,
    refreshBranches
  } = useGit();
  const dirty = staged.length + unstaged.length + untracked.length > 0;

  async function chooseBranch(branchName) {
    if (dirty && !window.confirm('You have uncommitted changes. Checkout anyway?')) {
      return;
    }
    await checkout(branchName);
    setOpen(false);
  }

  async function create() {
    const name = newBranch.trim();
    if (!name) return;
    await createBranch(name);
    setNewBranch('');
    setOpen(false);
  }

  return (
    <div className="git-branch-switcher">
      <button onClick={() => { refreshBranches(); setOpen((value) => !value); setManageOpen(false); }}>
        <GitBranch size={14} /> {branch || 'No branch'}
      </button>
      {open && (
        <div className="git-branch-menu">
          {manageOpen ? (
            <BranchManager onClose={() => setOpen(false)} />
          ) : (
            <>
              <div className="git-new-branch">
                <input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="New branch" />
                <button className="icon-button" onClick={create} title="Create branch">
                  <Plus size={14} />
                </button>
              </div>
              <div className="panel-title">Local</div>
              {branches.local.map((item) => (
                <button key={item} className={item === branch ? 'active' : ''} onClick={() => chooseBranch(item)}>
                  {item}
                </button>
              ))}
              {branches.remote.length > 0 && <div className="panel-title">Remote</div>}
              {branches.remote.map((item) => (
                <button key={item} onClick={() => chooseBranch(item)}>
                  {item}
                </button>
              ))}
              <button className="manage-branches-button" onClick={() => setManageOpen(true)}>
                Manage branches
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
