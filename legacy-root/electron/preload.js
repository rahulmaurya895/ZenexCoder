// preload.js – expose safe IPC methods to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexcode', {
  // AI streaming
  aiStream: (payload) => ipcRenderer.invoke('ai:stream', payload),
  // Token listener for streamed tokens
  onAIToken: (callback) => ipcRenderer.on('ai:token', (_, data) => callback(data)),
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', { filePath, content }),
  // Terminal command execution (PTY)
  runTerminal: (command) => ipcRenderer.invoke('terminal:run', command),
  // Ollama checks & commands
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  // Additional IPC can be added later
});
