import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';

export default function ChromeDownload() {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const appSettings = useSettingsStore(state => state.appSettings);
  const saveSettings = useSettingsStore(state => state.saveSettings);

  const installChrome = async () => {
    setInstalling(true);
    try {
      // Install Playwright Chrome channel
      await window.zenexcoder.app.runCommand('npx playwright install chrome');
      // Retrieve Chrome executable path via Playwright API
      const result = await window.zenexcoder.app.runCommand(`node -e "console.log(require('playwright').chromium.executablePath())"`);
      const chromePath = (result?.stdout || '').trim();
      if (chromePath) {
        await saveSettings({ appSettings: { ...appSettings, chromePath } });
        setInstalled(true);
      }
    } catch (e) {
      console.error('Chrome install failed', e);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="panel-title">Chrome Browser</div>
      <div className="form-row">
        <label>Chrome Path</label>
        <input type="text" value={appSettings.chromePath || ''} readOnly placeholder="Not set" />
      </div>
      <button className="primary-button" onClick={installChrome} disabled={installing || installed}>
        <Download size={14} /> {installing ? 'Installing…' : installed ? 'Installed' : 'Download & Set Chrome'}
      </button>
    </div>
  );
}
