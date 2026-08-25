import { Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useSpeculativeStore } from '@/store/speculativeStore';

export default function SpeculativeSettings() {
  const settings = useSpeculativeStore((state) => state.settings);
  const loadSettings = useSpeculativeStore((state) => state.loadSettings);
  const saveSettings = useSpeculativeStore((state) => state.saveSettings);

  useEffect(() => {
    loadSettings().catch(() => {});
  }, [loadSettings]);

  return (
    <div className="settings-section">
      <div className="panel-title">
        <Zap size={13} /> Speculative Execution
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => saveSettings({ enabled: event.target.checked })}
        />
        Enable Predictive Coding
      </label>
      <div className="form-row">
        <label>Max CPU usage before abort</label>
        <input
          type="number"
          min="30"
          max="95"
          value={settings.maxCpuPercent}
          onChange={(event) => saveSettings({ maxCpuPercent: Number(event.target.value) })}
        />
      </div>
      <div className="form-row">
        <label>Max memory usage before abort</label>
        <input
          type="number"
          min="40"
          max="95"
          value={settings.maxMemoryPercent}
          onChange={(event) => saveSettings({ maxMemoryPercent: Number(event.target.value) })}
        />
      </div>
      <div className="form-row">
        <label>Idle delay</label>
        <input
          type="number"
          min="1500"
          max="10000"
          step="500"
          value={settings.idleDelayMs}
          onChange={(event) => saveSettings({ idleDelayMs: Number(event.target.value) })}
        />
      </div>
      <div className="muted-text">Shadow runs abort immediately when you type again.</div>
    </div>
  );
}
