import { create } from 'zustand';
import { useProjectStore } from './projectStore';

const emptyStatus = {
  isRepo: false,
  branch: '',
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: []
};

export const useGitStore = create((set, get) => ({
  ...emptyStatus,
  branches: { current: '', local: [], remote: [] },
  commits: [],
  selectedDiff: null,
  loading: false,
  error: null,
  getProjectPath() {
    return useProjectStore.getState().projectPath;
  },
  async refreshStatus(projectPath = get().getProjectPath()) {
    if (!projectPath) {
      set({ ...emptyStatus, error: null });
      return emptyStatus;
    }
    set({ loading: true, error: null });
    try {
      const status = await window.zenexcoder.git.status(projectPath);
      set({ ...emptyStatus, ...status, loading: false });
      return status;
    } catch (error) {
      set({ ...emptyStatus, loading: false, error: error.message });
      return emptyStatus;
    }
  },
  async refreshBranches(projectPath = get().getProjectPath()) {
    if (!projectPath) return { current: '', local: [], remote: [] };
    try {
      const branches = await window.zenexcoder.git.branches(projectPath);
      set({ branches });
      return branches;
    } catch (error) {
      set({ error: error.message });
      return { current: '', local: [], remote: [] };
    }
  },
  async refreshLog(projectPath = get().getProjectPath(), limit = 20) {
    if (!projectPath) return [];
    try {
      const result = await window.zenexcoder.git.log(projectPath, limit);
      set({ commits: result.commits || [] });
      return result.commits || [];
    } catch (error) {
      set({ error: error.message });
      return [];
    }
  },
  async stage(filePath) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return;
    await window.zenexcoder.git.stage(projectPath, filePath);
    await get().refreshStatus(projectPath);
  },
  async unstage(filePath) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return;
    await window.zenexcoder.git.unstage(projectPath, filePath);
    await get().refreshStatus(projectPath);
  },
  async commit(message) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.commit(projectPath, message);
    await Promise.all([get().refreshStatus(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async checkout(branchName) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return;
    await window.zenexcoder.git.checkout(projectPath, branchName);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
  },
  async createBranch(name, fromRef = '') {
    const projectPath = get().getProjectPath();
    if (!projectPath) return;
    await window.zenexcoder.git.createBranch(projectPath, name, fromRef);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath)]);
  },
  async renameBranch(oldName, newName) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.branchRename(projectPath, oldName, newName);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async deleteBranch(branchName, options = {}) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.branchDelete(projectPath, { branchName, ...options });
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async setUpstream(branchName, remoteRef) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.setUpstream(projectPath, branchName, remoteRef);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath)]);
    return result;
  },
  async merge(sourceBranch) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.merge(projectPath, sourceBranch);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async fetch(remote = 'origin') {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.fetch(projectPath, { remote });
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async pull(payload = {}) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.pull(projectPath, payload);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async push(payload = {}) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.push(projectPath, payload);
    await Promise.all([get().refreshStatus(projectPath), get().refreshBranches(projectPath), get().refreshLog(projectPath)]);
    return result;
  },
  async stash(payload = {}) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.stash(projectPath, payload);
    await get().refreshStatus(projectPath);
    return result;
  },
  async loadDiff(filePath, staged = false) {
    const projectPath = get().getProjectPath();
    if (!projectPath) return null;
    const result = await window.zenexcoder.git.diff(projectPath, filePath, staged);
    const diff = { filePath, staged, raw: result.diff || '' };
    set({ selectedDiff: diff });
    return diff;
  },
  clearDiff() {
    set({ selectedDiff: null });
  }
}));
