import { useEffect } from 'react';
import { Bot, Boxes, BrainCircuit, Code2, FlaskConical, FolderOpen, GitBranch, Globe, GraduationCap, History, Layers, Link, Monitor, MonitorPlay, Network, PanelLeftClose, PanelLeftOpen, PencilLine, Plug, Rocket, Search, Server, Settings, ShieldAlert, SquareTerminal, Timer, Trash2, Users, Workflow, Eye } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { useAppStore } from '@/store/appStore';
import { useProjectStore } from '@/store/projectStore';
import NewChatButton from '@/components/chat/NewChatButton';

/**
 * @param {{activeView: string, onViewChange: (view: string) => void, onOpenSearch: () => void}} props
 */
export default function Sidebar({ activeView, onViewChange, onOpenSearch }) {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const pendingReviewCount = useAppStore((state) => state.pendingReviewCount);
  const setPendingReviewCount = useAppStore((state) => state.setPendingReviewCount);
  const sessions = useChatStore((state) => state.sessions);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const renameSession = useChatStore((state) => state.renameSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const openProject = useProjectStore((state) => state.openProject);

  const nav = [
    { id: 'editor', label: 'Editor', icon: Code2 },
    { id: 'chat', label: 'Chat', icon: Bot },
    { id: 'swarm', label: 'Swarm Agents', icon: Network },
    { id: 'vision', label: 'Vision', icon: Monitor },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },

    { id: 'git', label: 'Git', icon: GitBranch },
    { id: 'knowledge', label: 'Knowledge', icon: BrainCircuit },
    { id: 'learning', label: 'Learning', icon: GraduationCap },
    { id: 'team', label: 'Team Sync', icon: Users },
    { id: 'cicd', label: 'CI/CD', icon: Rocket },
    { id: 'qa', label: 'Synthetic QA', icon: FlaskConical },
    { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
    { id: 'cluster', label: 'Cluster', icon: Network },
    { id: 'environments', label: 'Environments', icon: Layers },
    { id: 'extensions', label: 'Extensions', icon: Server },
    { id: 'browser', label: 'Browser', icon: Globe },
    { id: 'computer_use', label: 'Computer Use', icon: MonitorPlay },
    { id: 'hooks', label: 'Hooks', icon: Link },
    { id: 'connections', label: 'Connections', icon: Plug },
    { id: 'ollama', label: 'Ollama', icon: Workflow },
    { id: 'plugins', label: 'Extensions', icon: Boxes },
    { id: 'automations', label: 'Automations', icon: Timer },
    { id: 'review', label: `Review${pendingReviewCount ? ` (${pendingReviewCount})` : ''}`, icon: Eye },
    { id: 'governance', label: 'Governance', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  useEffect(() => {
    window.zezenexcoderr.review.list('pending_review').then((list) => setPendingReviewCount(list.length)).catch(() => {});
    const dispose = window.zezenexcoderr.review.onUpdate(() => {
      window.zezenexcoderr.review.list('pending_review').then((list) => setPendingReviewCount(list.length)).catch(() => {});
    });
    return dispose;
  }, [setPendingReviewCount]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="icon-button" onClick={toggleSidebar} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        <div className="brand">ZenexCoder</div>
      </div>

      <div className="sidebar-nav">
        <button className="nav-button" onClick={() => openProject()} title="Open Folder">
          <FolderOpen size={16} />
          <span className="open-folder-label">Open Folder</span>
        </button>
        <NewChatButton onDone={() => onViewChange('chat')} />
        <button className="nav-button" onClick={onOpenSearch} title="Search">
          <Search size={16} />
          <span className="sidebar-label">Search</span>
        </button>
        <button className="nav-button" onClick={() => onViewChange('settings')} title="Open Settings">
          <Settings size={16} />
          <span className="sidebar-label">Settings</span>
        </button>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-button ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              title={item.label}
            >
              <Icon size={16} />
              <span className="sidebar-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-section-title">
        <History size={12} /> Recent Chats
      </div>
      <div className="session-list">
        {sessions.map((session) => (
          <div className="session-item-row" key={session.id}>
            <button
              className="session-item session-item-main"
              onClick={() => {
                loadMessages(session.id);
                onViewChange('chat');
              }}
              title={session.title}
            >
              {session.title}
            </button>
            <div className="session-item-actions">
              <button
                className="icon-button"
                title="Rename chat"
                onClick={async (event) => {
                  event.stopPropagation();
                  const nextTitle = window.prompt('Rename chat', session.title);
                  if (!nextTitle || nextTitle.trim() === session.title) return;
                  await renameSession(session.id, nextTitle);
                }}
              >
                <PencilLine size={12} />
              </button>
              <button
                className="icon-button danger-button"
                title="Delete chat"
                onClick={async (event) => {
                  event.stopPropagation();

                  await deleteSession(session.id);
                  if (activeView !== 'chat') { onViewChange('chat'); }
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

