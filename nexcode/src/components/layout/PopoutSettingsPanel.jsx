import { Keyboard, PanelTopOpen, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWindowStore } from '@/store/windowStore';

export default function PopoutSettingsPanel() {
  const hotkey = useWindowStore((state) => state.popoutHotkey);
  const visible = useWindowStore((state) => state.popoutVisible);
  const registered = useWindowStore((state) => state.popoutHotkeyRegistered);
  const loading = useWindowStore((state) => state.loading);
  const error = useWindowStore((state) => state.error);
  const loadPopoutState = useWindowStore((state) => state.loadPopoutState);
  const setPopoutHotkey = useWindowStore((state) => state.setPopoutHotkey);
  const togglePopout = useWindowStore((state) => state.togglePopout);
  const [draft, setDraft] = useState(hotkey);

  useEffect(() => {
    loadPopoutState().catch(() => {});
  }, [loadPopoutState]);

  useEffect(() => {
    setDraft(hotkey);
  }, [hotkey]);

  return (
    <section className="panel">
      <div className="panel-header">
        <PanelTopOpen size={16} />
        <span className="panel-title">Popout Window</span>
        <span className={`computer-status ${visible ? 'active' : ''}`}>{visible ? 'Visible' : 'Hidden'}</span>
      </div>

      <div className="settings-grid">
        <div className="settings-section">
          <label className="settings-row">
            <span>
              <strong>Global hotkey</strong>
              <small>Electron shortcut string, for example Alt+Space or Ctrl+Space.</small>
            </span>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <div className="chat-input-actions">
            <button className="primary-button" disabled={loading || !draft.trim()} onClick={() => setPopoutHotkey(draft.trim())}>
              <Save size={14} /> Save Hotkey
            </button>
            <button onClick={() => togglePopout()} disabled={loading}>
              <PanelTopOpen size={14} /> Toggle Popout
            </button>
          </div>
          <div className="environment-grid">
            <div>
              <span>Registered</span>
              <strong>{registered ? 'Yes' : 'No'}</strong>
            </div>
            <div>
              <span>Current shortcut</span>
              <strong>
                <Keyboard size={13} /> {hotkey}
              </strong>
            </div>
          </div>
          {error && <div className="browser-error-banner">{error}</div>}
        </div>
      </div>
    </section>
  );
}
