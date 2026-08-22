import { GitBranch } from 'lucide-react';
import { useGit } from '@/hooks/useGit';
import { useConnectionsStore } from '@/store/connectionsStore';

/**
 * @param {{onOpen: () => void}} props
 */
export default function GitStatusBadge({ onOpen }) {
  const { isRepo, branch, staged, unstaged, untracked } = useGit();
  const gitEnabled = useConnectionsStore((state) => state.enabledIntegrations.git !== false);
  if (!isRepo || !gitEnabled) return null;

  const dirty = staged.length + unstaged.length + untracked.length > 0;

  return (
    <button className="git-status-badge" onClick={onOpen} title="Open Git panel">
      <GitBranch size={12} />
      <span>{branch || 'detached'}</span>
      <span className={`git-clean-dot ${dirty ? 'dirty' : 'clean'}`} />
      <span>{dirty ? staged.length + unstaged.length + untracked.length : 'clean'}</span>
    </button>
  );
}
