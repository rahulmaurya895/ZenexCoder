import { CheckCircle2, Copy, Layers, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useProjectStore } from '@/store/projectStore';
import EnvImportExport from './EnvImportExport';
import EnvironmentCard from './EnvironmentCard';
import EnvVarTable from './EnvVarTable';
import RuntimeSelector from './RuntimeSelector';

const TYPES = ['development', 'staging', 'production', 'custom'];

export default function EnvironmentsPanel() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const store = useEnvironment();
  const envs = useMemo(() => (projectPath ? store.getEnvsForProject(projectPath) : []), [projectPath, store.environments, store.activeEnvId]);
  const active = projectPath ? store.getActiveEnv(projectPath) : null;
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('variables');
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({ name: 'development', type: 'development', copyFromId: '' });
  const selected = envs.find((env) => env.id === selectedId) || active || envs[0] || null;

  useEffect(() => {
    if (projectPath) store.refresh(projectPath).catch(() => {});
  }, [projectPath]);

  useEffect(() => {
    if (!selectedId && selected?.id) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  async function createEnv() {
    if (!projectPath || !draft.name.trim()) return;
    const first = envs.length === 0;
    const env = await store.createEnv(projectPath, {
      name: draft.name.trim(),
      type: draft.type,
      copyFromId: draft.copyFromId || null
    });
    setSelectedId(env.id);
    setNewOpen(false);
    setDraft({ name: 'development', type: 'development', copyFromId: '' });
    if (first) {
      await window.zezenexcoderr.notify.show({ title: 'Environment created', body: `Created and activated '${env.name}'.` });
    }
  }

  async function activate(env) {
    await store.activateEnv(projectPath, env.id);
  }

  async function duplicate(env) {
    const copy = await store.createEnv(projectPath, {
      name: `${env.name}-copy`,
      type: env.type,
      copyFromId: env.id
    });
    setSelectedId(copy.id);
  }

  async function deleteEnv(env) {
    const result = await store.deleteEnv(projectPath, env.id);
    if (result?.error === 'cannot_delete_active') {
      await window.zezenexcoderr.notify.show({ title: 'Environment', body: 'Switch to another environment first.' });
      return;
    }
    setSelectedId(store.getActiveEnv(projectPath)?.id || '');
  }

  if (!projectPath) {
    return (
      <section className="panel">
        <div className="empty-state">
          <div className="empty-state-inner">
            <h2>Open a folder to manage environments.</h2>
            <p>Environment variables and runtimes are stored per project.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel environments-panel">
      <div className="panel-header">
        <Layers size={16} />
        <span className="panel-title">Environments</span>
      </div>
      <div className="environments-layout">
        <aside className="environment-list">
          {envs.map((env) => (
            <EnvironmentCard
              key={env.id}
              env={env}
              selected={selected?.id === env.id}
              onSelect={() => setSelectedId(env.id)}
              onActivate={() => activate(env)}
              onDuplicate={() => duplicate(env)}
              onDelete={() => deleteEnv(env)}
            />
          ))}
          {!envs.length && <div className="muted-text">No environments yet.</div>}
          {newOpen ? (
            <div className="new-env-form">
              <input value={draft.name} onChange={(event) => setDraft((state) => ({ ...state, name: event.target.value }))} placeholder="e.g. development" />
              <select value={draft.type} onChange={(event) => setDraft((state) => ({ ...state, type: event.target.value }))}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select value={draft.copyFromId} onChange={(event) => setDraft((state) => ({ ...state, copyFromId: event.target.value }))}>
                <option value="">Copy from...</option>
                {envs.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
              <div className="chat-input-actions">
                <button className="primary-button" onClick={createEnv}>Create</button>
                <button onClick={() => setNewOpen(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="primary-button" onClick={() => setNewOpen(true)}>
              <Plus size={14} /> New Environment
            </button>
          )}
        </aside>

        <main className="environment-detail">
          {!selected ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <h2>Create an environment</h2>
                <p>Named environments keep variables and runtime choices separate.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="environment-detail-header">
                <input
                  className="environment-name-input"
                  value={selected.name}
                  onChange={(event) => store.updateEnv(projectPath, selected.id, { name: event.target.value })}
                />
                <select value={selected.type} onChange={(event) => store.updateEnv(projectPath, selected.id, { type: event.target.value })}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <span className={`env-type-pill ${selected.type}`}>{selected.type}</span>
                <div className="top-bar-spacer" />
                <button onClick={() => activate(selected)} disabled={selected.isActive}>
                  <CheckCircle2 size={14} /> Activate
                </button>
                <button onClick={() => duplicate(selected)}>
                  <Copy size={14} /> Duplicate
                </button>
                <button className="danger-button" onClick={() => deleteEnv(selected)} disabled={selected.isActive}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              <div className="git-tabs">
                <button className={tab === 'variables' ? 'active' : ''} onClick={() => setTab('variables')}>
                  Variables
                </button>
                <button className={tab === 'runtime' ? 'active' : ''} onClick={() => setTab('runtime')}>
                  Runtime
                </button>
              </div>
              {tab === 'variables' ? (
                <div className="environment-tab">
                  <EnvVarTable env={selected} projectPath={projectPath} store={store} />
                  <EnvImportExport env={selected} projectPath={projectPath} store={store} />
                </div>
              ) : (
                <RuntimeSelector env={selected} projectPath={projectPath} store={store} />
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
