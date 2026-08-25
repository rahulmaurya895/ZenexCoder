import { Play, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useOllama } from '@/hooks/useOllama';
import GitStatusBadge from '@/components/git/GitStatusBadge';
import EnvActiveBadge from '@/components/environments/EnvActiveBadge';

/**
 * @param {{onOpenGit?: () => void, onOpenEnvironment?: () => void}} props
 */
export default function StatusBar({ onOpenGit, onOpenEnvironment }) {
  const ollamaStatus = useAppStore((state) => state.ollamaStatus);
  const activeModel = useAppStore((state) => state.activeModel);
  const lastResponseMs = useAppStore((state) => state.lastResponseMs);
  const notice = useAppStore((state) => state.notice);
  const pendingReviewCount = useAppStore((state) => state.pendingReviewCount);
  const { refresh, startOllama, runningModels } = useOllama();
  const activeRunning = runningModels.find((model) => model.name === activeModel.modelId);

  return (
    <footer className="status-bar">
      <span className={`status-dot ${ollamaStatus}`} />
      <span>Ollama {ollamaStatus}</span>
      {ollamaStatus !== 'running' && ollamaStatus !== 'not-installed' && (
        <button style={{ height: 20 }} onClick={() => startOllama().then(refresh)} title="Start Ollama">
          <Play size={12} /> Start
        </button>
      )}
      <span>Active Model: {activeModel.modelId || 'No model loaded'}</span>
      <span>RAM: {activeRunning?.size_vram ? `${Math.round(activeRunning.size_vram / 1024 / 1024 / 1024)} GB` : 'unknown'}</span>
      <span>Response: {lastResponseMs ? `${(lastResponseMs / 1000).toFixed(1)}s` : 'idle'}</span>
      {pendingReviewCount > 0 && <span>Review: {pendingReviewCount} pending</span>}
      {notice && <span>{notice}</span>}
      <span style={{ marginLeft: 'auto' }} />
      <EnvActiveBadge onOpen={onOpenEnvironment} />
      <GitStatusBadge onOpen={onOpenGit} />
      <button className="icon-button" style={{ height: 20, minWidth: 24, width: 24 }} onClick={refresh} title="Refresh status">
        <RefreshCw size={12} />
      </button>
    </footer>
  );
}
