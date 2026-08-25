let cachedRuntimes = null;

export async function detectRuntimes(projectPath, { force = false } = {}) {
  if (!force && cachedRuntimes) {
    return cachedRuntimes;
  }
  cachedRuntimes = await window.zezenexcoderr.runtime.detect({ projectPath, force });
  return cachedRuntimes;
}

export function clearRuntimeDetectionCache() {
  cachedRuntimes = null;
}

export function selectedRuntimeLabel(runtime, config = {}, detected = {}) {
  if (!config || config.mode === 'system') {
    return detected?.[runtime]?.system || 'System default';
  }
  if (config.version) return config.version;
  if (config.resolvedPath) return config.resolvedPath;
  if (config.venvPath) return config.venvPath;
  return 'Not configured';
}
