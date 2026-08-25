import { Link, Plus, RefreshCcw, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import HookCard from './HookCard';
import HookEditor from './HookEditor';
import { useAutomationStore } from '@/store/automationStore';
import { useHookStore } from '@/store/hookStore';
import { useProjectStore } from '@/store/projectStore';

const gitHookTypes = ['pre-commit', 'pre-push'];

export default function HooksPanel() {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const projectPath = useProjectStore((state) => state.projectPath);
  const automations = useAutomationStore((state) => state.automations);
  const hooks = useHookStore((state) => state.hooks);
  const installed = useHookStore((state) => state.installed);
  const server = useHookStore((state) => state.server);
  const loading = useHookStore((state) => state.loading);
  const error = useHookStore((state) => state.error);
  const loadHooks = useHookStore((state) => state.loadHooks);
  const saveHook = useHookStore((state) => state.saveHook);
  const deleteHook = useHookStore((state) => state.deleteHook);
  const setHookEnabled = useHookStore((state) => state.setHookEnabled);
  const refreshInstalled = useHookStore((state) => state.refreshInstalled);
  const installGitHook = useHookStore((state) => state.installGitHook);
  const removeGitHook = useHookStore((state) => state.removeGitHook);
  const registerProject = useHookStore((state) => state.registerProject);

  useEffect(() => {
    loadHooks().catch(() => {});
  }, [loadHooks]);

  useEffect(() => {
    if (!projectPath) return;
    registerProject(projectPath).catch(() => {});
  }, [projectPath, registerProject]);

  async function save(draft) {
    await saveHook(draft);
    setEditing(null);
  }

  async function withBusy(label, fn) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  }

  const gitHooks = Object.fromEntries(gitHookTypes.map((type) => [type, installed?.[type]?.installed]));

  return (
    <section className="panel hooks-panel">
      <div className="panel-header">
        <Link size={16} />
        <span className="panel-title">Hooks</span>
        <span className={`computer-status ${server.running ? 'active' : ''}`}>
          {server.running ? `127.0.0.1:${server.port}` : 'Server offline'}
        </span>
      </div>

      <div className="hooks-layout">
        <div className="hooks-control">
          <div className="settings-section">
            <div className="panel-title">
              <Server size={14} /> Local Webhook Server
            </div>
            <div className="hook-server-url">{server.url || 'Waiting for app boot...'}</div>
            <div className="chat-input-actions">
              <button onClick={() => loadHooks()}>
                <RefreshCcw size={14} /> Refresh
              </button>
              <button disabled={!projectPath} onClick={() => projectPath && registerProject(projectPath)}>
                <ShieldCheck size={14} /> Register Project Port
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="panel-title">Physical Git Hooks</div>
            {gitHookTypes.map((hookType) => (
              <div className="git-hook-install-row" key={hookType}>
                <span>{hookType}</span>
                <strong>{gitHooks[hookType] ? 'Installed' : 'Not installed'}</strong>
                {gitHooks[hookType] ? (
                  <button
                    disabled={!projectPath || busy === hookType}
                    onClick={() => withBusy(hookType, () => removeGitHook(projectPath, hookType))}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    disabled={!projectPath || busy === hookType}
                    onClick={() => withBusy(hookType, () => installGitHook(projectPath, hookType))}
                  >
                    Install
                  </button>
                )}
              </div>
            ))}
            {!projectPath && <div className="muted-text">Open a Git project to install physical hooks.</div>}
          </div>

          <button className="primary-button" onClick={() => setEditing({})}>
            <Plus size={14} /> Add Hook
          </button>
          {error && <div className="browser-error-banner">{error}</div>}
        </div>

        <div className="hooks-list">
          {editing && <HookEditor hook={editing.id ? editing : undefined} onSave={save} onCancel={() => setEditing(null)} />}
          {loading && <div className="muted-text">Loading hooks...</div>}
          {!loading && !hooks.length && !editing && <div className="muted-text compact-empty">No hooks configured yet.</div>}
          {hooks.map((hook) => (
            <HookCard
              key={hook.id}
              hook={hook}
              automations={automations}
              installed={installed}
              projectPath={projectPath}
              onToggle={() => setHookEnabled(hook.id, !hook.enabled)}
              onEdit={() => setEditing(hook)}
              onDelete={() => deleteHook(hook.id)}
              onInstall={() => withBusy(hook.eventType, () => installGitHook(projectPath, hook.eventType))}
              onRemove={() => withBusy(hook.eventType, () => removeGitHook(projectPath, hook.eventType))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
