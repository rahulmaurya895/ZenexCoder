import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useOllama } from '@/hooks/useOllama';
import { useAppStore } from '@/store/appStore';
import InstallWizard from './InstallWizard';
import ModelCard from './ModelCard';

export default function OllamaManager() {
  const ollamaStatus = useAppStore((state) => state.ollamaStatus);
  const {
    models,
    runningModels,
    recommendedModels,
    downloadProgress,
    refresh,
    pullModel,
    deleteModel,
    loadModel
  } = useOllama();

  const downloaded = useMemo(() => new Set(models.map((model) => model.name)), [models]);
  const running = useMemo(() => new Set(runningModels.map((model) => model.name)), [runningModels]);

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Ollama Manager</span>
        <button className="icon-button" onClick={refresh} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="panel-body ollama-grid">
        {ollamaStatus === 'not-installed' && <InstallWizard onDone={refresh} />}
        {recommendedModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            downloaded={downloaded.has(model.id)}
            running={running.has(model.id)}
            progress={downloadProgress[model.id]}
            onDownload={() => pullModel(model.id)}
            onLoad={() => loadModel(model.id).then(refresh)}
            onDelete={() => deleteModel(model.id).then(refresh)}
          />
        ))}
      </div>
    </section>
  );
}
