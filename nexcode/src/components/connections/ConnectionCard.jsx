import {
  Bell,
  Boxes,
  Cpu,
  FlaskConical,
  GitBranch,
  GitFork,
  GraduationCap,
  Globe,
  Layers,
  Link,
  Mic,
  Monitor,
  MonitorPlay,
  PanelTopOpen,
  Rocket,
  Server,
  Terminal,
  Users,
  Webhook
} from 'lucide-react';
import { useConnectionsStore } from '@/store/connectionsStore';

const icons = {
  Bell,
  Boxes,
  Cpu,
  FlaskConical,
  GitBranch,
  GitFork,
  GraduationCap,
  Globe,
  Layers,
  Link,
  Mic,
  Monitor,
  MonitorPlay,
  PanelTopOpen,
  Rocket,
  Server,
  Terminal,
  Users,
  Webhook
};

/**
 * @param {{entry: object, onOpen: (route: string) => void}} props
 */
export default function ConnectionCard({ entry, onOpen }) {
  const enabled = useConnectionsStore((state) => state.enabledIntegrations[entry.id]);
  const toggleIntegration = useConnectionsStore((state) => state.toggleIntegration);
  const Icon = icons[entry.icon] || Server;
  const connected = entry.status === 'connected' || (entry.status === 'available' && enabled);
  const statusLabel = entry.status === 'coming_soon' ? 'Coming soon' : connected ? 'Connected' : 'Available';

  return (
    <div className="connection-card">
      <div className="connection-icon">
        <Icon size={20} />
      </div>
      <div className="connection-main">
        <div className="connection-title-row">
          <strong>{entry.name}</strong>
          <span className={`connection-pill ${entry.status === 'coming_soon' ? 'coming-soon' : 'available'}`}>
            {statusLabel}
          </span>
        </div>
        <p>{entry.description}</p>
        <div className="chat-input-actions">
          {entry.status !== 'coming_soon' && (
            <button onClick={() => toggleIntegration(entry.id)}>
              {enabled ? 'Disconnect' : 'Connect'}
            </button>
          )}
          <button
            className={entry.status === 'coming_soon' ? '' : 'primary-button'}
            disabled={entry.status === 'coming_soon' || !entry.settingsRoute}
            onClick={() => onOpen(entry.settingsRoute)}
          >
            {connected ? 'Manage' : entry.status === 'available' ? 'Configure' : 'Coming soon'}
          </button>
        </div>
      </div>
    </div>
  );
}
