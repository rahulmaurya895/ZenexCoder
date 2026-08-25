import { Headphones, Mic, Play, RefreshCw, Save, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoiceStore } from '@/store/voiceStore';

const voices = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'sage', 'shimmer', 'verse'];

export default function VoiceSettings() {
  const [saved, setSaved] = useState(false);
  const openAiKey = useSettingsStore((state) => state.apiKeys.openai);
  const settings = useVoiceStore((state) => state.settings);
  const devices = useVoiceStore((state) => state.devices);
  const connected = useVoiceStore((state) => state.connected);
  const connectionState = useVoiceStore((state) => state.connectionState);
  const loading = useVoiceStore((state) => state.loading);
  const error = useVoiceStore((state) => state.error);
  const loadSettings = useVoiceStore((state) => state.loadSettings);
  const saveSettings = useVoiceStore((state) => state.saveSettings);
  const enumerateDevices = useVoiceStore((state) => state.enumerateDevices);
  const connect = useVoiceStore((state) => state.connect);
  const disconnect = useVoiceStore((state) => state.disconnect);

  useEffect(() => {
    loadSettings().catch(() => {});
  }, [loadSettings]);

  async function requestDeviceLabels() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    await enumerateDevices();
  }

  async function update(patch) {
    await saveSettings(patch);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className="settings-section voice-settings">
      <div className="panel-title">Realtime Voice</div>
      <div className="voice-settings-grid">
        <label>
          <span>Provider</span>
          <select value={settings.provider || 'web-speech'} onChange={(event) => update({ provider: event.target.value })}>
            <option value="web-speech">Free Web Speech API (100% Free / Zero Cost)</option>
            <option value="openai">OpenAI Realtime (Requires Paid API Key)</option>
            <option value="compatible">Compatible local WS</option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <input value={settings.model} onChange={(event) => update({ model: event.target.value })} placeholder="gpt-realtime-2" />
        </label>
        <label>
          <span>Voice</span>
          <select value={settings.voice} onChange={(event) => update({ voice: event.target.value })}>
            {voices.map((voice) => (
              <option value={voice} key={voice}>{voice}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Local / compatible endpoint</span>
          <input value={settings.endpoint} onChange={(event) => update({ endpoint: event.target.value })} placeholder="wss://api.openai.com/v1/realtime?model=..." />
        </label>
      </div>

      <label className="settings-row">
        <span>
          <strong>Use OpenAI key from API settings</strong>
          <small>{openAiKey ? 'OpenAI key is available.' : 'Add an OpenAI key in API Keys or enter one below.'}</small>
        </span>
        <input type="checkbox" checked={settings.useStoredOpenAiKey} onChange={(event) => update({ useStoredOpenAiKey: event.target.checked })} />
      </label>

      {!settings.useStoredOpenAiKey && (
        <label className="voice-key-field">
          <span>Realtime API key</span>
          <input type="password" value={settings.apiKey} onChange={(event) => update({ apiKey: event.target.value })} placeholder="sk-..." />
        </label>
      )}

      <div className="voice-device-grid">
        <label>
          <span><Mic size={13} /> Microphone</span>
          <select value={settings.inputDeviceId} onChange={(event) => update({ inputDeviceId: event.target.value })}>
            <option value="default">Default microphone</option>
            {devices.inputs.map((device) => (
              <option value={device.id} key={device.id}>{device.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span><Headphones size={13} /> Speaker</span>
          <select value={settings.outputDeviceId} onChange={(event) => update({ outputDeviceId: event.target.value })}>
            <option value="default">Default speaker</option>
            {devices.outputs.map((device) => (
              <option value={device.id} key={device.id}>{device.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="browser-error-banner">{error}</div>}

      <div className="chat-input-actions">
        <button onClick={requestDeviceLabels}>
          <RefreshCw size={14} /> Refresh Devices
        </button>
        <button className="primary-button" onClick={() => (connected ? disconnect() : connect())} disabled={loading}>
          {connected ? <Square size={14} /> : <Play size={14} />}
          {connected ? 'Disconnect' : 'Start Voice Session'}
        </button>
        <button onClick={() => update(settings)}>
          <Save size={14} /> Save
        </button>
        <span className={`computer-status ${connected ? 'active' : ''}`}>{connected ? connectionState : 'Disconnected'}</span>
        {saved && <span className="muted-text">Saved</span>}
      </div>
    </div>
  );
}
