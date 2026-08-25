import { PanelTopOpen } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function WorkModeSettings() {
  const workMode = useAppStore((state) => state.workMode);
  const devToolsVisible = useAppStore((state) => state.devToolsVisible);
  const reviewMode = useAppStore((state) => state.reviewMode);
  const setDevToolsVisible = useAppStore((state) => state.setDevToolsVisible);
  const setReviewMode = useAppStore((state) => state.setReviewMode);
  const aiSettings = useSettingsStore((state) => state.aiSettings);
  const updateAiSettings = useSettingsStore((state) => state.updateAiSettings);
  const defaults = aiSettings.followUpDefault || { coding: 'steer', everyday: 'queue' };

  function setDefault(mode, value) {
    updateAiSettings({ followUpDefault: { ...defaults, [mode]: value } });
  }

  return (
    <div className="settings-section">
      <div className="panel-title">Work Mode</div>
      <div className="form-row">
        <label>Current mode</label>
        <span>{workMode === 'coding' ? 'For coding' : 'Everyday work'}</span>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={devToolsVisible}
          onChange={(event) => setDevToolsVisible(event.target.checked)}
        />
        <PanelTopOpen size={14} /> Show developer tools in Everyday mode
      </label>
      <div className="form-row">
        <label>Coding follow-up</label>
        <select value={defaults.coding || 'steer'} onChange={(event) => setDefault('coding', event.target.value)}>
          <option value="steer">Steer current run</option>
          <option value="queue">Queue after run</option>
        </select>
      </div>
      <div className="form-row">
        <label>Everyday follow-up</label>
        <select value={defaults.everyday || 'queue'} onChange={(event) => setDefault('everyday', event.target.value)}>
          <option value="queue">Queue after run</option>
          <option value="steer">Steer current run</option>
        </select>
      </div>
      <div className="form-row">
        <label>Code Review Mode</label>
        <select value={reviewMode} onChange={(event) => setReviewMode(event.target.value)}>
          <option value="inline">Inline</option>
          <option value="detached">Detached</option>
        </select>
      </div>
    </div>
  );
}
