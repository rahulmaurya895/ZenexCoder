import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Terminal } from 'lucide-react';

const customValue = '__custom__';

function nameFromPath(shellPath = '') {
  return shellPath.split(/[\\/]/).filter(Boolean).at(-1) || shellPath || 'Default shell';
}

export default function ShellSelector({ onShellChanged }) {
  const [shells, setShells] = useState([]);
  const [selected, setSelected] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const result = await window.nexcode.terminal.getShells();
      setShells(result.shells || []);
      setSelected(result.selected || '');
      if (result.selected && !(result.shells || []).some((shell) => shell.path === result.selected)) {
        setCustomPath(result.selected);
        setCustomMode(true);
      } else {
        setCustomMode(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
    const dispose = window.nexcode.terminal.onShellChanged((result) => {
      setShells(result.shells || []);
      setSelected(result.selected || '');
      setCustomMode(Boolean(result.selected && !(result.shells || []).some((shell) => shell.path === result.selected)));
      onShellChanged?.(result);
    });
    return dispose;
  }, [onShellChanged]);

  const selectedValue = useMemo(() => {
    if (!selected) return '';
    return !customMode && shells.some((shell) => shell.path === selected) ? selected : customValue;
  }, [customMode, selected, shells]);

  async function applyShell(shellPath) {
    if (!shellPath.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.nexcode.terminal.setShell(shellPath.trim());
      setShells(result.shells || []);
      setSelected(result.selected || shellPath.trim());
      setCustomPath(shellPath.trim());
      setCustomMode(Boolean(result.selected && !(result.shells || []).some((shell) => shell.path === result.selected)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell-selector">
      <Terminal size={14} />
      <select
        value={selectedValue}
        disabled={loading}
        onChange={(event) => {
          const value = event.target.value;
          if (value === customValue) {
            setCustomPath(selected);
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          applyShell(value).catch(() => {});
        }}
        title={`Active shell: ${nameFromPath(selected)}`}
      >
        {shells.map((shell) => (
          <option value={shell.path} key={shell.path}>
            {shell.label}
          </option>
        ))}
        {selected && !shells.some((shell) => shell.path === selected) ? (
          <option value={customValue}>Custom: {nameFromPath(selected)}</option>
        ) : (
          <option value={customValue}>Custom Path...</option>
        )}
      </select>
      <button className="icon-button" onClick={() => refresh()} disabled={loading} title="Refresh shells">
        <RefreshCcw size={13} />
      </button>
      {selectedValue === customValue && (
        <>
          <input value={customPath} onChange={(event) => setCustomPath(event.target.value)} placeholder="Shell executable path" />
          <button onClick={() => applyShell(customPath)} disabled={loading || !customPath.trim()}>
            Apply
          </button>
        </>
      )}
      {error && <span className="shell-selector-error">{error}</span>}
    </div>
  );
}
