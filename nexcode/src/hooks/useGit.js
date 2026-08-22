import { useEffect } from 'react';
import { useGitStore } from '@/store/gitStore';
import { useProjectStore } from '@/store/projectStore';

let gitListenerUsers = 0;
let gitDisposers = [];

function ensureGitListeners() {
  if (!gitDisposers.length) {
    gitDisposers = [
      window.zenexcoder.git.onStatusChanged((payload) => {
        const currentProject = useProjectStore.getState().projectPath;
        if (!payload?.projectPath || payload.projectPath === currentProject) {
          useGitStore.getState().refreshStatus(currentProject);
        }
      }),
      window.zenexcoder.automation.onFileSaved(() => {
        const currentProject = useProjectStore.getState().projectPath;
        useGitStore.getState().refreshStatus(currentProject);
      })
    ];
  }
  gitListenerUsers += 1;
}

function releaseGitListeners() {
  gitListenerUsers = Math.max(0, gitListenerUsers - 1);
  if (gitListenerUsers === 0) {
    gitDisposers.forEach((dispose) => dispose());
    gitDisposers = [];
  }
}

export function useGit() {
  const git = useGitStore();
  const projectPath = useProjectStore((state) => state.projectPath);

  useEffect(() => {
    if (!projectPath) {
      useGitStore.getState().refreshStatus(null);
      return;
    }
    useGitStore.getState().refreshStatus(projectPath);
    useGitStore.getState().refreshBranches(projectPath);
    useGitStore.getState().refreshLog(projectPath);
  }, [projectPath]);

  useEffect(() => {
    ensureGitListeners();
    return releaseGitListeners;
  }, []);

  return git;
}
