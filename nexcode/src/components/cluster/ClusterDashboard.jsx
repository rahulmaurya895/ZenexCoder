import { Network, Radar, RefreshCw, Router, Zap } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useClusterStore } from '@/store/clusterStore';
import { summarizeClusterCapacity } from '@/utils/loadBalancer';
import NodeCard from './NodeCard';
import PairingModal from './PairingModal';

export default function ClusterDashboard() {
  const localNode = useClusterStore((state) => state.localNode);
  const nodes = useClusterStore((state) => state.nodes);
  const routing = useClusterStore((state) => state.routing);
  const loading = useClusterStore((state) => state.loading);
  const scanning = useClusterStore((state) => state.scanning);
  const error = useClusterStore((state) => state.error);
  const pairingNode = useClusterStore((state) => state.pairingNode);
  const load = useClusterStore((state) => state.load);
  const scanStart = useClusterStore((state) => state.scanStart);
  const requestPair = useClusterStore((state) => state.requestPair);
  const verifyPin = useClusterStore((state) => state.verifyPin);
  const cancelPairing = useClusterStore((state) => state.cancelPairing);
  const disconnect = useClusterStore((state) => state.disconnect);
  const setUseForAI = useClusterStore((state) => state.setUseForAI);
  const setUseForIndexing = useClusterStore((state) => state.setUseForIndexing);

  useEffect(() => {
    load().catch(() => {});
    scanStart().catch(() => {});
  }, [load, scanStart]);

  const capacity = useMemo(() => summarizeClusterCapacity(nodes), [nodes]);
  const connectedNodes = nodes.filter((node) => node.connected);
  const discoveredNodes = nodes.filter((node) => !node.connected);

  return (
    <section className="panel cluster-panel">
      <div className="panel-header">
        <Network size={15} />
        <span className="panel-title">Hardware Cluster</span>
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => load()} title="Refresh cluster state">
          <RefreshCw size={14} />
        </button>
        <button onClick={() => scanStart()} disabled={scanning}>
          <Radar size={14} /> {scanning ? 'Scanning' : 'Scan LAN'}
        </button>
      </div>

      <div className="panel-body cluster-body">
        {error ? <div className="git-error">{error}</div> : null}

        <section className="cluster-topology">
          <div className="topology-master">
            <Router size={22} />
            <strong>You (Master)</strong>
            <span>{localNode?.hostname || 'Local ZenexCoder'}</span>
          </div>
          <div className="topology-workers">
            {connectedNodes.length ? (
              connectedNodes.map((node) => (
                <div className="topology-link" key={node.nodeId}>
                  <div className="topology-line" />
                  <div className="topology-worker">
                    <Zap size={16} />
                    <strong>{node.hostname}</strong>
                    <span>{node.pingMs ?? 'n/a'}ms</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="topology-empty">No workers paired yet.</div>
            )}
          </div>
        </section>

        <section className="cluster-summary-grid">
          <div>
            <span>Connected workers</span>
            <strong>{capacity.connectedCount}</strong>
          </div>
          <div>
            <span>Primary GPU</span>
            <strong>{routing.primaryNodeId ? nodes.find((node) => node.nodeId === routing.primaryNodeId)?.hostname || 'Selected' : 'Local'}</strong>
          </div>
          <div>
            <span>Ollama route</span>
            <strong>{routing.ollamaOffloadEnabled ? 'Cluster' : 'Local'}</strong>
          </div>
          <div>
            <span>GPU worker</span>
            <strong>{capacity.hasGpuWorker ? 'Detected' : 'Pending'}</strong>
          </div>
        </section>

        <div className="cluster-layout">
          <section className="cluster-column">
            <div className="cluster-section-title">Local Node</div>
            {localNode ? (
              <NodeCard node={{ ...localNode, role: 'master' }} onConnect={requestPair} onDisconnect={disconnect} onUseForAI={setUseForAI} onUseForIndexing={setUseForIndexing} />
            ) : (
              <div className="muted-text">Loading local hardware...</div>
            )}
          </section>

          <section className="cluster-column">
            <div className="cluster-section-title">Workers</div>
            {loading ? <div className="muted-text">Loading cluster nodes...</div> : null}
            {!nodes.length && !loading ? <div className="muted-text">No ZenexCoder nodes found on LAN yet.</div> : null}
            {connectedNodes.map((node) => (
              <NodeCard key={node.nodeId} node={node} onConnect={requestPair} onDisconnect={disconnect} onUseForAI={setUseForAI} onUseForIndexing={setUseForIndexing} />
            ))}
            {discoveredNodes.map((node) => (
              <NodeCard key={node.nodeId} node={node} onConnect={requestPair} onDisconnect={disconnect} onUseForAI={setUseForAI} onUseForIndexing={setUseForIndexing} />
            ))}
          </section>
        </div>
      </div>

      <PairingModal node={pairingNode} onVerify={verifyPin} onClose={cancelPairing} />
    </section>
  );
}
