import { Download, RotateCcw, Upload, ActivitySquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import ApiKeyManager from './ApiKeyManager';
import AppearanceSettings from './AppearanceSettings';
import N8nConfigPanel from '@/components/integrations/N8nConfigPanel';
import SerpApiSettings from '@/components/integrations/SerpApiSettings';
import ShadowTrainerUI from '@/components/shadow/ShadowTrainerUI';
import ChaosMonitor from '@/components/chaos/ChaosMonitor';
import ModelSettings from './ModelSettings';
import PermissionsSettings from './PermissionsSettings';
import WorkModeSettings from './WorkModeSettings';
import SpeculativeSettings from './SpeculativeSettings';
import VoiceSettings from '@/components/voice/VoiceSettings';
import ChromeDownload from './ChromeDownload';

export default function SettingsPanel() {
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const projectPath = useProjectStore((state) => state.projectPath);
  const appSettings = useSettingsStore((state) => state.appSettings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const state = useSettingsStore();

  const diagnosticsCards = useMemo(() => diagnostics?.cards || [], [diagnostics]);
  const diagnosticsSuggestions = useMemo(() => diagnostics?.suggestions || [], [diagnostics]);

  function exportSettings() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zezenexcoderr-settings.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSettings() {
    const [filePath] = await window.zezenexcoderr.file.openDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!filePath) return;
    const result = await window.zezenexcoderr.file.read(filePath);
    await saveSettings(JSON.parse(result.content));
  }

  async function runDiagnostics() {
    setDiagnosticsLoading(true);
    try {
      const report = await window.zezenexcoderr.app.runDiagnostics({ projectPath });
      setDiagnostics(report);
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Settings</span>
      </div>
      <div className="panel-body settings-grid">
        <div className="settings-section" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(147,51,234,0.08) 100%)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '24px' }}>⚡</div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#60A5FA' }}>ZenexCoder v1.0.0</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Autonomous AI-Native Desktop IDE & Multi-Agent Swarm Platform</div>
              </div>
            </div>
            <span style={{ fontSize: '11px', background: 'rgba(34,197,94,0.2)', color: '#4ADE80', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(34,197,94,0.3)' }}>MIT Licensed</span>
          </div>
          <div style={{ fontSize: '13px', marginTop: '10px', color: '#E5E7EB', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>👨‍💻 <strong>Creator & Architect:</strong> <span style={{ color: '#F3F4F6' }}>Raahool Mauryaa</span> <span style={{ color: '#9CA3AF' }}>(Independent Developer)</span></div>
            <div>🔗 <strong>Official Repository:</strong> <a href="https://github.com/rahulmaurya895/ZenexCoder" target="_blank" rel="noreferrer" style={{ color: '#38BDF8', textDecoration: 'underline' }}>github.com/rahulmaurya895/ZenexCoder</a></div>
            <div>🛡️ <strong>Copyright:</strong> © 2026 Raahool Mauryaa. All rights reserved.</div>
          </div>
        </div>
        <AppearanceSettings />
        <ChaosMonitor />
        <ShadowTrainerUI />
        <SerpApiSettings />
        <N8nConfigPanel />
        <ApiKeyManager />
        <PermissionsSettings />
        <SpeculativeSettings />
        <VoiceSettings />
        <WorkModeSettings />
        <ModelSettings />
        <div className="settings-section">
          <div className="panel-title">App Settings</div>
          <div className="form-row">
            <label>Language</label>
            <select value={appSettings.language} onChange={(event) => saveSettings({ appSettings: { ...appSettings, language: event.target.value } })}>
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
          <div className="form-row">
            <label>Start with OS</label>
            <input type="checkbox" checked={appSettings.startWithOs} onChange={(event) => saveSettings({ appSettings: { ...appSettings, startWithOs: event.target.checked } })} />
          </div>
          <div className="form-row">
            <label>Hardware Acceleration</label>
            <input type="checkbox" checked={appSettings.hardwareAcceleration} onChange={(event) => saveSettings({ appSettings: { ...appSettings, hardwareAcceleration: event.target.checked } })} />
          </div>
          <ChromeDownload />
          <div className="chat-input-actions">
            <button className="primary-button" onClick={runDiagnostics} disabled={diagnosticsLoading}>
              <ActivitySquare size={14} /> {diagnosticsLoading ? 'Running Checks...' : 'Run Full Audit'}
            </button>
            <button onClick={exportSettings}>
              <Download size={14} /> Export JSON
            </button>
            <button onClick={importSettings}>
              <Upload size={14} /> Import JSON
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                if (window.confirm('Factory reset the app? This will delete chats, snippets, automations, settings, and local caches.')) {
                  await resetSettings();
                  window.location.reload();
                }
              }}
            >
              <RotateCcw size={14} /> Factory Reset
            </button>
          </div>
          {diagnostics && (
            <div className="settings-section" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-title">Diagnostics Report</div>
              <small className="muted-text">Generated at {new Date(diagnostics.generatedAt).toLocaleString()}</small>
              <div className="diagnostics-summary-grid">
                <div className={`diagnostics-summary-card ${diagnostics.ok ? 'ok' : 'bad'}`}>
                  <strong>{diagnostics.ok ? 'All systems healthy' : 'Some checks failed'}</strong>
                  <span>{diagnostics.ok ? 'No major blockers detected.' : 'Review the failed cards and fix suggestions below.'}</span>
                </div>
              </div>
              <div className="diagnostics-list">
                {diagnosticsCards.map((item) => (
                  <div className={`diagnostics-item ${item.ok ? 'ok' : 'bad'}`} key={item.name}>
                    <strong>{item.ok ? 'OK' : 'FAIL'} · {item.name}</strong>
                    <span>{item.details}</span>
                  </div>
                ))}
              </div>
              {diagnosticsSuggestions.length > 0 && (
                <div className="diagnostics-suggestions">
                  <div className="panel-title">Auto-fix Suggestions</div>
                  {diagnosticsSuggestions.map((item) => (
                    <div className="diagnostics-suggestion" key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.suggestion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
