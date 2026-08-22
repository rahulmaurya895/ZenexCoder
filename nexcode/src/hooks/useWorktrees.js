import { useEffect } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useWorktreeStore } from '@/store/worktreeStore';

export function useWorktrees() {
  const worktrees = useWorktreeStore();
  const projectPath = useProjectStore((state) => state.projectPath);

  useEffect(() => {
    if (!projectPath) {
      useWorktreeStore.setState({ worktrees: [], activeWorktreePath: '' });
      return;
    }
    useWorktreeStore.getState().refresh(projectPath);
  }, [projectPath]);

  return worktrees;
}
