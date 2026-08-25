import { create } from 'zustand';
import { useProjectStore } from './projectStore';
import { useGitStore } from './gitStore';

export const useWorktreeStore = create((set, get) => ({
  worktrees: [],
  activeWorktreePath: '',
  loading: false,
  error: null,
  getProjectPath() {
    return useProjectStore.getState().projectPath;
  },
  async refresh(projectPath = get().getProjectPath()) {
    if (!projectPath) {
      set({ worktrees: [], activeWorktreePath: '', error: null });
      return [];
    }
    set({ loading: true, error: null });
    try {
      const result = await window.zezenexcoderr.git.worktreeList(projectPath);
      const worktrees = result.worktrees || [];
      set({ worktrees, activeWorktreePath: projectPath, loading: false });
      return worktrees;
    } catch (error) {
      set({ loading: false, error: error.message });
      return [];
    }
  },
  async add(payload) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zezenexcoderr.git.worktreeAdd(projectPath, payload);
    await get().refresh(projectPath);
    return result;
  },
  async remove(worktreePath, options = {}) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zezenexcoderr.git.worktreeRemove(projectPath, worktreePath, options);
    await get().refresh(projectPath);
    return result;
  },
  async prune() {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zezenexcoderr.git.worktreePrune(projectPath);
    await get().refresh(projectPath);
    return result;
  },
  async openInZenexCoder(worktreePath) {
    if (!worktreePath) return null;
    // TODO: Phase 2B Part 9 may allow opening this in a separate popout window instead of switching the current window.
    const opened = await useProjectStore.getState().openProject(worktreePath);
    await Promise.all([
      useGitStore.getState().refreshStatus(opened),
      useGitStore.getState().refreshBranches(opened),
      useGitStore.getState().refreshLog(opened),
      get().refresh(opened)
    ]);
    return opened;
  }
}));
