import { KeyRound, Lock, Unlock } from 'lucide-react';
import { useState } from 'react';

export default function E2EEStatus({ vault, status, onSetSecret }) {
  const [secret, setSecret] = useState('');
  const active = Boolean(status?.connected && vault?.ok);

  return (
    <section className={`e2ee-status ${active ? 'active' : ''}`}>
      <div>
        {active ? <Lock size={18} /> : <Unlock size={18} />}
        <span>
          <strong>{active ? 'E2EE Sync Active' : 'E2EE Setup Needed'}</strong>
          <small>{vault?.safeStorage ? 'Vault key protected by Electron safeStorage.' : 'safeStorage unavailable on this system.'}</small>
        </span>
      </div>
      <div className="e2ee-secret-row">
        <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Team vault secret" />
        <button onClick={() => onSetSecret(secret).then(() => setSecret(''))}>
          <KeyRound size={14} /> Set
        </button>
      </div>
      {status?.error ? <div className="learning-warning">{status.error}</div> : null}
    </section>
  );
}
