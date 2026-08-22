import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function PromptOptimizerToggle({ enabled = true, onChange }) {
  const [active, setActive] = useState(enabled);

  useEffect(() => {
    setActive(enabled);
  }, [enabled]);

  function toggle() {
    const next = !active;
    setActive(next);
    onChange?.(next);
  }

  return (
    <button
      className={`chip-btn flex-align gap-1 ${active ? 'active-sparkle' : ''}`}
      onClick={toggle}
      title={active ? 'Meta-Prompt Auto-Optimization ENABLED (<800ms XML CoT expansion)' : 'Click to enable Meta-Prompt Auto-Optimization'}
      type="button"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(59,130,246,0.2) 100%)' : undefined,
        borderColor: active ? '#7C3AED' : undefined,
        color: active ? '#A78BFA' : undefined
      }}
    >
      <Sparkles size={13} className={active ? 'text-accent animate-pulse' : ''} />
      <span>{active ? 'Auto-Prompt Mode' : 'Raw Prompt'}</span>
    </button>
  );
}
