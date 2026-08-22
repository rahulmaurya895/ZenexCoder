import { ChevronDown, ChevronRight, GitBranch, Minus, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DiffViewer from '@/components/editor/DiffViewer';
import { useGit } from '@/hooks/useGit';
import { diffToBeforeAfter } from '@/utils/gitDiffParser';
import GitBranchSwitcher from './GitBranchSwitcher';
import GitCommitBox from './GitCommitBox';
import GitSyncBar from './GitSyncBar';
import WorktreePanel from './WorktreePanel';

function changeClass(change) {
  const status = typeof change === 'string' ? 'untracked' : change.status;
  return status || 'modified';
}

function relativeTime(dateValue) {
  const date = new Date(dateValue);
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * @param {{title?: string}} props
 */
export default function GitPanel({ title = 'Git' }) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('status');
  const {
    isRepo,
    branch,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    commits,
    selectedDiff,
    error,
    loading,
    refreshStatus,
    refreshBranches,
    refreshLog,
    stage,
    unstage,
    loadDiff,
    clearDiff
  } = useGit();
  const diffPair = useMemo(() => diffToBeforeAfter(selectedDiff?.raw || ''), [selectedDiff]);

  useEffect(() => {
    refreshStatus();
    refreshBranches();
    refreshLog();
  }, [refreshBranches, refreshLog, refreshStatus]);

  async function refreshAll() {
    await Promise.all([refreshStatus(), refreshBranches(), refreshLog()]);
  }

  function renderChangeRow(change, stagedChange = false) {
    const filePath = typeof change === 'string' ? change : change.path;
    const key = `${stagedChange ? 'staged' : 'work'}:${filePath}`;
    return (
      <div
        className={`git-file-row ${changeClass(change)}`}
        key={key}
        role="button"
        tabIndex={0}
        onClick={() => loadDiff(filePath, stagedChange)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') loadDiff(filePath, stagedChange);
        }}
      >
        <span className="git-file-name">{filePath}</span>
        <span className="git-file-status">{typeof change === 'string' ? 'untracked' : change.status}</span>
        <span className="top-bar-spacer" />
        {stagedChange ? (
          <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              unstage(filePath);
            }}
            title="Unstage"
          >
            <Minus size={14} />
          </button>
        ) : (
          <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              stage(filePath);
            }}
            title="Stage"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="panel git-panel">
      <div className="panel-header">
        <GitBranch size={16} />
        <span className="panel-title">{title}</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={refreshAll} title="Refresh Git status">
          <RefreshCw size={14} />
        </button>
      </div>

      {!isRepo ? (
        <div className="empty-state">
          <div className="empty-state-inner">
            <h2>No Git repository</h2>
            <p>Open a folder that contains a Git repository to use status, branches, diffs, and commits.</p>
            {error && <p>{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="git-panel-body">
            <div className="git-panel-header">
              <GitBranchSwitcher />
              <GitSyncBar />
              <div className="git-ahead-behind">
                <span>up {ahead}</span>
                <span>down {behind}</span>
                {loading && <span>refreshing</span>}
              </div>
            </div>

            <div className="git-tabs">
              <button className={activeTab === 'status' ? 'active' : ''} onClick={() => setActiveTab('status')}>
                Status
              </button>
              <button className={activeTab === 'worktrees' ? 'active' : ''} onClick={() => setActiveTab('worktrees')}>
                Worktrees
              </button>
            </div>

            {activeTab === 'worktrees' ? (
              <WorktreePanel />
            ) : (
              <>
                <div className="git-section">
                  <div className="panel-title">Staged</div>
                  {staged.length ? staged.map((change) => renderChangeRow(change, true)) : <div className="muted-text">No staged changes.</div>}
                </div>

                <div className="git-section">
                  <div className="panel-title">Unstaged</div>
                  {unstaged.length ? unstaged.map((change) => renderChangeRow(change, false)) : <div className="muted-text">No unstaged changes.</div>}
                </div>

                <div className="git-section">
                  <div className="panel-title">Untracked</div>
                  {untracked.length ? untracked.map((filePath) => renderChangeRow(filePath, false)) : <div className="muted-text">No untracked files.</div>}
                </div>

                <button className="history-toggle" onClick={() => setHistoryOpen((value) => !value)}>
                  {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} History
                </button>
                {historyOpen && (
                  <div className="git-history">
                    {commits.map((commit) => (
                      <div className="git-commit-row" key={commit.hash}>
                        <code>{commit.shortHash}</code>
                        <span>{commit.message}</span>
                        <small>{relativeTime(commit.date)}</small>
                      </div>
                    ))}
                    {!commits.length && <div className="muted-text">No commits yet.</div>}
                  </div>
                )}
              </>
            )}
          </div>
          {activeTab === 'status' && <GitCommitBox />}
          {activeTab === 'status' && selectedDiff && (
            <div className="git-diff-drawer">
              <div className="panel-header">
                <span className="panel-title">{selectedDiff.filePath}</span>
                <button onClick={clearDiff}>Close Diff</button>
              </div>
              <DiffViewer original={diffPair.original} updated={diffPair.updated} onApply={clearDiff} onReject={clearDiff} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
