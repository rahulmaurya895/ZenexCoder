import { create } from 'zustand';
import { basename, detectLanguage } from '@/utils/fileUtils';

export const useProjectStore = create((set, get) => ({
  projectPath: null,
  fileTree: [],
  openFiles: [],
  activeFileId: null,
  projectSettings: {},
  loading: false,
  async openProject(folderPath) {
    if (!folderPath) {
      const chosen = await window.nexcode.folder.openDialog();
      if (!chosen) {
        return null;
      }
      folderPath = chosen;
    }
    set({ loading: true });
    try {
      const fileTree = await window.nexcode.folder.readTree(folderPath);
      await window.nexcode.db.upsertProject({ path: folderPath, name: basename(folderPath) });
      const projects = await window.nexcode.db.listProjects();
      const current = projects.find((project) => project.path === folderPath);
      set({ projectPath: folderPath, fileTree, loading: false, projectSettings: current?.settings || {} });
      return folderPath;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async refreshTree() {
    const { projectPath } = get();
    if (!projectPath) {
      return;
    }
    const fileTree = await window.nexcode.folder.readTree(projectPath);
    set({ fileTree });
  },
  async openFile(filePath) {
    const existing = get().openFiles.find((file) => file.path === filePath);
    if (existing) {
      set({ activeFileId: existing.id });
      return existing;
    }
    const result = await window.nexcode.file.read(filePath);
    const file = {
      id: filePath,
      path: filePath,
      name: basename(filePath),
      language: detectLanguage(filePath),
      content: result.content,
      originalContent: result.content,
      dirty: false,
      warning: result.largeFileWarning
    };
    set((state) => ({
      openFiles: [...state.openFiles, file],
      activeFileId: file.id
    }));
    return file;
  },
  closeFile(id) {
    set((state) => {
      const openFiles = state.openFiles.filter((file) => file.id !== id);
      const activeFileId = state.activeFileId === id ? openFiles.at(-1)?.id || null : state.activeFileId;
      return { openFiles, activeFileId };
    });
  },
  closeOthers(id) {
    set((state) => ({ openFiles: state.openFiles.filter((file) => file.id === id), activeFileId: id }));
  },
  closeAll() {
    set({ openFiles: [], activeFileId: null });
  },
  setActiveFile(id) {
    set({ activeFileId: id });
  },
  updateFileContent(id, content) {
    set((state) => ({
      openFiles: state.openFiles.map((file) =>
        file.id === id ? { ...file, content, dirty: content !== file.originalContent } : file
      )
    }));
  },
  async saveFile(id) {
    const file = get().openFiles.find((item) => item.id === id);
    if (!file) {
      return null;
    }
    await window.nexcode.file.write(file.path, file.content);
    set((state) => ({
      openFiles: state.openFiles.map((item) =>
        item.id === id ? { ...item, dirty: false, originalContent: item.content } : item
      )
    }));
    await get().refreshTree();
    return file;
  },
  async setProjectWorkMode(workMode) {
    const { projectPath, projectSettings } = get();
    if (!projectPath) return;
    const settings = { ...projectSettings, workMode };
    await window.nexcode.db.upsertProject({ path: projectPath, name: basename(projectPath), settings });
    set({ projectSettings: settings });
  },
  async writeNewFile(filePath, content) {
    await window.nexcode.file.write(filePath, content);
    await get().refreshTree();
    return get().openFile(filePath);
  },
  openVirtualFile({ name, content, language = 'plaintext' }) {
    const id = `virtual:${name}:${Date.now()}`;
    const file = {
      id,
      path: id,
      name,
      language,
      content,
      originalContent: content,
      dirty: false,
      virtual: true
    };
    set((state) => ({ openFiles: [...state.openFiles, file], activeFileId: id }));
    return file;
  },
  getActiveFile() {
    return get().openFiles.find((file) => file.id === get().activeFileId) || null;
  }
}));
