import { Workflow, CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function N8nConfigPanel() {
  const [config, setConfig] = useState({
    workspaceUrl: '',
    webhookPath: '',
    authHeader: 'X-N8N-API-KEY',
    authToken: '',
    active: false
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (window.nexcode?.n8n) {
      setLoading(true);
      window.nexcode.n8n.getConfig()
        .then((saved) => {
          if (saved) setConfig(saved);
        })
        .finally(() => setLoading(false));

      const unbindStatus = window.nexcode.n8n.onStatusChanged((data) => {
        setStatus(data);
      });
      return () => unbindStatus?.();
    }
  }, []);

  async function handleSave() {
    setLoading(true);
    try {
      await window.nexcode.n8n.saveConfig(config);
      setStatus({ status: 'saved', message: 'n8n Configuration securely saved via safeStorage.' });
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleTestWebhook() {
    setTesting(true);
    setStatus({ status: 'sending', message: 'Firing test webhook payload...' });
    try {
      const res = await window.nexcode.n8n.triggerWebhook({
        task: 'Connection Test from NexCode Connections Hub',
        params: { test: true, triggeredBy: 'N8nConfigPanel' }
      });
      setStatus({ status: 'success', message: `Webhook HTTP 200 OK Response from ${res.url}` });
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-section n8n-config-panel">
      <div className="panel-title flex-align gap-2">
        <Workflow size={18} className="text-accent" /> n8n External Cloud Automations
      </div>
      <p className="section-description">
        Connect NexCode Swarm Architect to your n8n cloud workspace to trigger CI/CD pipelines and administrative workflows via webhooks.
      </p>

      <div className="form-group">
        <label className="form-label">n8n Workspace URL</label>
        <input
          type="url"
          className="settings-input"
          placeholder="https://n8n.your-cloud-instance.com"
          value={config.workspaceUrl}
          onChange={(e) => setConfig({ ...config, workspaceUrl: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Webhook Endpoint Path</label>
        <input
          type="text"
          className="settings-input"
          placeholder="webhook/nexcode-swarm-trigger"
          value={config.webhookPath}
          onChange={(e) => setConfig({ ...config, webhookPath: e.target.value })}
        />
      </div>

      <div className="form-row-grid">
        <div className="form-group">
          <label className="form-label">Auth Header Name</label>
          <input
            type="text"
            className="settings-input"
            placeholder="X-N8N-API-KEY"
            value={config.authHeader}
            onChange={(e) => setConfig({ ...config, authHeader: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Auth Secret Token</label>
          <input
            type="password"
            className="settings-input"
            placeholder="Enter secure API token / header secret"
            value={config.authToken}
            onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
          />
        </div>
      </div>

      <div className="form-row flex-between mt-3">
        <button className="primary-button" onClick={handleSave} disabled={loading || testing}>
          <Save size={14} /> {loading ? 'Saving...' : 'Save Configuration'}
        </button>

        <button className="secondary-button" onClick={handleTestWebhook} disabled={testing || !config.workspaceUrl || !config.webhookPath}>
          {testing ? <Loader2 size={14} className="spin" /> : <Workflow size={14} />} Test Webhook Trigger
        </button>
      </div>

      {/* Real-time Webhook Progress & Status Indicator */}
      {status && (
        <div className={`webhook-status-card ${status.status}`}>
          {status.status === 'sending' && (
            <div className="flex-align gap-2 text-warning">
              <Loader2 size={16} className="spin" />
              <span>Sending webhook payload to n8n cloud...</span>
            </div>
          )}
          {status.status === 'success' && (
            <div className="flex-align gap-2 text-success">
              <CheckCircle2 size={16} />
              <span>{status.message || 'Webhook HTTP 200 OK Success!'}</span>
            </div>
          )}
          {status.status === 'saved' && (
            <div className="flex-align gap-2 text-info">
              <CheckCircle2 size={16} />
              <span>{status.message}</span>
            </div>
          )}
          {status.status === 'error' && (
            <div className="flex-align gap-2 text-danger">
              <AlertCircle size={16} />
              <span>{status.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
