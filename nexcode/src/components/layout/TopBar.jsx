import { useState } from 'react';
import { Bell, Bot, Columns3, Eye, EyeOff, Moon, PanelRight, ShieldAlert, Sun } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/hooks/useTheme';
import WorkModeToggle from './WorkModeToggle';
import TokenMeter from './TokenMeter';
import SyncStatusWidget from '@/components/knowledge/SyncStatusWidget';

const CLOUD_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
    { id: 'o1-preview', name: 'o1 Reasoning' },
    { id: 'o3-mini', name: 'o3-mini Fast' }
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-haiku-20240307', name: 'Claude Haiku' }
  ],
  google: [
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Latest Flagship)' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Recommended)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fast)' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
    { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' }
  ]
};

export default function TopBar() {
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const activeModel = useAppStore((state) => state.activeModel);
  const setActiveModel = useAppStore((state) => state.setActiveModel);
  const toggleChatPanel = useAppStore((state) => state.toggleChatPanel);
  const toggleFileTree = useAppStore((state) => state.toggleFileTree);
  const toggleRightPanel = useAppStore((state) => state.toggleRightPanel);
  const workMode = useAppStore((state) => state.workMode);
  const devToolsVisible = useAppStore((state) => state.devToolsVisible);
  const setDevToolsVisible = useAppStore((state) => state.setDevToolsVisible);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const streamingAbort = useAppStore((state) => state.streamingAbort);
  const permissionMode = usePermissionsStore((state) => state.mode);
  const setPermissionMode = usePermissionsStore((state) => state.setMode);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const toggleCenter = useNotificationStore((state) => state.toggleCenter);
  const { theme, toggleTheme } = useTheme();

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const providers = [
    { id: 'google', name: 'Gemini (Recommended)' },
    { id: 'groq', name: 'Groq (Ultra-Fast)' },
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' }
  ];

  const providerModels = CLOUD_MODELS[activeModel.provider] || CLOUD_MODELS['google'];

  const hasCurrentModel = providerModels.some((item) => item.id === activeModel.modelId);
  const modelValue = hasCurrentModel ? activeModel.modelId : '__custom__';
  const customModelLabel = hasCurrentModel ? 'Custom model...' : 'Custom: ' + activeModel.modelId;
  const permissionLabels = {
    default: 'Default',
    'auto-review': 'Auto-review',
    'full-access': 'Full access'
  };

  return (
    <header className="top-bar">
      <button className="icon-button" onClick={toggleFileTree} title="Toggle file tree">
        <Columns3 size={16} />
      </button>
      <WorkModeToggle />
      <Bot size={16} />
      <select
        className="model-select"
        value={activeModel.provider}
        onChange={(event) => {
          const provider = event.target.value;
          const defaultModel = (provider === 'ollama' ? remoteOllamaModels[0] : CLOUD_MODELS[provider]?.[0]) || { id: provider, name: provider };
          setActiveModel({ provider, modelId: defaultModel.id, modelName: defaultModel.name });
        }}
        title="Provider"
      >
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name}
          </option>
        ))}
      </select>
      <select
        className="model-select"
        value={modelValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === '__custom__') {
            setCustomInput(activeModel.modelId || '');
            setCustomModalOpen(true);
            return;
          }
          const model = providerModels.find((item) => item.id === value);
          if (model) {
            setActiveModel({ ...activeModel, modelId: model.id, modelName: model.name });
          }
        }}
        title="Model"
      >
        {providerModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
        <option value="__custom__">{customModelLabel}</option>
      </select>
      {customModalOpen && (
        <div className="modal-backdrop" onClick={() => setCustomModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '380px', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
              Enter Custom Model ID
            </div>
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="e.g. gpt-4o, llama3:8b, mistral..."
              style={{ width: '100%', padding: '8px 12px', marginBottom: '16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="secondary-button" onClick={() => setCustomModalOpen(false)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  if (customInput.trim()) {
                    const modelId = customInput.trim();
                    setActiveModel({ ...activeModel, modelId, modelName: modelId });
                  }
                  setCustomModalOpen(false);
                }}
              >
                Set Model
              </button>
            </div>
          </div>
        </div>
      )}

      {isStreaming && (
        <button className="danger-button" onClick={() => streamingAbort?.()} title="Stop generation">
          Stop
        </button>
      )}
      <div className="top-bar-spacer" />
      <SyncStatusWidget />
      <TokenMeter />
      <button className="icon-button notification-bell" onClick={toggleCenter} title="Notifications">
        <Bell size={16} />
        {unreadCount > 0 && <span className="notification-badge">{Math.min(unreadCount, 99)}</span>}
      </button>
      {workMode === 'everyday' && (
        <button onClick={() => setDevToolsVisible(!devToolsVisible)} title="Show or hide developer tools">
          {devToolsVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          {devToolsVisible ? 'Hide Dev Tools' : 'Show Dev Tools'}
        </button>
      )}
      <div className="permission-switch">
        <button
          className={`permission-button ${permissionMode}`}
          onClick={() => setPermissionsOpen((value) => !value)}
          title="Permission mode"
        >
          <ShieldAlert size={14} /> {permissionLabels[permissionMode]}
        </button>
        {permissionsOpen && (
          <div className="permission-menu">
            {Object.entries(permissionLabels).map(([id, label]) => (
              <button
                key={id}
                className={permissionMode === id ? 'active' : ''}
                onClick={async () => {
                  await setPermissionMode(id);
                  setPermissionsOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="icon-button" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button className="icon-button" onClick={toggleRightPanel} title="Toggle progress panel">
        <PanelRight size={16} />
      </button>
      <button className="icon-button" onClick={toggleChatPanel} title="Toggle chat panel">
        <PanelRight size={16} />
      </button>
    </header>
  );
}
