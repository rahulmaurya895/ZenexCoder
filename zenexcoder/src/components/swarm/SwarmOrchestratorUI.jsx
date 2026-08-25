import { CheckCircle2 } from 'lucide-react';
import { getSwarmNode, SWARM_GRAPH } from '@/utils/swarmPersonas';

/**
 * @param {{activePersonaId?: string | null, active?: boolean, consensus?: object | null, error?: string | null}} props
 */
export default function SwarmOrchestratorUI({ activePersonaId, active, consensus, error }) {
  const status = error ? 'halted' : consensus ? 'ready' : active ? 'running' : 'idle';
  const activeNode = activePersonaId ? getSwarmNode(activePersonaId) : null;
  return (
    <div className={`swarm-orchestrator ${status}`}>
      <div className="swarm-orchestrator-header">
        <span className="panel-title">SWARM</span>
        <span className={`swarm-status ${status}`}>
          {status === 'ready' ? <CheckCircle2 size={13} /> : null}
          {status === 'running'
            ? `⚡ ${activeNode?.name || activeNode?.shortName || 'Agent'} Working...`
            : status === 'ready'
            ? 'Consensus'
            : status === 'halted'
            ? 'Halted'
            : 'Idle'}
        </span>
      </div>

      <div className="swarm-graph" aria-label="Swarm agent flow">
        {SWARM_GRAPH.map((nodeId, index) => {
          const node = getSwarmNode(nodeId);
          const isActive = activePersonaId === nodeId;
          const isDone = consensus && index < SWARM_GRAPH.indexOf('user_approval');
          return (
            <div className="swarm-graph-step" key={nodeId}>
              <div
                className={`swarm-node ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                style={{ '--swarm-color': node?.avatarColor || 'var(--primary)' }}
                title={node?.name || nodeId}
              >
                <span>{node?.shortName || node?.name || nodeId}</span>
              </div>
              {index < SWARM_GRAPH.length - 1 ? <div className="swarm-edge" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
