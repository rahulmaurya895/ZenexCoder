import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isValidEnvKey } from '@/utils/envParser';

function rowsFromEnv(env = {}, maskedEnvKeys = []) {
  const masked = new Set(maskedEnvKeys || []);
  return Object.entries(env || {}).map(([key, value]) => ({
    id: `env-${key}-${Math.random().toString(36).slice(2)}`,
    key,
    value,
    masked: masked.has(key),
    revealed: false
  }));
}

function envFromRows(rows = []) {
  return Object.fromEntries(
    rows
      .filter((row) => isValidEnvKey(row.key))
      .map((row) => [row.key.trim(), row.value || ''])
  );
}

function maskedKeysFromRows(rows = []) {
  return rows.filter((row) => isValidEnvKey(row.key) && row.masked).map((row) => row.key.trim());
}

function EnvRows({ rows, setRows }) {
  const newKeyRef = useRef(null);

  function updateRow(id, patch) {
    setRows((state) => state.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function deleteRow(id) {
    setRows((state) => state.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((state) => [
      ...state,
      {
        id: `env-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        key: '',
        value: '',
        masked: true,
        revealed: false
      }
    ]);
    window.requestAnimationFrame(() => newKeyRef.current?.focus());
  }

  return (
    <div className="mcp-env-table">
      <div className="mcp-env-row header">
        <span>KEY</span>
        <span>VALUE</span>
        <span>Mask</span>
        <span />
      </div>
      {rows.map((row, index) => {
        const valid = !row.key || isValidEnvKey(row.key);
        return (
          <div className="mcp-env-row" key={row.id}>
            <input
              ref={index === rows.length - 1 ? newKeyRef : null}
              className={`env-key-input ${valid ? '' : 'invalid'}`}
              value={row.key}
              onChange={(event) => updateRow(row.id, { key: event.target.value.toUpperCase() })}
              placeholder="GITHUB_TOKEN"
            />
            <div className="env-value-cell">
              <input
                type={row.masked && !row.revealed ? 'password' : 'text'}
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder="value"
              />
              {row.masked && (
                <button className="icon-button" type="button" onClick={() => updateRow(row.id, { revealed: !row.revealed })} title={row.revealed ? 'Hide value' : 'Reveal value'}>
                  {row.revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              )}
            </div>
            <input type="checkbox" checked={row.masked} onChange={(event) => updateRow(row.id, { masked: event.target.checked })} title="Mask value" />
            <button className="icon-button danger-icon" type="button" onClick={() => deleteRow(row.id)} title="Delete env var">
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <button className="mcp-add-row-button" type="button" onClick={addRow}>
        <Plus size={13} /> Add environment variable
      </button>
    </div>
  );
}

/**
 * @param {{server?: object, onSubmit: (config: object) => void, onCancel: () => void}} props
 */
export default function MCPServerForm({ server, onSubmit, onCancel }) {
  const [name, setName] = useState(server?.name || '');
  const [command, setCommand] = useState(server?.command || '');
  const [args, setArgs] = useState(server?.args?.length ? server.args : ['']);
  const [autoStart, setAutoStart] = useState(Boolean(server?.autoStart));
  const [envRows, setEnvRows] = useState(() => rowsFromEnv(server?.env, server?.maskedEnvKeys));

  useEffect(() => {
    setName(server?.name || '');
    setCommand(server?.command || '');
    setArgs(server?.args?.length ? server.args : ['']);
    setAutoStart(Boolean(server?.autoStart));
    setEnvRows(rowsFromEnv(server?.env, server?.maskedEnvKeys));
  }, [server?.id]);

  const invalidEnv = useMemo(() => envRows.some((row) => row.key && !isValidEnvKey(row.key)), [envRows]);
  const canSave = name.trim() && command.trim() && !invalidEnv;

  function updateArg(index, value) {
    setArgs((state) => state.map((arg, itemIndex) => (itemIndex === index ? value : arg)));
  }

  function deleteArg(index) {
    setArgs((state) => state.filter((_, itemIndex) => itemIndex !== index));
  }

  function submit(event) {
    event.preventDefault();
    if (!canSave) return;
    onSubmit({
      name: name.trim(),
      command: command.trim(),
      args: args.map((arg) => arg.trim()).filter(Boolean),
      env: envFromRows(envRows),
      maskedEnvKeys: maskedKeysFromRows(envRows),
      autoStart
    });
  }

  return (
    <form className="mcp-server-form" onSubmit={submit}>
      <div className="git-section-header">
        <div className="panel-title">{server ? 'Edit MCP server' : 'Add MCP server'}</div>
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Local SQLite Database" required />
      </label>
      <label>
        Command
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx" required />
      </label>
      <div className="mcp-form-section">
        <div className="mcp-form-label">Arguments</div>
        {args.map((arg, index) => (
          <div className="mcp-arg-row" key={`arg-${index}`}>
            <input value={arg} onChange={(event) => updateArg(index, event.target.value)} placeholder={index === 0 ? '-y' : '@modelcontextprotocol/server-everything'} />
            <button className="icon-button danger-icon" type="button" onClick={() => deleteArg(index)} title="Remove argument">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button className="mcp-add-row-button" type="button" onClick={() => setArgs((state) => [...state, ''])}>
          <Plus size={13} /> Add argument
        </button>
      </div>
      <div className="mcp-form-section">
        <div className="mcp-form-label">Environment Variables</div>
        <EnvRows rows={envRows} setRows={setEnvRows} />
      </div>
      <label className="mcp-checkbox-row">
        <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} />
        Auto-start when NexCode launches
      </label>
      {invalidEnv && <div className="error-text">Environment keys must use uppercase letters, digits, and underscores.</div>}
      <div className="chat-input-actions">
        <button className="primary-button" type="submit" disabled={!canSave}>
          Save & Connect
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
