import { useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import ChatPanel from '@/components/chat/ChatPanel';
import { useWindowStore } from '@/store/windowStore';

export default function PopoutContainer() {
  const togglePopout = useWindowStore((state) => state.togglePopout);

  useEffect(() => {
    document.body.classList.add('popout-body');
    return () => document.body.classList.remove('popout-body');
  }, []);

  return (
    <div className="popout-shell">
      <div className="popout-titlebar">
        <div className="popout-title">
          <MessageSquare size={14} />
          <span>NexCode</span>
        </div>
        <button className="icon-button" onClick={() => togglePopout()} title="Hide popout">
          <X size={14} />
        </button>
      </div>
      <div className="popout-content">
        <ChatPanel />
      </div>
    </div>
  );
}
