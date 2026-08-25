import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', label: 'Google Gemini', url: 'https://aistudio.google.com/app/apikey' },
  { id: 'groq', label: 'Groq', url: 'https://console.groq.com/keys' }
];

export default function ApiKeyManager() {
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const saveApiKey = useSettingsStore((state) => state.saveApiKey);
  const [visible, setVisible] = useState({});
  const [status, setStatus] = useState({});

  async function test(provider) {
    const result = await window.zezenexcoderr.ai.testProvider({ provider, apiKey: apiKeys[provider] });
    setStatus((state) => ({ ...state, [provider]: result }));
  }

  return (
    <div className="settings-section">
      <div className="panel-title">API Keys</div>
      {PROVIDERS.map((provider) => (
        <div className="form-row" key={provider.id}>
          <label>{provider.label}</label>
          <div className="chat-input-actions">
            <input
              type={visible[provider.id] ? 'text' : 'password'}
              value={apiKeys[provider.id] || ''}
              onChange={(event) => saveApiKey(provider.id, event.target.value)}
              placeholder={`${provider.label} API key`}
            />
            <button className="icon-button" onClick={() => setVisible((state) => ({ ...state, [provider.id]: !state[provider.id] }))}>
              {visible[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => test(provider.id)}>
              <KeyRound size={14} /> Test
            </button>
            <button onClick={() => saveApiKey(provider.id, apiKeys[provider.id] || '')}>
              <Save size={14} /> Save
            </button>
            <button onClick={() => window.zezenexcoderr.app.openExternal(provider.url)}>Get Key</button>
          </div>
          {status[provider.id] && (
            <span style={{ gridColumn: '2', color: status[provider.id].ok ? 'var(--success)' : 'var(--error)' }}>
              {status[provider.id].message}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
