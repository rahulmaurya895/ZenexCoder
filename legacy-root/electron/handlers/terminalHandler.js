// electron/handlers/terminalHandler.js
// Simple terminal command runner using child_process.exec.
// For full PTY support you could replace this with `node-pty`.

const { exec } = require('child_process');

/**
 * Executes a shell command and returns its result.
 * @param {Electron.IpcMainInvokeEvent} event – the IPC event (unused but kept for signature compatibility)
 * @param {string} command – the command to run (e.g., "ls" or "dir")
 * @returns {Promise<{output?:string, error?:string}>}
 */
async function runCommand(event, command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message, output: stderr });
      } else {
        resolve({ output: stdout });
      }
    });
  });
}

module.exports = { runCommand };
