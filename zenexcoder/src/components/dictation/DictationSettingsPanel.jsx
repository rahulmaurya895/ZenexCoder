import { Mic, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

const languages = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'hi-IN', label: 'Hindi (India)' },
  { id: 'ur-IN', label: 'Urdu/Hindi (India)' },
  { id: 'en-GB', label: 'English (UK)' }
];

export default function DictationSettingsPanel() {
  const [language, setLanguage] = useState('en-US');
  const [saved, setSaved] = useState(false);
  const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    window.zezenexcoderr.store
      .get('dictation:settings', { language: 'en-US' })
      .then((settings) => setLanguage(settings.language || 'en-US'))
      .catch(() => {});
  }, []);

  async function save() {
    await window.zezenexcoderr.store.set('dictation:settings', { language });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <Mic size={16} />
        <span className="panel-title">Dictation</span>
        <span className={`computer-status ${supported ? 'active' : ''}`}>{supported ? 'Available' : 'Unavailable'}</span>
      </div>
      <div className="settings-grid">
        <div className="settings-section">
          <label className="settings-row">
            <span>
              <strong>Language / dialect</strong>
              <small>Used by the browser SpeechRecognition engine for chat prompt dictation.</small>
            </span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languages.map((item) => (
                <option value={item.id} key={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className="chat-input-actions">
            <button className="primary-button" onClick={save}>
              <Save size={14} /> Save
            </button>
            {saved && <span className="muted-text">Saved</span>}
          </div>
          {!supported && <div className="browser-error-banner">SpeechRecognition is not available in this Chromium build.</div>}
        </div>
      </div>
    </section>
  );
}
