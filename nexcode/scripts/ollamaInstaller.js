import { spawn } from 'node:child_process';
import os from 'node:os';

export function getInstallCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://ollama.com/install.ps1 | iex']
    };
  }
  if (process.platform === 'darwin') {
    return {
      command: 'open',
      args: ['https://ollama.com/download/mac']
    };
  }
  return {
    command: 'sh',
    args: ['-c', 'curl -fsSL https://ollama.com/install.sh | sh']
  };
}

export function detectHardware() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model || 'Unknown CPU',
    ramGb: Math.round(os.totalmem() / 1024 / 1024 / 1024)
  };
}

export function runInstaller(onLog = () => {}) {
  const { command, args } = getInstallCommand();
  const child = spawn(command, args, { windowsHide: true });
  child.stdout?.on('data', (data) => onLog(data.toString()));
  child.stderr?.on('data', (data) => onLog(data.toString()));
  return child;
}
