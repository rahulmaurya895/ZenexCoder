import React from 'react';
import ReactDOM from 'react-dom/client';
import { useEffect, useState } from 'react';
import App from './App.jsx';
import './index.css';
import 'highlight.js/styles/github-dark.css';

function FatalOverlay() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const onError = (event) => {
      const next = event?.error?.stack || event?.error?.message || event?.message || 'Unknown renderer error';
      console.error('FatalOverlay caught error:', next);
      setError(next);
    };
    const onRejection = (event) => {
      const next = event?.reason?.stack || event?.reason?.message || String(event?.reason || 'Unknown rejection');
      console.error('FatalOverlay caught unhandledrejection:', next);
      setError(next);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!error) return null;
  return (
    <div
      className="startup-error-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        padding: '32px',
        overflow: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
    >
      <div style={{ maxWidth: '800px', margin: '0 auto', background: '#1e293b', border: '1px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
        <h1 style={{ color: '#ef4444', marginTop: 0, fontSize: '20px' }}>⚠️ ZenexCoder Renderer Error</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>A runtime error occurred in the renderer process. Details are shown below:</p>
        <pre style={{ background: '#090d16', color: '#f87171', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', lineHeight: 1.5 }}>
          {error}
        </pre>
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
          <button
            style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
            onClick={() => setError(null)}
          >
            Dismiss Overlay
          </button>
        </div>
      </div>
    </div>
  );
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <FatalOverlay />
  </React.StrictMode>
);
