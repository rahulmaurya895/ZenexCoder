import { Sun, Moon, Monitor, X } from 'lucide-react';
import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

export default function AppearanceSettings() {
  const appearance = useSettingsStore((state) => state.appearance || {
    verboseChat: true,
    conversationWidth: 'default',
    mode: 'dark',
    lightPreset: 'Default Light',
    lightBg: '#EEEEEE',
    lightFg: '#101010',
    lightAccent: '#007ACC',
    darkPreset: 'Default Dark',
    darkBg: '#101010',
    darkFg: '#CCCCCC',
    darkAccent: '#007ACC'
  });
  const saveSettings = useSettingsStore((state) => state.saveSettings);

  function update(patch) {
    const next = { ...appearance, ...patch };
    saveSettings({ appearance: next });
    applyTheme(next);
  }

  function applyTheme(cfg) {
    const root = document.documentElement;
    const mode = cfg.mode || 'dark';
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const bg = isDark ? cfg.darkBg : cfg.lightBg;
    const fg = isDark ? cfg.darkFg : cfg.lightFg;
    const accent = isDark ? cfg.darkAccent : cfg.lightAccent;

    root.style.setProperty('--bg', bg || (isDark ? '#101010' : '#EEEEEE'));
    root.style.setProperty('--surface', isDark ? '#181818' : '#FFFFFF');
    root.style.setProperty('--surface-2', isDark ? '#222222' : '#F3F3F3');
    root.style.setProperty('--text', fg || (isDark ? '#CCCCCC' : '#101010'));
    root.style.setProperty('--primary', accent || '#007ACC');
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    if (cfg.conversationWidth === 'narrow') {
      root.style.setProperty('--chat-max-width', '720px');
    } else if (cfg.conversationWidth === 'wide') {
      root.style.setProperty('--chat-max-width', '100%');
    } else {
      root.style.setProperty('--chat-max-width', '900px');
    }
  }

  useEffect(() => {
    applyTheme(appearance);
  }, []);

  return (
    <div className="appearance-modal-container">
      <div className="appearance-header">
        <div>
          <h2>Appearance</h2>
          <p>Configure the agent&apos;s visual theme and display preferences.</p>
        </div>
      </div>

      {/* Chat Settings Card */}
      <div className="appearance-section-title">Chat Settings</div>
      <div className="appearance-card">
        <div className="appearance-row border-bottom">
          <div className="appearance-info">
            <span className="row-label">Verbose Agent Chat</span>
            <span className="row-sub">Display and preserve intermediate thinking steps.</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appearance.verboseChat !== false}
              onChange={(e) => update({ verboseChat: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="appearance-row">
          <div className="appearance-info">
            <span className="row-label">Conversation Width</span>
            <span className="row-sub">Configure the maximum width of the conversation panel.</span>
          </div>
          <div className="segmented-control">
            <button
              className={`segmented-btn ${appearance.conversationWidth === 'default' || !appearance.conversationWidth ? 'active' : ''}`}
              onClick={() => update({ conversationWidth: 'default' })}
            >
              Default
            </button>
            <button
              className={`segmented-btn ${appearance.conversationWidth === 'narrow' ? 'active' : ''}`}
              onClick={() => update({ conversationWidth: 'narrow' })}
            >
              Narrow
            </button>
            <button
              className={`segmented-btn ${appearance.conversationWidth === 'wide' ? 'active' : ''}`}
              onClick={() => update({ conversationWidth: 'wide' })}
            >
              Wide
            </button>
          </div>
        </div>
      </div>

      {/* Appearance Mode */}
      <div className="appearance-section-title">Appearance</div>
      <div className="appearance-card">
        <div className="appearance-row">
          <div className="appearance-info">
            <span className="row-label">Appearance</span>
            <span className="row-sub">Select light, dark, or inherit system settings.</span>
          </div>
          <div className="icon-segmented-control">
            <button
              className={`icon-segmented-btn ${appearance.mode === 'system' ? 'active' : ''}`}
              title="System Settings"
              onClick={() => update({ mode: 'system' })}
            >
              <Monitor size={16} />
            </button>
            <button
              className={`icon-segmented-btn ${appearance.mode === 'light' ? 'active' : ''}`}
              title="Light Theme"
              onClick={() => update({ mode: 'light' })}
            >
              <Sun size={16} />
            </button>
            <button
              className={`icon-segmented-btn ${appearance.mode === 'dark' || !appearance.mode ? 'active' : ''}`}
              title="Dark Theme"
              onClick={() => update({ mode: 'dark' })}
            >
              <Moon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Light Theme Settings */}
      <div className="appearance-section-title">Light Theme</div>
      <div className="appearance-card">
        <div className="appearance-row border-bottom">
          <span className="row-label">Preset</span>
          <select
            className="appearance-select"
            value={appearance.lightPreset || 'Default Light'}
            onChange={(e) => update({ lightPreset: e.target.value })}
          >
            <option value="Default Light">Default Light</option>
            <option value="Soft Gray">Soft Gray</option>
            <option value="Warm Sand">Warm Sand</option>
          </select>
        </div>

        <div className="appearance-row border-bottom">
          <span className="row-label">Background</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.lightBg || '#EEEEEE'}
              onChange={(e) => update({ lightBg: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.lightBg || '#EEEEEE').replace('#', '') }</span>
          </div>
        </div>

        <div className="appearance-row border-bottom">
          <span className="row-label">Foreground</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.lightFg || '#101010'}
              onChange={(e) => update({ lightFg: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.lightFg || '#101010').replace('#', '') }</span>
          </div>
        </div>

        <div className="appearance-row">
          <span className="row-label">Accent</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.lightAccent || '#007ACC'}
              onChange={(e) => update({ lightAccent: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.lightAccent || '#007ACC').replace('#', '') }</span>
          </div>
        </div>
      </div>

      {/* Dark Theme Settings */}
      <div className="appearance-section-title">Dark Theme</div>
      <div className="appearance-card">
        <div className="appearance-row border-bottom">
          <span className="row-label">Preset</span>
          <select
            className="appearance-select"
            value={appearance.darkPreset || 'Default Dark'}
            onChange={(e) => update({ darkPreset: e.target.value })}
          >
            <option value="Default Dark">Default Dark</option>
            <option value="Oled Pitch Black">Oled Pitch Black</option>
            <option value="Midnight Blue">Midnight Blue</option>
          </select>
        </div>

        <div className="appearance-row border-bottom">
          <span className="row-label">Background</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.darkBg || '#101010'}
              onChange={(e) => update({ darkBg: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.darkBg || '#101010').replace('#', '') }</span>
          </div>
        </div>

        <div className="appearance-row border-bottom">
          <span className="row-label">Foreground</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.darkFg || '#CCCCCC'}
              onChange={(e) => update({ darkFg: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.darkFg || '#CCCCCC').replace('#', '') }</span>
          </div>
        </div>

        <div className="appearance-row">
          <span className="row-label">Accent</span>
          <div className="color-picker-input">
            <input
              type="color"
              value={appearance.darkAccent || '#007ACC'}
              onChange={(e) => update({ darkAccent: e.target.value.toUpperCase() })}
            />
            <span># { (appearance.darkAccent || '#007ACC').replace('#', '') }</span>
          </div>
        </div>
      </div>
    </div>
  );
}
