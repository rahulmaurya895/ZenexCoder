import { X } from 'lucide-react';
import ProgressTracker from '@/components/agent/ProgressTracker';
import ApprovalQueue from '@/components/agent/ApprovalQueue';
import { useAppStore } from '@/store/appStore';

export default function RightPanel() {
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);
  return (
    <aside className="panel right-panel">
      <div className="panel-header">
        <span className="panel-title">Agent Run</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => setRightPanelOpen(false)} title="Close progress panel">
          <X size={14} />
        </button>
      </div>
      <div className="panel-body">
        <ApprovalQueue />
        <ProgressTracker />
      </div>
    </aside>
  );
}
