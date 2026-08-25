import { Cpu, HardDrive, Laptop, Monitor, Network, PlugZap, Server, Unplug } from 'lucide-react';
import { useMemo } from 'react';

function platformIcon(platform = '') {
  if (platform.includes('win')) return Monitor;
  if (platform.includes('darwin')) return Laptop;
  if (platform.includes('linux')) return Server;
  return Network;
}

function Sparkline({ values = [] }) {
  const points = values.slice(-18);
  if (points.length < 2) {
    return <div className="sparkline empty" />;
  }
  const width = 96;
  const height = 28;
  const max = 100;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (Math.max(0, Math.min(max, value)) / max) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function statValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${value}%`;
}

export default function NodeCard({ node, onConnect, onDisconnect, onUseForAI, onUseForIndexing }) {
  const Icon = platformIcon(node.platform);
  const cpuHistory = node.cpuHistory || (node.hardware?.cpuLoad !== undefined ? [node.hardware.cpuLoad] : []);
  const ramHistory = node.ramHistory || (node.hardware?.ramLoad !== undefined ? [node.hardware.ramLoad] : []);
  const gpuLoad = node.hardware?.gpu?.gpuLoad;
  const address = [node.ip, node.port].filter(Boolean).join(':');
  const connected = Boolean(node.connected);
  const hardware = node.hardware || {};
  const subtitle = useMemo(() => {
    if (node.role === 'master') return 'This device';
    if (connected) return `Ping ${node.pingMs ?? 'n/a'}ms`;
    return node.status || 'discovered';
  }, [connected, node.pingMs, node.role, node.status]);

  return (
    <article className={`cluster-node-card ${connected ? 'connected' : ''}`}>
      <div className="cluster-node-header">
        <Icon size={18} />
        <div>
          <h3>{node.hostname || 'Unknown node'}</h3>
          <span>{subtitle}</span>
        </div>
        <strong>{node.role === 'master' ? 'Master' : connected ? 'Worker' : 'Found'}</strong>
      </div>

      <div className="cluster-node-meta">
        <span>{address || 'local'}</span>
        <span>{node.platform || hardware.platform || 'unknown OS'}</span>
      </div>

      <div className="cluster-stats-grid">
        <div>
          <span><Cpu size={12} /> CPU</span>
          <strong>{statValue(hardware.cpuLoad)}</strong>
          <Sparkline values={cpuHistory} />
        </div>
        <div>
          <span><HardDrive size={12} /> RAM</span>
          <strong>{statValue(hardware.ramLoad)}</strong>
          <Sparkline values={ramHistory} />
        </div>
      </div>

      <div className="cluster-gpu-line">
        <PlugZap size={13} />
        <span>{hardware.gpu?.name || 'GPU stats unavailable'}</span>
        <strong>{gpuLoad === null || gpuLoad === undefined ? 'n/a' : `${gpuLoad}%`}</strong>
      </div>

      {node.role !== 'master' ? (
        <div className="cluster-node-actions">
          {connected ? (
            <button type="button" onClick={() => onDisconnect(node.nodeId)}>
              <Unplug size={14} /> Disconnect
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => onConnect(node)}>
              <Network size={14} /> Connect
            </button>
          )}
          <label className="check-row compact">
            <input type="checkbox" checked={Boolean(node.useForAI)} disabled={!connected} onChange={(event) => onUseForAI(node.nodeId, event.target.checked)} />
            Use for AI generation
          </label>
          <label className="check-row compact">
            <input type="checkbox" checked={Boolean(node.useForIndexing)} disabled={!connected} onChange={(event) => onUseForIndexing(node.nodeId, event.target.checked)} />
            Use for background indexing
          </label>
        </div>
      ) : null}
    </article>
  );
}
