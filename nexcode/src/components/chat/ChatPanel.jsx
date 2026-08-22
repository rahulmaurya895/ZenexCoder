import { useEffect, useRef } from 'react';
import { Download, MessageSquarePlus, PencilLine, Search, Trash2 } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useAppStore } from '@/store/appStore';
import { useAgentStore } from '@/store/agentStore';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import FollowUpBar from '@/components/agent/FollowUpBar';
import ImageDropzone from '@/components/vision/ImageDropzone';

export default function ChatPanel() {
  const {
    messages,
    sessions,
    searchQuery,
    setSearchQuery,
    loadSessions,
    createSession,
    loadMessages,
    renameSession,
    deleteSession,
    exportSession,
    sendMessage,
    addMessage,
    highlightMessageId
  } = useChat();
  const isStreaming = useAppStore((state) => state.isStreaming);
  const streamingAbort = useAppStore((state) => state.streamingAbort);
  const runState = useAgentStore((state) => state.runState);
  const followUps = useAgentStore((state) => state.followUps);
  const consumeNextQueuedFollowUp = useAgentStore((state) => state.consumeNextQueuedFollowUp);
  const busy = isStreaming || ['running', 'paused'].includes(runState);
  const messageListRef = useRef(null);

  useEffect(() => {
    loadSessions().catch(() => {});
  }, [loadSessions]);

  useEffect(() => {
    if (busy) return;
    const next = consumeNextQueuedFollowUp();
    if (next) {
      sendMessage(next.content).catch(() => {});
    }
  }, [busy, consumeNextQueuedFollowUp, followUps.length, sendMessage]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isStreaming, runState]);

  function exportMarkdown() {
    const blob = new Blob([exportSession()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nexcode-chat-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const filteredSessions = sessions.filter((session) => session.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <ImageDropzone onImageDropped={(img) => sendMessage(`[VISION-TO-CODE REQUEST]\nConvert this UI mock into a responsive React component with Tailwind CSS.`, [img])}>
      <section className="panel chat-panel">
        <div className="panel-header">
          <span className="panel-title">Chat</span>
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
        <div className="session-list" style={{ maxHeight: 180, flex: '0 0 auto' }}>
          {filteredSessions.map((session) => (
            <div className="session-item-row" key={session.id}>
              <button key={session.id} className="session-item session-item-main" onClick={() => loadMessages(session.id)}>
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
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="panel-body message-list" ref={messageListRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <h2>Ask, build, debug</h2>
              <p>Cloud keys are optional. Ollama is the default local-first path.</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id || message.createdAt} message={message} highlight={message.id === highlightMessageId} />
          ))
        )}
      </div>
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
        <ChatInput onSend={sendMessage} />
      )}
    </section>
    </ImageDropzone>
  );
}
