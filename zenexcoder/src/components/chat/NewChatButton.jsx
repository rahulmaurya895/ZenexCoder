import { MessageSquarePlus } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAgentStore } from '@/store/agentStore';
import { useAppStore } from '@/store/appStore';

/**
 * @param {{onDone?: () => void}} props
 */
export default function NewChatButton({ onDone }) {
  const createSession = useChatStore((state) => state.createSession);
  const resetAgent = useAgentStore((state) => state.reset);
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);

  async function start() {
    await createSession();
    resetAgent();
    setRightPanelOpen(false);
    onDone?.();
  }

  return (
    <button className="nav-button" onClick={start} title="New Chat">
      <MessageSquarePlus size={16} />
      <span className="sidebar-label">New Chat</span>
    </button>
  );
}
