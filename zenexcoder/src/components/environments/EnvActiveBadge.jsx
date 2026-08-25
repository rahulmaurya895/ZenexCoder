import { Layers } from 'lucide-react';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useProjectStore } from '@/store/projectStore';

/**
 * @param {{onOpen: () => void}} props
 */
export default function EnvActiveBadge({ onOpen }) {
  const projectPath = useProjectStore((state) => state.projectPath);
  const environment = useEnvironment();
  const active = projectPath ? environment.getActiveEnv(projectPath) : null;
  const envs = projectPath ? environment.getEnvsForProject(projectPath) : [];
  if (!active || !envs.length) return null;

  return (
    <button className={`env-active-badge ${active.type}`} onClick={onOpen} title="Open environments">
      <Layers size={12} />
      <span>{active.name}</span>
    </button>
  );
}
