export function chooseClusterRoute({ taskType = 'ollama', personaId = '', nodes = [], routing = {} } = {}) {
  if (!routing.ollamaOffloadEnabled || taskType !== 'ollama') {
    return { route: 'local', reason: 'offload_disabled' };
  }
  if (personaId === 'architect' && routing.keepArchitectLocal !== false) {
    return { route: 'local', reason: 'architect_local' };
  }
  const primary = nodes.find((node) => node.nodeId === routing.primaryNodeId && node.connected);
  if (!primary) {
    return { route: 'local', reason: 'no_connected_worker' };
  }
  return {
    route: 'remote',
    nodeId: primary.nodeId,
    reason: personaId ? `persona_${personaId}` : 'primary_gpu'
  };
}

export function summarizeClusterCapacity(nodes = []) {
  const connected = nodes.filter((node) => node.connected);
  const bestGpu = connected
    .filter((node) => node.hardware?.gpu?.name)
    .sort((a, b) => (b.hardware?.gpu?.gpuLoad ?? 0) - (a.hardware?.gpu?.gpuLoad ?? 0))[0];
  return {
    connectedCount: connected.length,
    hasGpuWorker: Boolean(bestGpu),
    bestGpuNodeId: bestGpu?.nodeId || ''
  };
}
