import { GitCommit } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useGit } from '@/hooks/useGit';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppStore } from '@/store/appStore';

export default function GitCommitBox() {
  const [message, setMessage] = useState('');
  const [pendingApproval, setPendingApproval] = useState(null);
  const pendingRef = useRef(null);
  const { staged, commit, refreshStatus } = useGit();
  const { check } = usePermissions();
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);

  useEffect(() => {
    pendingRef.current = pendingApproval;
  }, [pendingApproval]);

  useEffect(() => {
    const dispose = window.zenexcoder.agent.onApprovalResolved(async (payload) => {
      const pending = pendingRef.current;
      if (!pending || (payload.actionId || payload.id) !== pending.id) return;
      setPendingApproval(null);
      if (payload.decision === 'approve') {
        const finalMessage = (payload.editedCommand || pending.message).trim();
        await commit(finalMessage);
        setMessage('');
        await refreshStatus();
      }
    });
    return dispose;
  }, [commit, refreshStatus]);

  async function commitNow() {
    const cleanMessage = message.trim();
    if (!cleanMessage || !staged.length) return;
    const permission = check({ actionType: 'git_commit' });
    if (permission.requiresApproval) {
      const approval = await window.zenexcoder.agent.requestApproval({
        actionType: 'git_commit',
        title: 'AI wants to create a git commit',
        description: cleanMessage,
        riskLevel: permission.riskLevel
      });
      setPendingApproval({ id: approval.id, message: cleanMessage });
      setRightPanelOpen(true);
      return;
    }
    await commit(cleanMessage);
    setMessage('');
    await refreshStatus();
  }

  return (
    <div className="git-commit-box">
      <textarea
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Commit message"
      />
      <button className="primary-button" onClick={commitNow} disabled={!message.trim() || !staged.length || Boolean(pendingApproval)}>
        <GitCommit size={14} /> {pendingApproval ? 'Waiting for approval' : `Commit ${staged.length || ''}`}
      </button>
    </div>
  );
}
