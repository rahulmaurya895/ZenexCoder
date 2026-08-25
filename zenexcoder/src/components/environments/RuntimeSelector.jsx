import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_RUNTIME_CONFIG } from '@/store/environmentStore';
import { detectRuntimes, selectedRuntimeLabel } from '@/utils/runtimeDetector';

const RUNTIMES = [
  { id: 'node', label: 'Node.js', modes: ['system', 'nvm', 'fnm', 'path'] },
  { id: 'python', label: 'Python', modes: ['system', 'venv', 'conda', 'pyenv', 'path'] },
  { id: 'go', label: 'Go', modes: ['system', 'path'] },
  { id: 'java', label: 'Java', modes: ['system', 'sdkman', 'path'] },
  { id: 'ruby', label: 'Ruby', modes: ['system', 'rbenv', 'rvm', 'path'] },
  { id: 'rust', label: 'Rust', modes: ['system', 'path'] }
];

function versionOptions(detected, runtime, mode) {
  const options = detected?.[runtime]?.[mode] || [];
  return Array.isArray(options) ? options : [];
}

function optionLabel(option) {
  return typeof option === 'string' ? option : option.version || option.path;
}

function optionPath(option) {
  return typeof option === 'string' ? '' : option.path || option;
}

export default function RuntimeSelector({ env, projectPath, store }) {
  const [detected, setDetected] = useState({});
  const runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG, ...(env.runtimeConfig || {}) };
  const custom = runtimeConfig.custom || [];

  async function detect(force = false) {
    setDetected(await detectRuntimes(projectPath, { force }));
  }

  useEffect(() => {
    detect(false).catch(() => {});
  }, [projectPath]);

  async function updateRuntime(runtime, patch) {
    await store.updateEnv(projectPath, env.id, {
      runtimeConfig: {
        ...runtimeConfig,
        [runtime]: { ...(runtimeConfig[runtime] || { mode: 'system' }), ...patch }
      }
    });
  }

  async function browse(runtime) {
    const [filePath] = await window.zezenexcoderr.file.openDialog();
    if (filePath) await updateRuntime(runtime, { mode: 'path', resolvedPath: filePath });
  }

  const sections = useMemo(() => RUNTIMES, []);

  return (
    <div className="runtime-selector">
      <div className="git-section-header">
        <div className="panel-title">Runtimes</div>
        <div className="top-bar-spacer" />
        <button onClick={() => detect(true)}>
          <RefreshCw size={14} /> Detect again
        </button>
      </div>
      {sections.map((section) => {
        const config = runtimeConfig[section.id] || { mode: 'system' };
        const options = versionOptions(detected, section.id, config.mode);
        return (
          <details className="runtime-section" key={section.id} open={config.mode !== 'system'}>
            <summary>
              <strong>{section.label}</strong>
              <span>{selectedRuntimeLabel(section.id, config, detected)}</span>
            </summary>
            <div className="runtime-grid">
              <label>Mode</label>
              <select value={config.mode || 'system'} onChange={(event) => updateRuntime(section.id, { mode: event.target.value, version: '', resolvedPath: '' })}>
                {section.modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              {['nvm', 'fnm', 'pyenv', 'sdkman', 'rbenv', 'rvm'].includes(config.mode) && (
                <>
                  <label>Version</label>
                  <select
                    value={config.version || ''}
                    onChange={(event) => {
                      const picked = options.find((item) => optionLabel(item) === event.target.value);
                      updateRuntime(section.id, {
                        version: event.target.value,
                        resolvedPath: optionPath(picked)
                      });
                    }}
                  >
                    <option value="">Select version</option>
                    {options.map((option) => (
                      <option key={optionLabel(option)} value={optionLabel(option)}>
                        {optionLabel(option)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {['venv', 'conda'].includes(config.mode) && (
                <>
                  <label>Env path</label>
                  <input value={config.venvPath || ''} onChange={(event) => updateRuntime(section.id, { venvPath: event.target.value })} placeholder="Path to environment" />
                </>
              )}
              {config.mode === 'path' && (
                <>
                  <label>Binary path</label>
                  <div className="chat-input-actions">
                    <input value={config.resolvedPath || ''} onChange={(event) => updateRuntime(section.id, { resolvedPath: event.target.value })} placeholder="Absolute binary path" />
                    <button onClick={() => browse(section.id)}>Browse</button>
                  </div>
                </>
              )}
            </div>
            <div className="runtime-resolved">Resolves to: {config.resolvedPath || config.venvPath || 'system PATH'}</div>
            {!detected?.[section.id]?.system && <div className="runtime-note">Not detected - install via system package manager or the runtime's version manager.</div>}
          </details>
        );
      })}

      <div className="runtime-section custom-runtime">
        <strong>Custom runtimes</strong>
        {custom.map((item, index) => (
          <div className="runtime-grid" key={`${item.label}-${index}`}>
            <input value={item.label || ''} onChange={(event) => {
              const next = [...custom];
              next[index] = { ...item, label: event.target.value };
              store.updateEnv(projectPath, env.id, { runtimeConfig: { ...runtimeConfig, custom: next } });
            }} placeholder="Bun" />
            <input value={item.envKey || ''} onChange={(event) => {
              const next = [...custom];
              next[index] = { ...item, envKey: event.target.value };
              store.updateEnv(projectPath, env.id, { runtimeConfig: { ...runtimeConfig, custom: next } });
            }} placeholder="BUN_BIN" />
            <input value={item.path || ''} onChange={(event) => {
              const next = [...custom];
              next[index] = { ...item, path: event.target.value };
              store.updateEnv(projectPath, env.id, { runtimeConfig: { ...runtimeConfig, custom: next } });
            }} placeholder="Binary path" />
          </div>
        ))}
        <button onClick={() => store.updateEnv(projectPath, env.id, { runtimeConfig: { ...runtimeConfig, custom: [...custom, { label: '', envKey: '', path: '' }] } })}>
          Add custom runtime
        </button>
      </div>
    </div>
  );
}
