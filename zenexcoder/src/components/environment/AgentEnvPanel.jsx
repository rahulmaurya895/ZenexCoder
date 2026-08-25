import { useEffect } from 'react';
import { AlertTriangle, FolderOpen, Play, RefreshCcw, Shield, ShieldCheck, Square } from 'lucide-react';
import { useEnvIsolationStore } from '@/store/envIsolationStore';
import { useProjectStore } from '@/store/projectStore';

export default function AgentEnvPanel() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const openProject = useProjectStore((state) => state.openProject);
  const isolation = useEnvIsolationStore((state) => state.isolation);
  const running = useEnvIsolationStore((state) => state.running);
  const sandboxProjectPath = useEnvIsolationStore((state) => state.sandboxProjectPath);
  const bridgeDir = useEnvIsolationStore((state) => state.bridgeDir);
  const lastWsbPath = useEnvIsolationStore((state) => state.lastWsbPath);
  const feature = useEnvIsolationStore((state) => state.feature);
  const enableResult = useEnvIsolationStore((state) => state.enableResult);
  const loading = useEnvIsolationStore((state) => state.loading);
  const error = useEnvIsolationStore((state) => state.error);
  const load = useEnvIsolationStore((state) => state.load);
  const start = useEnvIsolationStore((state) => state.start);
  const stop = useEnvIsolationStore((state) => state.stop);
  const setIsolation = useEnvIsolationStore((state) => state.setIsolation);
  const enableFeature = useEnvIsolationStore((state) => state.enableFeature);
  const refreshFeature = useEnvIsolationStore((state) => state.refreshFeature);
  const sandboxActive = isolation === 'windows_sandbox';
  const featureReady = Boolean(feature?.executablePresent);
  const restartNeeded = Boolean(feature?.restartNeeded || (enableResult?.restartNeeded && !featureReady));

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function toggleIsolation(event) {
    if (event.target.checked) {
      await startOrEnable();
      return;
    }
    await stop();
  }

  async function approveFeatureEnable() {
    const ok = window.confirm(
      'ZenexCoder needs administrator approval to enable Windows Sandbox. Windows may ask for UAC permission and may require a restart. Continue?'
    );
    if (!ok) return null;
    return enableFeature();
  }

  async function startOrEnable() {
    if (!featureReady) {
      const result = await approveFeatureEnable();
      if (!result?.status?.executablePresent) {
        return result;
      }
    }
    if (!running) {
      return start(projectPath);
    }
    return setIsolation('windows_sandbox');
  }

  return (
    <section className="panel environment-panel">
      <div className="panel-header">
        <Shield size={16} />
        <span className="panel-title">Agent Environment</span>
        <span className={`computer-status ${sandboxActive && running ? 'active' : ''}`}>
          {sandboxActive && running ? 'Sandbox' : 'Host'}
        </span>
      </div>

      <div className="settings-grid">
        <div className="settings-section">
          <label className="settings-row">
            <span>
              <strong>Run Agent in Isolated Sandbox</strong>
              <small>{featureReady ? 'Windows Sandbox is ready for agent terminal steps.' : feature?.message || 'Windows Sandbox is not enabled yet.'}</small>
            </span>
            <input type="checkbox" checked={sandboxActive} disabled={!projectPath || loading} onChange={toggleIsolation} />
          </label>

          <div className={`sandbox-warning ${featureReady ? 'ready' : ''}`}>
            <AlertTriangle size={16} />
            <span>
              {featureReady
                ? 'Windows Sandbox executable is installed.'
                : feature?.likelyUnsupported
                  ? 'This Windows edition may not include Windows Sandbox. ZenexCoder can still try admin enable with approval.'
                  : 'ZenexCoder can enable the Windows Sandbox optional feature after your approval.'}
            </span>
          </div>

          <div className="environment-grid">
            <div>
              <span>Windows edition</span>
              <strong>{feature?.productName || 'Unknown'}</strong>
            </div>
            <div>
              <span>Sandbox feature</span>
              <strong>{restartNeeded ? `${feature?.state || 'Enabled'} - restart needed` : feature?.state || 'Unknown'}</strong>
            </div>
            <div>
              <span>Host project</span>
              <strong>{projectPath || 'No project open'}</strong>
            </div>
            <div>
              <span>Sandbox path</span>
              <strong>{sandboxProjectPath}</strong>
            </div>
            <div>
              <span>Bridge folder</span>
              <strong>{bridgeDir || 'Not created'}</strong>
            </div>
            <div>
              <span>WSB config</span>
              <strong>{lastWsbPath || 'Not generated'}</strong>
            </div>
          </div>

          <div className="chat-input-actions">
            <button onClick={() => openProject()}>
              <FolderOpen size={14} /> Open Project
            </button>
            <button disabled={featureReady || loading} onClick={approveFeatureEnable}>
              <ShieldCheck size={14} /> Enable Feature
            </button>
            <button className="primary-button" disabled={!projectPath || loading || restartNeeded} onClick={startOrEnable}>
              <Play size={14} /> Start Sandbox
            </button>
            <button className="danger-button" disabled={loading || !running} onClick={() => stop()}>
              <Square size={14} /> Stop
            </button>
            <button disabled={loading} onClick={() => Promise.all([load(), refreshFeature()])}>
              <RefreshCcw size={14} /> Refresh
            </button>
          </div>

          {restartNeeded && <div className="browser-error-banner">Windows Sandbox was enabled but Windows must restart before ZenexCoder can launch it.</div>}
          {enableResult?.message && !restartNeeded && <div className="sandbox-result-banner">{enableResult.message}</div>}
          {error && <div className="browser-error-banner">{error}</div>}
        </div>
      </div>
    </section>
  );
}
