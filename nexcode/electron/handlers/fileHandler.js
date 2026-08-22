import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { notifyGitStatusChanged } from './gitHandler.js';

const IGNORED = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.cache'
]);

const PROTECTED_SYSTEM_PATHS = [
  /^[a-z]:\\windows/i,
  /system32/i,
  /drivers\\etc\\hosts/i,
  /^(?:[a-z]:)?[\\\/]etc[\\\/](?:hosts|passwd|shadow|sudoers)/i,
  /^(?:[a-z]:)?[\\\/](?:boot|proc|sys|root|dev)(?:[\\\/]|$)/i,
  /ntuser\.dat/i
];

export function validateSafePath(targetPath = '') {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Invalid file path provided.');
  }
  const resolved = path.resolve(targetPath);
  const normalized = resolved.toLowerCase();

  for (const pattern of PROTECTED_SYSTEM_PATHS) {
    if (pattern.test(normalized)) {
      throw new Error(`Security Policy Violation: Path Traversal blocked. Access or modification to protected OS directory / system file (${path.basename(resolved)}) is strictly prohibited.`);
    }
  }
  return resolved;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTree(dirPath, depth = 0) {
  const safeDir = validateSafePath(dirPath);
  const entries = await fs.readdir(safeDir, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (IGNORED.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(safeDir, entry.name);
    const stat = await fs.stat(fullPath);
    const node = {
      id: fullPath,
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? 'folder' : 'file',
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      children: []
    };
    if (entry.isDirectory() && depth < 8) {
      node.children = await readTree(fullPath, depth + 1);
    }
    nodes.push(node);
  }
  return nodes;
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

export function registerFileHandlers() {
  ipcMain.handle('file:read', async (_event, payload) => {
    const rawPath = typeof payload === 'string' ? payload : payload?.filePath || payload?.path || '';
    if (!rawPath) throw new Error('No valid file path provided for reading.');
    const filePath = validateSafePath(rawPath);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 1024 * 1024 * 5) {
        throw new Error('File is larger than 5 MB and cannot be opened safely in the editor.');
      }
      const content = await fs.readFile(filePath, 'utf8');
      return {
        filePath,
        content,
        size: stat.size,
        largeFileWarning:
          stat.size > 1024 * 100
            ? 'Large file may exceed context limit. Summarize or select a portion?'
            : null
      };
    } catch (error) {
      throw new Error(`Unable to read file: ${error.message}`);
    }
  });

  ipcMain.handle('file:write', async (_event, payload = {}) => {
    const rawPath = typeof payload === 'string' ? payload : payload?.filePath || payload?.path || '';
    const content = typeof payload === 'object' ? payload?.content ?? '' : '';
    if (!rawPath) throw new Error('No valid file path provided for writing.');
    const filePath = validateSafePath(rawPath);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      sendToAll('file:saved', {
        filePath: filePath,
        content: content,
        savedAt: Date.now()
      });
      notifyGitStatusChanged(filePath);
      return { ok: true, filePath };
    } catch (error) {
      throw new Error(`Unable to write file: ${error.message}`);
    }
  });

  ipcMain.handle('file:patch', async (_event, payload = {}) => {
    const rawPath = typeof payload === 'string' ? payload : payload?.filePath || payload?.path || '';
    const searchTarget = payload.searchTarget || payload.search || '';
    const replacementContent = payload.replacementContent || payload.replace || '';

    if (!rawPath) throw new Error('No valid file path provided for patching.');
    const filePath = validateSafePath(rawPath);
    try {
      const original = await fs.readFile(filePath, 'utf8');
      if (searchTarget && !original.includes(searchTarget)) {
        throw new Error(`Target text to patch was not found in ${path.basename(filePath)}.`);
      }
      const updated = searchTarget ? original.replace(searchTarget, replacementContent) : replacementContent;
      await fs.writeFile(filePath, updated, 'utf8');
      sendToAll('file:saved', { filePath, content: updated, savedAt: Date.now() });
      notifyGitStatusChanged(filePath);
      return { ok: true, filePath };
    } catch (error) {
      throw new Error(`Unable to patch file: ${error.message}`);
    }
  });

  ipcMain.handle('file:rename', async (_event, payload = {}) => {
    try {
      const oldPath = validateSafePath(payload.oldPath);
      const newPath = validateSafePath(payload.newPath);
      if (await exists(newPath)) {
        throw new Error('Target path already exists.');
      }
      await fs.rename(oldPath, newPath);
      return { ok: true, oldPath, newPath };
    } catch (error) {
      throw new Error(`Unable to rename file: ${error.message}`);
    }
  });

  ipcMain.handle('file:delete', async (_event, rawPath) => {
    try {
      const filePath = validateSafePath(rawPath);
      const stat = await fs.stat(filePath);
      await fs.rm(filePath, { recursive: stat.isDirectory(), force: true });
      return { ok: true, filePath };
    } catch (error) {
      throw new Error(`Unable to delete file: ${error.message}`);
    }
  });

  ipcMain.handle('file:stat', async (_event, rawPath) => {
    try {
      const filePath = validateSafePath(rawPath);
      const stat = await fs.stat(filePath);
      return {
        filePath,
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        modifiedAt: stat.mtimeMs
      };
    } catch (error) {
      throw new Error(`Unable to inspect file: ${error.message}`);
    }
  });

  ipcMain.handle('file:open-dialog', async (_event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', ...(options.multi ? ['multiSelections'] : [])],
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
      });
      return result.canceled ? [] : result.filePaths;
    } catch (error) {
      throw new Error(`Unable to open file dialog: ${error.message}`);
    }
  });

  ipcMain.handle('file:reveal', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  ipcMain.handle('folder:open-dialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      });
      return result.canceled ? null : result.filePaths[0];
    } catch (error) {
      throw new Error(`Unable to open folder dialog: ${error.message}`);
    }
  });

  ipcMain.handle('folder:read-tree', async (_event, folderPath) => {
    try {
      return await readTree(folderPath);
    } catch (error) {
      throw new Error(`Unable to read folder tree: ${error.message}`);
    }
  });
}
