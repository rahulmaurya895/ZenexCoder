function timeLabel(timestamp) {
  return new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function labelFor(entry) {
  const details = entry.details || {};
  if (entry.type === 'screenshot') return `Took screenshot (${details.width}x${details.height})`;
  if (entry.type === 'mouse_move') return `Moved mouse to (${details.x}, ${details.y})`;
  if (entry.type === 'mouse_click') return `${details.button || 'left'} click`;
  if (entry.type === 'mouse_double_click') return `${details.button || 'left'} double click`;
  if (entry.type === 'keyboard_type') return `Typed "${details.text || ''}"`;
  if (entry.type === 'keyboard_shortcut') return `Shortcut ${details.keys?.join(' + ') || ''}`;
  if (entry.type === 'locked') return `Locked controls (${details.reason || 'manual'})`;
  if (entry.type === 'unlocked') return 'Unlocked controls';
  if (entry.type === 'enabled') return 'Computer Use enabled';
  if (entry.type === 'disabled') return 'Computer Use disabled';
  if (entry.type === 'unattended') return `Unattended control ${details.allowUnattended ? 'allowed' : 'disabled'}`;
  return entry.type;
}

export default function ComputerActionLog({ logs = [] }) {
  return (
    <div className="computer-action-log">
      {logs.length ? logs.slice().reverse().map((entry) => (
        <div className="computer-log-row" key={entry.id}>
          <span>{timeLabel(entry.timestamp)}</span>
          <strong>{labelFor(entry)}</strong>
        </div>
      )) : <div className="muted-text">No computer actions yet.</div>}
    </div>
  );
}
