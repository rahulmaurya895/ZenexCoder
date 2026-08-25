import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Download, MessageSquarePlus, Network, Search, Square } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useAppStore } from '@/store/appStore';
import { useAgentStore } from '@/store/agentStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSwarmStore } from '@/store/swarmStore';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import FollowUpBar from '@/components/agent/FollowUpBar';
import SwarmMessageBubble from './SwarmMessageBubble';
import SwarmOrchestratorUI from './SwarmOrchestratorUI';

function flattenTree(nodes = [], depth = 0, state = { count: 0 }) {
  if (!Array.isArray(nodes) || state.count > 160) return [];
  return nodes.flatMap((node) => {
    if (state.count > 160) return [];
    state.count += 1;
    const prefix = `${'  '.repeat(depth)}${node.type === 'folder' ? 'dir ' : 'file'}`;
    return [
      `${prefix} ${node.name}`,
      ...flattenTree(node.children || [], depth + 1, state)
    ];
  });
}

function formatOpenFiles(openFiles = []) {
  return openFiles
    .slice(0, 6)
    .map((file) => [
      `File: ${file.path}`,
      `Language: ${file.language || 'text'}`,
      '```',
      String(file.content || '').slice(0, 3500),
      '```'
    ].join('\n'))
    .join('\n\n');
}

export default function SwarmChatPanel() {
  const {
    messages,
    sessions,
    searchQuery,
    setSearchQuery,
    loadSessions,
    createSession,
    loadMessages,
    exportSession,
    sendMessage,
    addMessage,
    highlightMessageId
  } = useChat();
  const activeModel = useAppStore((state) => state.activeModel);
  const isStreaming = useAppStore((state) => state.isStreaming);
  const streamingAbort = useAppStore((state) => state.streamingAbort);
  const runState = useAgentStore((state) => state.runState);
  const followUps = useAgentStore((state) => state.followUps);
  const consumeNextQueuedFollowUp = useAgentStore((state) => state.consumeNextQueuedFollowUp);
  const settings = useSettingsStore();
  const permissionMode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const showSystemNotifications = usePermissionsStore((state) => state.showSystemNotifications);
  const projectPath = useProjectStore((state) => state.projectPath);
  const fileTree = useProjectStore((state) => state.fileTree);
  const openFiles = useProjectStore((state) => state.openFiles);
  const sessionAllows = useAgentStore((state) => state.sessionAllows);
  const workMode = useAppStore((state) => state.workMode);
  const devToolsVisible = useAppStore((state) => state.devToolsVisible);
  const swarmActive = useSwarmStore((state) => state.active);
  const swarmTaskId = useSwarmStore((state) => state.taskId);
  const activePersonaId = useSwarmStore((state) => state.activePersonaId);
  const swarmHistory = useSwarmStore((state) => state.swarmInternalHistory);
  const consensus = useSwarmStore((state) => state.consensus);
  const swarmError = useSwarmStore((state) => state.error);
  const collapsed = useSwarmStore((state) => state.collapsed);
  const startSwarmTask = useSwarmStore((state) => state.startTask);
  const haltSwarm = useSwarmStore((state) => state.halt);
  const toggleCollapsed = useSwarmStore((state) => state.toggleCollapsed);
  const busy = isStreaming || ['running', 'paused'].includes(runState);
  const messageListRef = useRef(null);

  useEffect(() => {
    loadSessions().catch(() => {});
  }, [loadSessions]);

  useEffect(() => {
    if (busy || swarmActive) return;
    const next = consumeNextQueuedFollowUp();
    if (next) {
      sendMessage(next.content).catch(() => {});
    }
  }, [busy, consumeNextQueuedFollowUp, followUps.length, sendMessage, swarmActive]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming, runState, swarmHistory.length, consensus, swarmError]);

  function exportMarkdown() {
    const blob = new Blob([exportSession()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `zezenexcoderr-chat-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function startSwarm(content, attachments = []) {
    const providerKey = activeModel.provider === 'google' ? 'google' : activeModel.provider;
    const apiKey = settings.apiKeys[providerKey] || '';
    if (activeModel.provider !== 'ollama' && !apiKey) {
      const message = `Add your ${activeModel.provider} API key in Settings before starting a swarm.`;
      await addMessage('system', message);
      await window.zezenexcoderr.notify.show({ title: 'Swarm blocked', body: message, type: 'warning' });
      return;
    }

    await addMessage('user', content, attachments, activeModel.modelId);
    try {
      await startSwarmTask({
        prompt: content,
        attachments,
        provider: activeModel.provider,
        modelId: activeModel.modelId,
        apiKey,
        temperature: settings.aiSettings.temperature,
        maxTokens: settings.aiSettings.maxTokens,
        maxIterations: 5,
        projectPath,
        projectContext: {
          fileTree: flattenTree(fileTree).join('\n'),
          openFiles: formatOpenFiles(openFiles)
        },
        permissions: {
          mode: permissionMode,
          projectRules: projectPath ? projectRules[projectPath] || {} : {},
          sessionAllows,
          showSystemNotifications,
          workMode,
          devToolsVisible
        }
      });
    } catch (error) {
      await addMessage('system', `Swarm failed to start: ${error.message}`);
      await window.zezenexcoderr.notify.show({ title: 'Swarm failed', body: error.message, type: 'error' });
    }
  }

  const filteredSessions = sessions.filter((session) => session.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const showSwarmDiscussion = swarmActive || swarmHistory.length > 0 || consensus || swarmError;

  return (
    <section className="panel chat-panel swarm-chat-panel">
      <div className="panel-header">
        <span className="panel-title">Chat</span>
        {swarmActive ? <span className="swarm-badge"><Network size={12} /> Swarm active</span> : null}
        <div className="top-bar-spacer" />
        <button className="icon-button" onClick={() => createSession()} title="New Chat">
          <MessageSquarePlus size={14} />
        </button>
        <button className="icon-button" onClick={exportMarkdown} title="Export Markdown">
          <Download size={14} />
        </button>
      </div>
      <div className="panel-header" style={{ height: 42 }}>
        <Search size={14} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search chats" />
      </div>
      {searchQuery && (
        <div className="session-list" style={{ maxHeight: 120, flex: '0 0 auto' }}>
          {filteredSessions.map((session) => (
            <button key={session.id} className="session-item" onClick={() => loadMessages(session.id)}>
              {session.title}
            </button>
          ))}
        </div>
      )}
      <SwarmOrchestratorUI activePersonaId={activePersonaId} active={swarmActive} consensus={consensus} error={swarmError} />
      <div className="panel-body message-list swarm-message-list" ref={messageListRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-inner" style={{ maxWidth: 540 }}>
              <h2>🤖 Swarm Multi-Agent Engine</h2>
              <p style={{ marginBottom: 16 }}>Architect ➔ Senior Dev ➔ QA ➔ SecOps consensus loop with auto-file saving.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', width: '100%' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Click a sample prompt to start Swarm testing:</span>
                {[
                  {
                    title: '📊 Developer Task Dashboard (Web App)',
                    desc: 'HTML/CSS/JS with LocalStorage persistence, filters, & glassmorphism styling.',
                    prompt: 'Create a modern web-based Developer Task Dashboard with local storage persistence. Features: 1) Add/delete tasks with priority badges (High, Medium, Low). 2) Filter tasks by completed/pending. 3) Dark mode toggle with modern CSS glassmorphism styling. Save the HTML, CSS, and JS files cleanly in the opened project folder.'
                  },
                  {
                    title: '🔐 Python Password Security Tool & Auditor',
                    desc: 'Generates strong passwords, checks dictionary words, & includes unit tests.',
                    prompt: 'Create a Python Security Tool script that generates strong custom passwords and checks the password strength rating (Weak, Fair, Strong, Ultra-secure). Also include a function to check if a password contains common weak patterns or dictionary words. Write unit test cases for all functions and save the full app in the project folder.'
                  },
                  {
                    title: '💰 Python Expense Tracker with SQLite',
                    desc: 'CLI expense manager with SQLite database, monthly analytics, & CSV export.',
                    prompt: 'Build a complete Python command-line Expense Tracker app with SQLite database. Features: 1) Add new expense with category, amount, and date. 2) List all expenses in a clean formatted table. 3) Calculate total monthly spent. 4) Export expenses to a CSV file. Include error handling for invalid input and create all necessary files in the opened project folder.'
                  }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    className="card-button"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      textAlign: 'left'
                    }}
                    onClick={() => startSwarm(item.prompt)}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>{item.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id || message.createdAt} message={message} highlight={message.id === highlightMessageId} />
          ))
        )}

      </div>
      {showSwarmDiscussion && (
        <div className={`swarm-discussion ${collapsed ? 'collapsed' : ''}`}>
          <div className="swarm-discussion-header">
            <button className="icon-button" onClick={toggleCollapsed} title={collapsed ? 'Show internal discussion' : 'Hide internal discussion'}>
              {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <span className="panel-title">Internal Agent Discussion</span>
            <div className="top-bar-spacer" />
            {swarmActive ? (
              <button className="danger-button" onClick={() => haltSwarm(swarmTaskId)}>
                <Square size={12} /> Halt
              </button>
            ) : null}
          </div>
          {!collapsed && (
            <div className="swarm-discussion-body">
              {swarmHistory.length ? (
                swarmHistory.map((message, index) => <SwarmMessageBubble key={`${message.taskId}-${index}-${message.createdAt}`} message={message} />)
              ) : (
                <div className="swarm-empty">Waiting for the Architect to speak...</div>
              )}
              {swarmError ? <div className="swarm-error">{swarmError}</div> : null}
            </div>
          )}
        </div>
      )}
      {busy ? (
        <FollowUpBar
          onQueue={(content) => addMessage('system', `Queued follow-up - will send after current task:\n\n${content}`)}
          onSteer={(content) => {
            if (isStreaming) {
              streamingAbort?.();
              window.setTimeout(() => sendMessage(`Steer current response with this instruction:\n\n${content}`).catch(() => {}), 80);
            } else {
              addMessage('system', `Steering current agent run:\n\n${content}`);
            }
          }}
        />
      ) : (
        <ChatInput onSend={sendMessage} onSwarm={startSwarm} swarmBusy={swarmActive} />
      )}
    </section>
  );
}


