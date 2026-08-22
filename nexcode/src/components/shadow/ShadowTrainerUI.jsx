import { Cpu, Github, Loader2, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ShadowTrainerUI() {
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState('');
  const [reposInput, setReposInput] = useState('');
  const [training, setTraining] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (window.zenexcoder?.shadowAI) {
      window.zenexcoder.shadowAI.getProfile().then((p) => {
        if (p) {
          setProfile(p);
          if (Array.isArray(p.indexedRepos)) {
            setReposInput(p.indexedRepos.join(', '));
          }
        }
      });

      const unbind = window.zenexcoder.shadowAI.onStatusChanged((data) => {
        setStatus(data);
      });
      return () => unbind?.();
    }
  }, []);

  async function handleStartTraining() {
    if (!reposInput.trim()) return;
    const reposList = reposInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    setTraining(true);
    setStatus({ status: 'training_started', message: 'Analyzing GitHub commit AST heuristics...' });

    try {
      const res = await window.zenexcoder.shadowAI.train(reposList, token);
      if (res?.profile) {
        setProfile(res.profile);
      }
      setStatus({ status: 'success', message: 'Hyper-Personalized Style Profile generated successfully!' });
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setTraining(false);
    }
  }

  return (
    <div className="settings-section shadow-trainer-panel">
      <div className="panel-title flex-align gap-2">
        <Cpu size={18} className="text-accent" /> Hyper-Personalized Shadow AI (Style Baseline Trainer)
      </div>
      <p className="section-description">
        Train your local predictive autocomplete engine to mimic your exact variable casing (camelCase/snake_case), quote preferences (' vs "), and indentation habits. No raw code is stored plain text.
      </p>

      <div className="form-group">
        <label className="form-label flex-align gap-1">
          <Github size={14} /> GitHub Repositories for Style Analysis (comma separated)
        </label>
        <input
          type="text"
          className="settings-input"
          placeholder="e.g. facebook/react, vercel/next.js, your-org/your-repo"
          value={reposInput}
          onChange={(e) => setReposInput(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label">GitHub Personal Access Token (Optional for Private Repos)</label>
        <input
          type="password"
          className="settings-input"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>

      <div className="form-row flex-between mt-3">
        <button
          className="primary-button"
          onClick={handleStartTraining}
          disabled={training || !reposInput.trim()}
        >
          {training ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {training ? ' Analyzing AST Commits...' : ' Train Style Baseline'}
        </button>
      </div>

      {profile && (
        <div className="style-profile-card mt-3">
          <div className="flex-align gap-2 mb-2 font-bold text-accent">
            <Zap size={16} /> Active Coding Style Profile
          </div>
          <div className="grid-2-col text-sm">
            <div><strong>Indentation:</strong> {profile.indentStyle}</div>
            <div><strong>Quotes:</strong> {profile.quoteStyle === 'double' ? 'Double (")' : "Single (')"}</div>
            <div><strong>Casing:</strong> {profile.namingConvention}</div>
            <div><strong>Comments:</strong> {profile.commentStyle}</div>
          </div>
          {profile.lastTrainedAt && (
            <div className="text-xs text-subtle mt-2">
              Last trained: {new Date(profile.lastTrainedAt).toLocaleString()} ({profile.heuristics?.filesAnalyzed || 0} patch diffs parsed)
            </div>
          )}
        </div>
      )}

      {status && (
        <div className={`webhook-status-card ${status.status} mt-3`}>
          {training && (
            <div className="flex-align gap-2 text-warning">
              <Loader2 size={16} className="spin" />
              <span>{status.message || 'Extracting commit patch ASTs...'}</span>
            </div>
          )}
          {status.status === 'success' && (
            <div className="flex-align gap-2 text-success">
              <CheckCircle2 size={16} />
              <span>{status.message}</span>
            </div>
          )}
          {status.status === 'error' && (
            <div className="flex-align gap-2 text-danger">
              <span>{status.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
