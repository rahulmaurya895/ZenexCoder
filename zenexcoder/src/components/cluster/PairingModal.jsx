import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';

export default function PairingModal({ node, onVerify, onClose }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!node) return null;

  async function submit(event) {
    event.preventDefault();
    if (pin.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await onVerify(pin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="pairing-modal" onSubmit={submit}>
        <div className="pairing-modal-header">
          <div>
            <h2>Pair Worker</h2>
            <span>{node.hostname || node.ip}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Close pairing">
            <X size={14} />
          </button>
        </div>
        <label className="pairing-pin-field">
          <span>6-digit PIN shown on worker</span>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </label>
        {error ? <div className="git-error">{error}</div> : null}
        <div className="chat-input-actions">
          <button type="submit" className="primary-button" disabled={busy || pin.length !== 6}>
            <KeyRound size={14} /> {busy ? 'Verifying...' : 'Verify PIN'}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
