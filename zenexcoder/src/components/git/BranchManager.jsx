import { Check, GitMerge, GitPullRequest, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApprovalAction } from '@/hooks/useApprovalAction';
import { useGit } from '@/hooks/useGit';
import MergeDialog from './MergeDialog';

function countBadge(label, value, className) {
  if (!value) return null;
  return <span className={`branch-count ${className}`}>{label} {value}</span>;
}

/**
 * @param {{onClose?: () => void}} props
 */
export default function BranchManager({ onClose }) {
  const {
    branch,
    branches,
    staged,
    unstaged,
    untracked,
    checkout,
    renameBranch,
    deleteBranch,
    setUpstream,
    merge
  } = useGit();
  const { runWithApproval } = useApprovalAction();
  const [editing, setEditing] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [upstreamDraft, setUpstreamDraft] = useState({});
  const [remoteDelete, setRemoteDelete] = useState({});
  const [forceDelete, setForceDelete] = useState({});
  const [mergeSource, setMergeSource] = useState('');
  const dirty = staged.length + unstaged.length + untracked.length > 0;

  const branchRows = useMemo(() => {
    const detailMap = new Map((branches.details || []).map((item) => [item.name, item]));
    return (branches.local || [])
      .map((name) => detailMap.get(name) || { name, current: name === branch, ahead: 0, behind: 0, upstream: '' })
      .sort((a, b) => Number(b.name === branch) - Number(a.name === branch) || a.name.localeCompare(b.name));
  }, [branch, branches]);

  const remoteRefs = branches.remoteDetails?.length ? branches.remoteDetails.map((item) => item.name) : branches.remote || [];

  async function checkoutBranch(name) {
    if (dirty && !window.confirm('You have uncommitted changes. Checkout anyway?')) return;
    await checkout(name);
    onClose?.();
  }

  async function saveRename(oldName) {
    const nextName = renameValue.trim();
    if (!nextName || nextName === oldName) {
      setEditing('');
      return;
    }
    const result = await renameBranch(oldName, nextName);
    if (result?.warning) {
      await window.zezenexcoderr.notify.show({ title: 'Branch renamed', body: result.warning });
    }
    setEditing('');
  }

  async function deleteSelected(row) {
    const remote = Boolean(remoteDelete[row.name]);
    const force = Boolean(forceDelete[row.name]);
    const target = remote ? row.upstream || row.name : row.name;
    if (!window.confirm(`Delete ${remote ? 'remote' : 'local'} branch?\n\n${target}`)) return;
    await runWithApproval(
      {
        actionType: 'git_destructive',
        title: 'Delete Git branch',
        description: `${remote ? 'git push origin --delete' : `git branch ${force ? '-D' : '-d'}`} ${target}`
      },
      () => deleteBranch(target, { remote, force })
    );
  }

  async function setSelectedUpstream(name) {
    const remoteRef = upstreamDraft[name];
    if (!remoteRef) return;
    await setUpstream(name, remoteRef);
  }

  async function mergeSelected(source) {
    return runWithApproval(
      {
        actionType: dirty ? 'git_destructive' : 'file_write',
        title: 'Merge Git branch',
        description: `git merge --no-edit ${source}`
      },
      () => merge(source)
    );
  }

  return (
    <div className="branch-manager">
      <div className="branch-manager-title">
        <strong>Manage branches</strong>
        <span className="muted-text">{branchRows.length} local</span>
      </div>
      {mergeSource && (
        <MergeDialog
          sourceBranch={mergeSource}
          currentBranch={branch}
          onConfirm={() => mergeSelected(mergeSource)}
          onClose={() => setMergeSource('')}
        />
      )}
      <div className="branch-list">
        {branchRows.map((row) => (
          <div className={`branch-row ${row.name === branch ? 'current' : ''}`} key={row.name}>
            <div className="branch-row-main">
              {editing === row.name ? (
                <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
              ) : (
                <strong>{row.name}</strong>
              )}
              <div className="branch-meta">
                {row.upstream ? <span>{row.upstream}</span> : <span className="muted-text">no upstream</span>}
                {countBadge('up', row.ahead, 'ahead')}
                {countBadge('down', row.behind, 'behind')}
              </div>
            </div>
            <div className="branch-actions">
              {row.name !== branch && (
                <button onClick={() => checkoutBranch(row.name)}>
                  <GitPullRequest size={14} /> Checkout
                </button>
              )}
              {editing === row.name ? (
                <button className="icon-button" onClick={() => saveRename(row.name)} title="Save branch name">
                  <Check size={14} />
                </button>
              ) : (
                <button
                  className="icon-button"
                  onClick={() => {
                    setEditing(row.name);
                    setRenameValue(row.name);
                  }}
                  title="Rename branch"
                >
                  <Pencil size={14} />
                </button>
              )}
              <select
                value={upstreamDraft[row.name] || ''}
                onChange={(event) => setUpstreamDraft((state) => ({ ...state, [row.name]: event.target.value }))}
                title="Set upstream"
              >
                <option value="">Upstream</option>
                {remoteRefs.map((remote) => (
                  <option key={remote} value={remote}>
                    {remote}
                  </option>
                ))}
              </select>
              <button onClick={() => setSelectedUpstream(row.name)} disabled={!upstreamDraft[row.name]}>
                Set
              </button>
              {row.name !== branch && (
                <button onClick={() => setMergeSource(row.name)}>
                  <GitMerge size={14} /> Merge
                </button>
              )}
              <label className="check-row compact">
                <input
                  type="checkbox"
                  checked={Boolean(remoteDelete[row.name])}
                  disabled={!row.upstream}
                  onChange={(event) => setRemoteDelete((state) => ({ ...state, [row.name]: event.target.checked }))}
                />
                Remote
              </label>
              <label className="check-row compact">
                <input
                  type="checkbox"
                  checked={Boolean(forceDelete[row.name])}
                  onChange={(event) => setForceDelete((state) => ({ ...state, [row.name]: event.target.checked }))}
                />
                Force
              </label>
              <button className="icon-button danger-icon" onClick={() => deleteSelected(row)} title="Delete branch" disabled={row.name === branch}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!branchRows.length && <div className="muted-text">No local branches.</div>}
      </div>
    </div>
  );
}
