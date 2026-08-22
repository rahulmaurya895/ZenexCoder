import { Camera, Keyboard, MonitorPlay, MousePointer2, ShieldCheck, ShieldX } from 'lucide-react';
import { useComputerUse } from '@/hooks/useComputerUse';
import ComputerActionLog from './ComputerActionLog';
import EmergencyStopButton from './EmergencyStopButton';

export default function ComputerUsePanel() {
  const computer = useComputerUse();
  const screenSrc = computer.lastScreen?.base64 ? `data:image/jpeg;base64,${computer.lastScreen.base64}` : '';

  async function enableChanged(event) {
    await computer.setEnabled(event.target.checked);
  }

  return (
    <section className="panel computer-panel">
      <div className="panel-header">
        <MonitorPlay size={16} />
        <span className="panel-title">Computer Use</span>
        <span className={`computer-status ${computer.enabled && !computer.locked ? 'active' : ''}`}>
          {!computer.enabled ? 'Disabled' : computer.locked ? 'Locked' : 'Unlocked'}
        </span>
      </div>

      <div className="computer-layout">
        <div className="computer-control-surface">
          <label className="settings-row">
            <span>
              <strong>Enable Computer Use</strong>
              <small>Expose desktop screenshot, mouse, and keyboard tools to AI.</small>
            </span>
            <input type="checkbox" checked={computer.enabled} onChange={enableChanged} />
          </label>

          <label className="settings-row">
            <span>
              <strong>Allow unattended mouse/keyboard control for this session</strong>
              <small>Only affects Auto-review/Full access. Default mode still asks.</small>
            </span>
            <input
              type="checkbox"
              checked={computer.allowUnattended}
              disabled={!computer.enabled || computer.locked}
              onChange={(event) => computer.setUnattended(event.target.checked)}
            />
          </label>

          <div className="computer-button-grid">
            <button onClick={computer.unlock} disabled={!computer.enabled || !computer.locked}>
              <ShieldCheck size={14} /> Unlock Controls
            </button>
            <button onClick={() => computer.lock('manual')} disabled={!computer.enabled || computer.locked}>
              <ShieldX size={14} /> Lock Controls
            </button>
            <button onClick={computer.getScreen} disabled={!computer.enabled || computer.locked}>
              <Camera size={14} /> Test Screenshot
            </button>
          </div>

          <div className="computer-coordinate-card">
            <div>
              <MousePointer2 size={16} />
              <span>Mouse actions use absolute screen coordinates.</span>
            </div>
            <div>
              <Keyboard size={16} />
              <span>Keyboard actions type into the currently focused OS app.</span>
            </div>
          </div>

          <EmergencyStopButton onStop={() => computer.lock('emergency-button')} />
          {computer.error && <div className="browser-error-banner">{computer.error}</div>}
        </div>

        <div className="computer-preview">
          {screenSrc ? <img src={screenSrc} alt="Latest screen capture" /> : <div className="muted-text">Latest screenshot appears here.</div>}
        </div>

        <ComputerActionLog logs={computer.logs} />
      </div>
    </section>
  );
}
