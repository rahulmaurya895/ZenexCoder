import { Plug } from 'lucide-react';
import { useEffect } from 'react';
import ConnectionCard from '@/components/connections/ConnectionCard';
import { useConnectionsStore } from '@/store/connectionsStore';

/**
 * @param {{onOpenRoute: (route: string) => void}} props
 */
export default function ConnectionsHub({ onOpenRoute }) {
  const registry = useConnectionsStore((state) => state.registry);
  const load = useConnectionsStore((state) => state.load);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <section className="panel">
      <div className="panel-header">
        <Plug size={16} />
        <span className="panel-title">Connections</span>
      </div>
      <div className="panel-body connections-grid">
        {registry.map((entry) => (
          <ConnectionCard key={entry.id} entry={entry} onOpen={onOpenRoute} />
        ))}
      </div>
    </section>
  );
}
