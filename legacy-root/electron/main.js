const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#111111',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC HANDLERS (stubs for now) ---------- //
ipcMain.handle('ai:stream', async (event, payload) => {
  const { handleAIStream } = require('./handlers/aiHandler');
  return await handleAIStream(event, payload);
});

ipcMain.handle('file:read', async (event, filePath) => {
  const fs = require('fs').promises;
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return { content: data };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('file:write', async (event, { filePath, content }) => {
  const fs = require('fs').promises;
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('terminal:run', async (event, command) => {
  const { runCommand } = require('./handlers/terminalHandler');
  return await runCommand(event, command);
});

ipcMain.handle('ollama:check', async () => {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    execSync(cmd, { stdio: 'ignore' });
    return { available: true };
  } catch (e) {
    return { available: false };
  }
});
