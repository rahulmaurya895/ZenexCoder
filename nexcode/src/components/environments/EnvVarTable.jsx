import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isValidEnvKey } from '@/utils/envParser';

function SourceBadge({ source }) {
  if (source === 'imported') return <span className="env-source-badge">.env</span>;
  if (source === 'inherited') return <span className="env-source-badge inherited">inherited</span>;
  return <span />;
}

function EnvRow({ item, onUpdate, onDelete, onDuplicate }) {
  const [draft, setDraft] = useState({ key: item.key, value: item.value });
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = isValidEnvKey(draft.key);

  useEffect(() => {
    setDraft({ key: item.key, value: item.value });
  }, [item.key, item.value]);

  function save() {
    if (!valid) return;
    if (draft.key !== item.key || draft.value !== item.value) {
      onUpdate(item.id, draft);
    }
  }

  function onKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      onDuplicate(item);
    }
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      save();
    }
    if (event.key === 'Escape') {
      setDraft({ key: item.key, value: item.value });
      event.currentTarget.blur();
    }
  }

  if (confirmDelete) {
    return (
      <div className="env-var-row delete-confirm">
        <span>Delete {item.key}?</span>
        <div className="top-bar-spacer" />
        <button className="danger-button" onClick={() => onDelete(item.id)}>Delete</button>
        <button onClick={() => setConfirmDelete(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <div className={`env-var-row ${item.enabled === false ? 'disabled' : ''}`}>
      <input type="checkbox" checked={item.enabled !== false} onChange={() => onUpdate(item.id, { enabled: item.enabled === false })} />
      <input
        className={`env-key-input ${valid ? '' : 'invalid'}`}
        value={draft.key}
        onChange={(event) => setDraft((state) => ({ ...state, key: event.target.value.toUpperCase() }))}
        onBlur={save}
        onKeyDown={onKeyDown}
      />
      <div className="env-value-cell">
        <input
          type={item.masked && !revealed ? 'password' : 'text'}
          value={draft.value}
          onChange={(event) => setDraft((state) => ({ ...state, value: event.target.value }))}
          onBlur={save}
          onKeyDown={onKeyDown}
        />
        {item.masked && (
          <button className="icon-button" onClick={() => setRevealed((value) => !value)} title={revealed ? 'Hide value' : 'Reveal value'}>
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      <input type="checkbox" checked={item.masked} onChange={(event) => onUpdate(item.id, { masked: event.target.checked })} title="Mask value" />
      <SourceBadge source={item.source} />
      <button className="icon-button" onClick={() => onDuplicate(item)} title="Duplicate variable">
        <Copy size={13} />
      </button>
      <button className="icon-button danger-icon" onClick={() => setConfirmDelete(true)} title="Delete variable">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function EnvVarTable({ env, projectPath, store }) {
  const [search, setSearch] = useState('');
  const [newVar, setNewVar] = useState({ key: '', value: '', masked: false });
  const keyRef = useRef(null);
  const rows = (env.vars || []).filter((item) => `${item.key} ${item.value}`.toLowerCase().includes(search.toLowerCase()));
  const newKeyValid = !newVar.key || isValidEnvKey(newVar.key);

  async function add() {
    if (!isValidEnvKey(newVar.key)) return;
    await store.addVar(projectPath, env.id, { ...newVar, source: 'manual', enabled: true });
    setNewVar({ key: '', value: '', masked: false });
    keyRef.current?.focus();
  }

  async function duplicate(item) {
    await store.addVar(projectPath, env.id, {
      key: `${item.key}_COPY`,
      value: item.value,
      masked: item.masked,
      source: item.source || 'manual',
      enabled: item.enabled !== false
    });
  }

  return (
    <div className="env-var-table-wrap">
      <div className="git-section-header">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search variables" />
      </div>
      <div className="env-var-table">
        <div className="env-var-row header">
          <span>On</span>
          <span>KEY</span>
          <span>VALUE</span>
          <span>Mask</span>
          <span>Source</span>
          <span />
          <span />
        </div>
        {rows.map((item) => (
          <EnvRow
            key={item.id}
            item={item}
            onUpdate={(varId, patch) => store.updateVar(projectPath, env.id, varId, patch)}
            onDelete={(varId) => store.deleteVar(projectPath, env.id, varId)}
            onDuplicate={duplicate}
          />
        ))}
        <div className="env-var-row add-row">
          <span />
          <input
            ref={keyRef}
            className={`env-key-input ${newKeyValid ? '' : 'invalid'}`}
            value={newVar.key}
            onChange={(event) => setNewVar((state) => ({ ...state, key: event.target.value.toUpperCase() }))}
            placeholder="NEW_KEY"
          />
          <input value={newVar.value} onChange={(event) => setNewVar((state) => ({ ...state, value: event.target.value }))} placeholder="value" />
          <input type="checkbox" checked={newVar.masked} onChange={(event) => setNewVar((state) => ({ ...state, masked: event.target.checked }))} />
          <span />
          <button className="primary-button" onClick={add} disabled={!isValidEnvKey(newVar.key)}>
            <Plus size={13} /> Add
          </button>
          <span />
        </div>
      </div>
    </div>
  );
}
