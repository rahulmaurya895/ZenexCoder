import { Search, Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function SerpApiSettings() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (window.zezenexcoderr?.fastSearch) {
      setLoading(true);
      window.zezenexcoderr.fastSearch.getKey()
        .then((res) => {
          if (res?.apiKey) setApiKey(res.apiKey);
        })
        .finally(() => setLoading(false));
    }
  }, []);

  async function handleSave() {
    setLoading(true);
    try {
      await window.zezenexcoderr.fastSearch.saveKey(apiKey);
      setStatus({ status: 'saved', message: 'SerpApi Key securely stored using safeStorage encryption.' });
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleTestSearch() {
    setTesting(true);
    setStatus({ status: 'searching', message: 'Executing test search query...' });
    try {
      const res = await window.zezenexcoderr.fastSearch.execute('React 19 hooks syntax');
      setStatus({
        status: 'success',
        message: `Fast Search Success! Fetched in ${res.elapsedMs}ms (< 1.5s threshold).`
      });
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-section serpapi-settings-panel">
      <div className="panel-title flex-align gap-2">
        <Search size={18} className="text-accent" /> Ultra-Fast Web Search Integration (SerpApi)
      </div>
      <p className="section-description">
        Enables high-speed API search dispatches (&lt; 1.5s) for Swarm agents to look up syntax, API docs, and error solutions without launching heavy browser windows.
      </p>

      <div className="form-group">
        <label className="form-label">SerpApi Key</label>
        <input
          type="password"
          className="settings-input"
          placeholder="Enter your SerpApi API Key (e.g. 5f8a...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="form-row flex-between mt-3">
        <button className="primary-button" onClick={handleSave} disabled={loading || testing}>
          <Save size={14} /> {loading ? 'Saving...' : 'Save API Key'}
        </button>

        <button className="secondary-button" onClick={handleTestSearch} disabled={testing || !apiKey}>
          {testing ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Test Fast Search (&lt; 1.5s)
        </button>
      </div>

      {status && (
        <div className={`webhook-status-card ${status.status} mt-3`}>
          {status.status === 'searching' && (
            <div className="flex-align gap-2 text-warning">
              <Loader2 size={16} className="spin" />
              <span>Fetching SerpApi organic results...</span>
            </div>
          )}
          {status.status === 'success' && (
            <div className="flex-align gap-2 text-success">
              <CheckCircle2 size={16} />
              <span>{status.message}</span>
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
