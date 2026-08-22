import { DatabaseZap } from 'lucide-react';
import { useKnowledgeStore } from '@/store/knowledgeStore';

export default function SyncStatusWidget() {
  const syncing = useKnowledgeStore((state) => state.syncing);
  const progress = useKnowledgeStore((state) => state.progress);
  if (!syncing || !progress) return null;
  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 8;
  return (
    <div className="sync-status-widget" title={progress.status || 'Indexing knowledge graph'}>
      <DatabaseZap size={14} />
      <span>{progress.total ? `${progress.current}/${progress.total}` : 'Indexing'}</span>
      <div className="sync-status-track">
        <div className="sync-status-fill" style={{ width: `${Math.max(8, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
