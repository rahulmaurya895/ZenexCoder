import { useState } from 'react';
import { CornerDownLeft, ListPlus } from 'lucide-react';
import { useAgentStore } from '@/store/agentStore';
import { useAppStore } from '@/store/appStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * @param {{onQueue?: (content: string) => void, onSteer?: (content: string) => void}} props
 */
export default function FollowUpBar({ onQueue, onSteer }) {
  const [value, setValue] = useState('');
  const workMode = useAppStore((state) => state.workMode);
  const defaults = useSettingsStore((state) => state.aiSettings.followUpDefault);
  const runState = useAgentStore((state) => state.runState);
  const addFollowUp = useAgentStore((state) => state.addFollowUp);
  const insertSteerStep = useAgentStore((state) => state.insertSteerStep);
  const defaultMode = defaults?.[workMode] || 'queue';

  function send(mode = defaultMode) {
    const content = value.trim();
    if (!content) return;
    if (mode === 'steer') {
      if (['running', 'paused'].includes(runState)) {
        insertSteerStep(content);
      }
      onSteer?.(content);
    } else {
      addFollowUp(content, 'queue');
      onQueue?.(content);
    }
    setValue('');
  }

  return (
    <div className="follow-up-bar">
      <textarea
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send(event.ctrlKey || event.metaKey ? (defaultMode === 'queue' ? 'steer' : 'queue') : defaultMode);
          }
        }}
        placeholder="Add a follow-up instruction..."
      />
      <div className="chat-input-actions">
        <button onClick={() => send('queue')}>
          <ListPlus size={14} /> Queue
        </button>
        <button className="primary-button" onClick={() => send('steer')}>
          <CornerDownLeft size={14} /> Steer
        </button>
      </div>
    </div>
  );
}
