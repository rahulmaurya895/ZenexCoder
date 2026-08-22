import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { ollamaService, RECOMMENDED_MODELS } from '@/services/ollamaService';

export function useOllama() {
  const [models, setModels] = useState([]);
  const [runningModels, setRunningModels] = useState([]);
  const [downloadProgress, setDownloadProgress] = useState({});
  const setOllamaStatus = useAppStore((state) => state.setOllamaStatus);

  const refresh = useCallback(async () => {
    const status = await ollamaService.checkOllamaInstalled();
    setOllamaStatus(status.running ? 'running' : status.installed ? 'stopped' : 'not-installed', {
      ollamaVersion: status.version,
      hardware: status.hardware
    });
    if (status.running) {
      const [available, active] = await Promise.all([
        ollamaService.listModels().catch(() => []),
        ollamaService.getRunningModels().catch(() => ({ models: [] }))
      ]);
      setModels(available);
      setRunningModels(active.models || []);
    }
    return status;
  }, [setOllamaStatus]);

  useEffect(() => {
    refresh().catch(() => setOllamaStatus('stopped'));
    const interval = window.setInterval(() => {
      refresh().catch(() => {});
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh, setOllamaStatus]);

  const pullModel = useCallback((modelName) => {
    setDownloadProgress((state) => ({ ...state, [modelName]: { status: 'starting', percent: 0 } }));
    return ollamaService.pullModel(
      modelName,
      (progress) => setDownloadProgress((state) => ({ ...state, [modelName]: progress })),
      () => {
        setDownloadProgress((state) => ({ ...state, [modelName]: { status: 'ready', percent: 100 } }));
        refresh().catch(() => {});
      },
      (error) => setDownloadProgress((state) => ({ ...state, [modelName]: { status: 'error', message: error.message } }))
    );
  }, [refresh]);

  const installOllama = useCallback((handlers) => window.nexcode.ollama.install({}, handlers), []);

  return {
    models,
    runningModels,
    recommendedModels: RECOMMENDED_MODELS,
    downloadProgress,
    refresh,
    pullModel,
    installOllama,
    startOllama: ollamaService.startOllama,
    stopOllama: ollamaService.stopOllama,
    deleteModel: ollamaService.deleteModel,
    loadModel: ollamaService.loadModel
  };
}
