import { useEffect, useState } from 'react';
import { FlaskConical, FolderOpen, Github, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useIncidentStore } from '@/store/incidentStore';
import { useProjectStore } from '@/store/projectStore';

function mergeNested(target, key, patch) {
  return { ...target, [key]: { ...(target[key] || {}), ...patch } };
}

export default function IntegrationSettings() {
  const settings = useIncidentStore((state) => state.settings);
  const github = useIncidentStore((state) => state.github);
  const fetching = useIncidentStore((state) => state.fetching);
  const saving = useIncidentStore((state) => state.saving);
  const saveSettings = useIncidentStore((state) => state.saveSettings);
  const saveGitHubToken = useIncidentStore((state) => state.saveGitHubToken);
  const fetchManual = useIncidentStore((state) => state.fetchManual);
  const projectPath = useProjectStore((state) => state.projectPath);
  const [draft, setDraft] = useState(settings);
  const [tokens, setTokens] = useState({
    sentry: '',
    datadogApi: '',
    datadogApp: '',
    generic: '',
    github: ''
  });

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function saveAll() {
    const patch = {
      ...draft,
      sentry: {
        ...draft.sentry,
        ...(tokens.sentry ? { token: tokens.sentry } : {})
      },
      datadog: {
        ...draft.datadog,
        ...(tokens.datadogApi ? { apiKey: tokens.datadogApi } : {}),
        ...(tokens.datadogApp ? { appKey: tokens.datadogApp } : {})
      },
      generic: {
        ...draft.generic,
        ...(tokens.generic ? { token: tokens.generic } : {})
      }
    };
    await saveSettings(patch);
    setTokens((state) => ({ ...state, sentry: '', datadogApi: '', datadogApp: '', generic: '' }));
  }

  async function saveGithub() {
    await saveGitHubToken(tokens.github);
    setTokens((state) => ({ ...state, github: '' }));
  }

  function useCurrentProject() {
    if (projectPath) {
      setDraft((state) => ({ ...state, projectPath }));
    }
  }

  async function injectMock() {
    await fetchManual({
      mockIncident: {
        title: 'TypeError: Cannot read properties of undefined',
        stackTrace:
          'TypeError: Cannot read properties of undefined\n    at getUserSession (src/auth/session.js:42:17)\n    at async GET (src/routes/api/me.js:11:12)'
      },
      autoHeal: draft.autoHealEnabled
    });
  }

  return (
    <section className="healing-settings">
      <div className="healing-settings-grid">
        <div className="settings-section">
          <div className="panel-title">Healing Control</div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.pollingEnabled}
              onChange={(event) => setDraft((state) => ({ ...state, pollingEnabled: event.target.checked }))}
            />
            Poll production telemetry
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.autoHealEnabled}
              onChange={(event) => setDraft((state) => ({ ...state, autoHealEnabled: event.target.checked }))}
            />
            Start healer automatically
          </label>
          <div className="form-row">
            <label>Interval</label>
            <input
              type="number"
              min="1"
              value={draft.pollIntervalMinutes}
              onChange={(event) => setDraft((state) => ({ ...state, pollIntervalMinutes: Number(event.target.value) || 1 }))}
            />
          </div>
          <div className="form-row">
            <label>Project</label>
            <div className="chat-input-actions">
              <input value={draft.projectPath || ''} onChange={(event) => setDraft((state) => ({ ...state, projectPath: event.target.value }))} />
              <button type="button" onClick={useCurrentProject} title="Use current project">
                <FolderOpen size={14} /> Current
              </button>
            </div>
          </div>
          <div className="form-row">
            <label>Base branch</label>
            <input value={draft.baseBranch || ''} onChange={(event) => setDraft((state) => ({ ...state, baseBranch: event.target.value }))} placeholder="HEAD" />
          </div>
          <div className="healing-model-row">
            <label>
              <span>Provider</span>
              <select value={draft.modelProvider || ''} onChange={(event) => setDraft((state) => ({ ...state, modelProvider: event.target.value }))}>
                <option value="">Coding default</option>
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="groq">Groq</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <input value={draft.modelId || ''} onChange={(event) => setDraft((state) => ({ ...state, modelId: event.target.value }))} placeholder="coding default" />
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="panel-title">Sentry</div>
          <div className="form-row">
            <label>Base URL</label>
            <input value={draft.sentry?.baseUrl || ''} onChange={(event) => setDraft((state) => mergeNested(state, 'sentry', { baseUrl: event.target.value }))} />
          </div>
          <div className="form-row">
            <label>Org</label>
            <input value={draft.sentry?.organizationSlug || ''} onChange={(event) => setDraft((state) => mergeNested(state, 'sentry', { organizationSlug: event.target.value }))} />
          </div>
          <div className="form-row">
            <label>Project</label>
            <input value={draft.sentry?.projectSlug || ''} onChange={(event) => setDraft((state) => mergeNested(state, 'sentry', { projectSlug: event.target.value }))} />
          </div>
          <div className="form-row">
            <label>PAT</label>
            <input
              type="password"
              value={tokens.sentry}
              onChange={(event) => setTokens((state) => ({ ...state, sentry: event.target.value }))}
              placeholder={draft.sentry?.hasToken ? 'Saved' : 'Sentry token'}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="panel-title">Datadog / Generic</div>
          <div className="form-row">
            <label>Datadog URL</label>
            <input value={draft.datadog?.apiUrl || ''} onChange={(event) => setDraft((state) => mergeNested(state, 'datadog', { apiUrl: event.target.value }))} />
          </div>
          <div className="form-row">
            <label>DD API Key</label>
            <input type="password" value={tokens.datadogApi} onChange={(event) => setTokens((state) => ({ ...state, datadogApi: event.target.value }))} placeholder={draft.datadog?.hasApiKey ? 'Saved' : 'API key'} />
          </div>
          <div className="form-row">
            <label>DD App Key</label>
            <input type="password" value={tokens.datadogApp} onChange={(event) => setTokens((state) => ({ ...state, datadogApp: event.target.value }))} placeholder={draft.datadog?.hasAppKey ? 'Saved' : 'App key'} />
          </div>
          <div className="form-row">
            <label>Generic URL</label>
            <input value={draft.generic?.apiUrl || ''} onChange={(event) => setDraft((state) => mergeNested(state, 'generic', { apiUrl: event.target.value }))} />
          </div>
          <div className="form-row">
            <label>Generic token</label>
            <input type="password" value={tokens.generic} onChange={(event) => setTokens((state) => ({ ...state, generic: event.target.value }))} placeholder={draft.generic?.hasToken ? 'Saved' : 'Token'} />
          </div>
        </div>

        <div className="settings-section">
          <div className="panel-title">GitHub</div>
          <div className="form-row">
            <label>PAT</label>
            <input
              type="password"
              value={tokens.github}
              onChange={(event) => setTokens((state) => ({ ...state, github: event.target.value }))}
              placeholder={github.hasToken ? 'Saved' : 'GitHub token'}
            />
          </div>
          <div className="chat-input-actions wrap">
            <button type="button" onClick={saveGithub} disabled={!tokens.github.trim()}>
              <Github size={14} /> Save GitHub
            </button>
            <button type="button" className="primary-button" onClick={saveAll} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => fetchManual()} disabled={fetching}>
              <RefreshCw size={14} /> {fetching ? 'Polling...' : 'Poll Now'}
            </button>
            <button type="button" onClick={injectMock}>
              <FlaskConical size={14} /> Mock
            </button>
          </div>
          <div className="healing-token-state">
            <ShieldCheck size={14} />
            <span>Sentry {draft.sentry?.hasToken ? 'saved' : 'missing'}</span>
            <span>GitHub {github.hasToken ? 'saved' : 'missing'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
