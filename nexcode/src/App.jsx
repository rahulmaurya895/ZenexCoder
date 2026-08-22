import { Component, useEffect, useState } from 'react';
import { Bot, Code2, FolderOpen, Monitor, SquareTerminal, X } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import StatusBar from '@/components/layout/StatusBar';
import RightPanel from '@/components/layout/RightPanel';
import FileTree from '@/components/editor/FileTree';
import CodeEditor from '@/components/editor/CodeEditor';
import SwarmChatPanel from '@/components/swarm/SwarmChatPanel';
import ChatSearch from '@/components/chat/ChatSearch';
import VisionPanel from '@/components/vision/VisionPanel';
import Terminal from '@/components/terminal/Terminal';
import OllamaManager from '@/components/ollama/OllamaManager';
import SettingsPanel from '@/components/settings/SettingsPanel';
import PluginsPanel from '@/components/plugins/PluginsPanel';
import AutomationsPanel from '@/components/automations/AutomationsPanel';
import ReviewDetached from '@/components/review/ReviewDetached';
import GitPanel from '@/components/git/GitPanel';
import EnvironmentsPanel from '@/components/environments/EnvironmentsPanel';
import MCPServersPanel from '@/components/mcp/MCPServersPanel';
import BrowserPanel from '@/components/browser/BrowserPanel';
import ComputerUsePanel from '@/components/computer/ComputerUsePanel';
import HooksPanel from '@/components/hooks/HooksPanel';
import KnowledgePanel from '@/components/knowledge/KnowledgePanel';
import IncidentDashboard from '@/components/healing/IncidentDashboard';
import ClusterDashboard from '@/components/cluster/ClusterDashboard';
import LearningDashboard from '@/components/learning/LearningDashboard';
import TeamDashboard from '@/components/collaboration/TeamDashboard';
import PipelineDashboard from '@/components/cicd/PipelineDashboard';
import ScenarioBuilder from '@/components/qa/ScenarioBuilder';
import ConnectionsHub from '@/components/layout/ConnectionsHub';
import GovernancePanel from '@/components/governance/GovernancePanel';
import AgentEnvPanel from '@/components/environment/AgentEnvPanel';
import DictationSettingsPanel from '@/components/dictation/DictationSettingsPanel';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import NotificationToast from '@/components/notifications/NotificationToast';
import PopoutContainer from '@/components/layout/PopoutContainer';
import PopoutSettingsPanel from '@/components/layout/PopoutSettingsPanel';
import VoiceOrbOverlay from '@/components/voice/VoiceOrbOverlay';
import { useAppStore } from '@/store/appStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useAgentStore } from '@/store/agentStore';
import { useAutomationStore } from '@/store/automationStore';
import { useConnectionsStore } from '@/store/connectionsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/hooks/useTheme';
import { useAgentRun } from '@/hooks/useAgentRun';
import { useComputerUse } from '@/hooks/useComputerUse';
import { useHooks } from '@/hooks/useHooks';
import { usePopout } from '@/hooks/usePopout';
import { useSwarm } from '@/hooks/useSwarm';
import { useKnowledge } from '@/hooks/useKnowledge';
import { useSpeculativeEngine } from '@/hooks/useSpeculativeEngine';
import { useSelfHealing } from '@/hooks/useSelfHealing';
import { useCluster } from '@/hooks/useCluster';
import { useRealtimeAudio } from '@/hooks/useRealtimeAudio';
import { useCollaboration } from '@/hooks/useCollaboration';

class StartupErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ZenexCoder renderer crashed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="startup-error-screen"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '32px',
            overflow: 'auto',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto', background: '#1e293b', border: '1px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
            <h1 style={{ color: '#ef4444', marginTop: 0, fontSize: '20px' }}>⚠️ Component Render Failure</h1>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>{this.state.error.message || 'Unknown renderer error'}</p>
            <pre style={{ background: '#090d16', color: '#f87171', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', lineHeight: 1.5 }}>
              {this.state.error.stack || ''}
            </pre>
            <button
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, marginTop: '16px' }}
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }


    return this.props.children;
  }
}

function WelcomeScreen({ onDone }) {
  const [choice, setChoice] = useState('both');
  const openProject = useProjectStore((state) => state.openProject);
  const createSession = useChatStore((state) => state.createSession);

  return (
    <div className="welcome">
      <div className="welcome-flow">
        <div>
          <h1>ZenexCoder</h1>
          <p>Local-first AI developer environment with code, vision, terminal, and multi-model support.</p>
        </div>
        <div className="welcome-options">
          <button className="welcome-option" onClick={() => setChoice('cloud')}>
            <Bot size={22} />
            <strong>Use Cloud AI</strong>
            <span>OpenAI, Anthropic, and Gemini with your own API keys.</span>
          </button>
          <button className="welcome-option" onClick={() => setChoice('local')}>
            <Monitor size={22} />
            <strong>Use Local AI</strong>
            <span>Ollama models run on your machine and work offline.</span>
          </button>
          <button className="welcome-option" onClick={() => setChoice('both')}>
            <Code2 size={22} />
            <strong>Use Both</strong>
            <span>Recommended: local default with cloud models available.</span>
          </button>
        </div>
        <div className="settings-section">
          <div className="panel-title">Selected setup: {choice}</div>
          <div className="chat-input-actions">
            <button
              className="primary-button"
              onClick={async () => {
                await openProject();
                await onDone();
              }}
            >
              <FolderOpen size={14} /> Open Folder
            </button>
            <button
              onClick={async () => {
                await createSession();
                await onDone();
              }}
            >
              <Bot size={14} /> Start New Chat
            </button>
            <button
              onClick={async () => {
                await createSession({ provider: 'ollama', modelId: 'llama3.2:3b' });
                await onDone();
              }}
            >
              <SquareTerminal size={14} /> Try Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  useComputerUse();
  useHooks();
  useSwarm();
  useKnowledge();
  useSpeculativeEngine();
  useSelfHealing();
  useCluster();
  useRealtimeAudio();
  useCollaboration();
  const detachedReview = new URLSearchParams(window.location.search).get('review') === 'detached';
  const [activeView, setActiveView] = useState(detachedReview ? 'review' : 'chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const chatPanelOpen = useAppStore((state) => state.chatPanelOpen);
  const fileTreeOpen = useAppStore((state) => state.fileTreeOpen);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen);
  const workMode = useAppStore((state) => state.workMode);
  const devToolsVisible = useAppStore((state) => state.devToolsVisible);
  const fullAccessBannerDismissed = useAppStore((state) => state.fullAccessBannerDismissed);
  const dismissFullAccessBanner = useAppStore((state) => state.dismissFullAccessBanner);
  const isFirstLaunch = useSettingsStore((state) => state.isFirstLaunch);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const finishFirstLaunch = useSettingsStore((state) => state.finishFirstLaunch);
  const defaultModels = useSettingsStore((state) => state.defaultModels);
  const setActiveModel = useAppStore((state) => state.setActiveModel);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const createSession = useChatStore((state) => state.createSession);
  const saveFile = useProjectStore((state) => state.saveFile);
  const activeFileId = useProjectStore((state) => state.activeFileId);
  const loadPermissions = usePermissionsStore((state) => state.load);
  const permissionMode = usePermissionsStore((state) => state.mode);
  const runState = useAgentStore((state) => state.runState);
  const resetAgent = useAgentStore((state) => state.reset);
  const loadAutomations = useAutomationStore((state) => state.loadAutomations);
  const runAutomation = useAutomationStore((state) => state.runAutomation);
  const loadConnections = useConnectionsStore((state) => state.load);

  useEffect(() => {
    loadSettings().then(() => {
      const codingModel = useSettingsStore.getState().defaultModels?.coding;
      if (codingModel) {
        setActiveModel(codingModel);
      }
    }).catch(() => {});
    loadSessions().catch(() => {});
    loadPermissions().catch(() => {});
    loadAutomations().catch(() => {});
    loadConnections().catch(() => {});
  }, [loadAutomations, loadConnections, loadPermissions, loadSettings, loadSessions]);

  useEffect(() => {
    const disposers = [
      window.zenexcoder.app.onMenu('menu:open-folder', () => useProjectStore.getState().openProject()),
      window.zenexcoder.app.onMenu('menu:save-file', () => activeFileId && saveFile(activeFileId))
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [activeFileId, saveFile]);

  useEffect(() => {
    function onKeyDown(event) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createSession().then(() => {
          resetAgent();
          setRightPanelOpen(false);
          setActiveView('chat');
        });
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createSession, resetAgent, setRightPanelOpen]);

  useEffect(() => {
    if (['running', 'paused'].includes(runState)) {
      setRightPanelOpen(true);
    }
  }, [runState, setRightPanelOpen]);

  useEffect(() => {
    const disposers = [
      window.zenexcoder.automation.onTrigger((payload) => {
        runAutomation(payload.id, payload.context || {});
      })
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [runAutomation]);

  useEffect(() => {
    const openSettings = () => setActiveView('settings');
    window.addEventListener('zenexcoder:open-settings', openSettings);
    return () => window.removeEventListener('zenexcoder:open-settings', openSettings);
  }, []);

  if (detachedReview) {
    return <ReviewDetached />;
  }

  if (isFirstLaunch) {
    return <WelcomeScreen onDone={finishFirstLaunch} />;
  }

  const devSurfaceVisible = workMode === 'coding' || devToolsVisible;
  const routeUsesMainChat =
    activeView === 'chat' ||
    activeView === 'swarm' ||
    (workMode === 'everyday' && !devToolsVisible && ['editor', 'vision', 'ollama'].includes(activeView));

  const showFileTree = fileTreeOpen && devSurfaceVisible && !routeUsesMainChat;
  const showSideChat = chatPanelOpen && !routeUsesMainChat;
  const showFullAccessBanner = permissionMode === 'full-access' && !fullAccessBannerDismissed;

  const workspaceClass = [
    'main-workspace',
    routeUsesMainChat && 'chat-main',
    !showFileTree && 'no-tree',
    !showSideChat && 'no-chat',
    rightPanelOpen && 'with-right'
  ].filter(Boolean).join(' ');

  const mainPanel =
    routeUsesMainChat ? (
      <SwarmChatPanel />
    ) : activeView === 'vision' ? (
      <VisionPanel />
    ) : activeView === 'terminal' ? (
      <Terminal />
    ) : activeView === 'ollama' ? (
      <OllamaManager />
    ) : activeView === 'settings' ? (
      <SettingsPanel />
    ) : activeView === 'plugins' ? (
      <PluginsPanel />
    ) : activeView === 'automations' ? (
      <AutomationsPanel />
    ) : activeView === 'git' ? (
      <GitPanel />
    ) : activeView === 'knowledge' ? (
      <KnowledgePanel />
    ) : activeView === 'incidents' ? (
      <IncidentDashboard />
    ) : activeView === 'cluster' ? (
      <ClusterDashboard />
    ) : activeView === 'learning' ? (
      <LearningDashboard />
    ) : activeView === 'team' ? (
      <TeamDashboard />
    ) : activeView === 'cicd' ? (
      <PipelineDashboard />
    ) : activeView === 'qa' ? (
      <ScenarioBuilder />
    ) : activeView === 'environments' ? (
      <EnvironmentsPanel />
    ) : activeView === 'extensions' ? (
      <MCPServersPanel />
    ) : activeView === 'browser' ? (
      <BrowserPanel />
    ) : activeView === 'computer_use' ? (
      <ComputerUsePanel />
    ) : activeView === 'hooks' ? (
      <HooksPanel />
    ) : activeView === 'agent_environment' ? (
      <AgentEnvPanel />
    ) : activeView === 'popout_window' ? (
      <PopoutSettingsPanel />
    ) : activeView === 'dictation' ? (
      <DictationSettingsPanel />
    ) : activeView === 'notifications' ? (
      <NotificationCenter embedded />
    ) : activeView === 'connections' ? (
      <ConnectionsHub onOpenRoute={(route) => setActiveView(route)} />
    ) : activeView === 'governance' ? (
      <GovernancePanel />
    ) : activeView === 'review' ? (
      <ReviewDetached />
    ) : (
      <CodeEditor />
    );

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${showFullAccessBanner ? 'has-full-access' : ''}`}>
      <Sidebar activeView={activeView} onViewChange={setActiveView} onOpenSearch={() => setSearchOpen(true)} />
      <TopBar />
      {showFullAccessBanner && (
        <div className="full-access-banner">
          Full access enabled - ZenexCoder can modify files and run commands without asking.
          <button className="icon-button" onClick={dismissFullAccessBanner} title="Dismiss full access warning">
            <X size={12} />
          </button>
        </div>
      )}
      <main className={workspaceClass}>
        {showFileTree && <FileTree />}
        {mainPanel}
        {showSideChat && <SwarmChatPanel />}
        {rightPanelOpen && <RightPanel />}
      </main>
      <ChatSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationCenter />
      <NotificationToast />
      <VoiceOrbOverlay />
      <StatusBar onOpenGit={() => setActiveView('git')} onOpenEnvironment={() => setActiveView('environments')} />
    </div>
  );
}

export default function App() {
  useTheme();
  useAgentRun();
  usePopout();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const loadNotifications = useNotificationStore((state) => state.load);

  useEffect(() => {
    loadNotifications().catch(() => {});
    const dispose = window.zenexcoder?.notify?.onShow?.((payload) => addNotification(payload));
    return () => dispose?.();
  }, [addNotification, loadNotifications]);


  const isPopoutWindow = new URLSearchParams(window.location.search).get('window') === 'popout';
  if (isPopoutWindow) {
    return (
      <>
        <PopoutContainer />
        <NotificationToast />
      </>
    );
  }

  return (
    <StartupErrorBoundary>
      <MainApp />
    </StartupErrorBoundary>
  );
}




