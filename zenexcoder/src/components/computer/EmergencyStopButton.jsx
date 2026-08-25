import { OctagonAlert } from 'lucide-react';
import { useAgentStore } from '@/store/agentStore';

export default function EmergencyStopButton({ onStop }) {
  async function stopNow() {
    await onStop?.();
    const agent = useAgentStore.getState();
    if (['running', 'paused'].includes(agent.runState)) {
      await agent.stop().catch(() => {});
    }
    await window.zezenexcoderr.ai?.abortAll?.('AI CONTROL TERMINATED').catch(() => {});
    await window.zezenexcoderr.notify?.show?.({ title: 'AI CONTROL TERMINATED', body: 'Computer Use controls locked.' }).catch(() => {});
  }

  return (
    <button className="computer-emergency-button" onClick={stopNow}>
      <OctagonAlert size={22} />
      EMERGENCY STOP (Esc x3)
    </button>
  );
}
