import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApprovalAction } from '@/hooks/useApprovalAction';
import { useGit } from '@/hooks/useGit';

function splitUpstream(upstream = '', branch = '') {
  if (!upstream || !upstream.includes('/')) {
    return { remote: 'origin', branch };
  }
  const [remote, ...rest] = upstream.split('/');
  return { remote, branch: rest.join('/') };
}

export default function GitSyncBar() {
  const { branch, ahead, behind, branches, fetch, pull, push, stash } = useGit();
  const { runWithApproval } = useApprovalAction();
  const [state, setState] = useState({ action: '', status: 'idle', message: '' });
  const [needsStash, setNeedsStash] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [forceConfirm, setForceConfirm] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const currentDetail = useMemo(() => (branches.details || []).find((item) => item.name === branch), [branch, branches]);
  const upstream = splitUpstream(currentDetail?.upstream, branch);

  useEffect(() => {
    window.zenexcoder?.github?.tokenStatus?.().then((res) => setHasToken(Boolean(res?.hasToken))).catch(() => {});
  }, []);

  async function saveToken() {
    if (!githubToken.trim()) return;
    await window.zenexcoder.github.saveToken(githubToken.trim());
    setHasToken(true);
    setShowTokenInput(false);
    setGithubToken('');
    window.zenexcoder.notify.show({ title: 'GitHub Token', body: 'Token saved securely.' });
  }

  async function run(action, fn, notifyBody) {
    setNeedsStash(false);
    setState({ action, status: 'pending', message: '' });
    try {
      const result = await fn();
      if (!result) {
        setState({ action: '', status: 'idle', message: '' });
        return null;
      }
      if (result?.needsStash) {
        setNeedsStash(true);
        setState({ action, status: 'error', message: 'Local changes need a stash before pulling.' });
        return result;
      }
      setState({ action, status: 'success', message: result?.summary || notifyBody });
      await window.zenexcoder.notify.show({ title: 'Git', body: notifyBody });
      setTimeout(() => setState((current) => (current.action === action ? { action: '', status: 'idle', message: '' } : current)), 300);
      return result;
    } catch (error) {
      setState({ action, status: 'error', message: error.message });
      await window.zenexcoder.notify.show({ title: 'Git error', body: error.message });
      return null;
    }
  }

  async function fetchNow() {
    return run('fetch', () => runWithApproval({ actionType: 'network_request', title: 'Fetch Git remote', description: `git fetch ${upstream.remote}` }, () => fetch(upstream.remote)), 'Fetch completed.');
  }

  async function pullNow(afterStash = false) {
    return run(
      'pull',
      () =>
        runWithApproval(
          { actionType: 'file_write', title: 'Pull Git branch', description: `git pull ${upstream.remote} ${upstream.branch || branch}` },
          () => pull({ remote: upstream.remote, branch: upstream.branch || branch, afterStash })
        ),
      'Pull completed.'
    );
  }

  async function pushNow() {
    if (forcePush && forceConfirm !== branch) {
      setState({ action: 'push', status: 'error', message: 'Type the branch name to confirm force push.' });
      return null;
    }
    return run(
      'push',
      () =>
        runWithApproval(
          {
            actionType: 'git_push',
            title: forcePush ? 'Force push Git branch' : 'Push Git branch',
            description: `git push ${forcePush ? '--force-with-lease ' : ''}${upstream.remote} ${branch}`
          },
          () => push({ remote: upstream.remote, branch, force: forcePush })
        ),
      'Push completed.'
    );
  }

  async function stashAndPull() {
    const pushed = await runWithApproval({ actionType: 'git_stash', title: 'Stash changes before pull', description: 'git stash push -u' }, () =>
      stash({ action: 'push' })
    );
    if (!pushed) return;
    const pulled = await pullNow(true);
    if (pulled?.ok) {
      await runWithApproval({ actionType: 'git_stash', title: 'Restore stashed changes', description: 'git stash pop' }, () =>
        stash({ action: 'pop' })
      );
      setNeedsStash(false);
    }
  }

  const buttonClass = (action) => (state.action === action ? `git-sync-button ${state.status}` : 'git-sync-button');

  return (
    <div className="git-sync-bar">
      <button className={buttonClass('fetch')} onClick={fetchNow} title={state.action === 'fetch' ? state.message : 'Fetch remote'}>
        <RefreshCw size={14} /> Fetch
      </button>
      <button className={buttonClass('pull')} onClick={() => pullNow()} title={state.action === 'pull' ? state.message : 'Pull branch'}>
        <ArrowDown size={14} /> Pull {behind > 0 && <span className="git-sync-badge">{behind}</span>}
      </button>
      <button className={buttonClass('push')} onClick={pushNow} title={state.action === 'push' ? state.message : 'Push branch'}>
        <ArrowUp size={14} /> Push {ahead > 0 && <span className="git-sync-badge">{ahead}</span>}
      </button>
      <button
        className="git-sync-button"
        onClick={() => setShowTokenInput(!showTokenInput)}
        title={hasToken ? 'GitHub Token Saved' : 'Add GitHub PAT Token'}
      >
        {hasToken ? 'GH Auth OK' : 'GH Token'}
      </button>
      {showTokenInput && (
        <div className="git-token-box" style={{ display: 'flex', gap: '6px', marginTop: '6px', width: '100%' }}>
          <input
            type="password"
            placeholder="Paste GitHub Personal Access Token"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
          />
          <button className="primary-button" onClick={saveToken} style={{ padding: '4px 10px', fontSize: '12px' }}>Save</button>
        </div>
      )}
      <label className="check-row compact">
        <input type="checkbox" checked={forcePush} onChange={(event) => setForcePush(event.target.checked)} />
        Force
      </label>
      {forcePush && (
        <input
          className="force-confirm-input"
          value={forceConfirm}
          onChange={(event) => setForceConfirm(event.target.value)}
          placeholder={branch}
          title="Type branch name to confirm force push"
        />
      )}
      {state.status === 'pending' && <span className="git-sync-spinner">pending</span>}
      {state.status === 'error' && <span className="git-sync-error">{state.message}</span>}
      {needsStash && (
        <div className="git-stash-choice">
          <span>Local changes block pull.</span>
          <button onClick={stashAndPull}>Stash changes and pull</button>
          <button onClick={() => setNeedsStash(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
