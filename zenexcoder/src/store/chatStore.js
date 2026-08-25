import { create } from 'zustand';
import { estimateMessageTokens } from '@/utils/tokenCounter';

export const useChatStore = create((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  searchQuery: '',
  highlightMessageId: null,
  tokenEstimate: 0,
  async loadSessions() {
    const sessions = await window.zezenexcoderr.db.listSessions();
    if (!sessions.length) {
      set({ sessions: [], activeSessionId: null, messages: [], tokenEstimate: 0, highlightMessageId: null });
      return;
    }
    const activeSessionId = get().activeSessionId;
    const hasActiveSession = sessions.some((session) => session.id === activeSessionId);
    set({ sessions, activeSessionId: hasActiveSession ? activeSessionId : null });
    if (!hasActiveSession) {
      await get().loadMessages(sessions[0].id);
    }
  },
  async createSession(model = {}) {
    const session = await window.zezenexcoderr.db.createSession({
      title: 'New Chat',
      modelProvider: model.provider,
      modelId: model.modelId
    });
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      messages: [],
      tokenEstimate: 0
    }));
    return session;
  },
  async loadMessages(sessionId) {
    const messages = await window.zezenexcoderr.db.listMessages(sessionId);
    set({ activeSessionId: sessionId, messages, tokenEstimate: estimateMessageTokens(messages) });
    return messages;
  },
  async renameSession(sessionId, title) {
    const nextTitle = String(title || '').trim();
    if (!sessionId || !nextTitle) {
      return null;
    }
    const updated = await window.zezenexcoderr.db.updateSession({ id: sessionId, title: nextTitle });
    await get().loadSessions();
    return updated;
  },
  async deleteSession(sessionId) {
    if (!sessionId) {
      return { ok: false };
    }
    const wasActive = get().activeSessionId === sessionId;
    await window.zezenexcoderr.db.deleteSession(sessionId);
    set((state) => ({ sessions: state.sessions.filter((session) => session.id !== sessionId) }));
    if (wasActive) {
      set({ activeSessionId: null, messages: [], tokenEstimate: 0, highlightMessageId: null });
    }
    await get().loadSessions();
    return { ok: true };
  },
  async addMessage(role, content, attachments = [], modelId = null) {
    let sessionId = get().activeSessionId;
    if (!sessionId) {
      const session = await get().createSession();
      sessionId = session.id;
    }
    const message = await window.zezenexcoderr.db.addMessage({
      sessionId,
      role,
      content,
      attachments,
      modelId,
      tokensUsed: 0
    });
    const nextMessages = [...get().messages, message];
    set({ messages: nextMessages, tokenEstimate: estimateMessageTokens(nextMessages) });
    return message;
  },
  replaceStreamingMessage(content) {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === 'streaming' ? { ...message, content } : message
      )
    }));
  },
  startStreamingMessage(run = {}) {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: 'streaming',
          role: 'assistant',
          content: '',
          attachments: [],
          createdAt: Date.now(),
          run: { startedAt: Date.now(), status: 'Preparing request...', activity: [], ...run }
        }
      ]
    }));
  },
  updateStreamingRun(run) {
    set((state) => ({ messages: state.messages.map((message) => message.id === 'streaming' ? { ...message, run: { ...message.run, ...run } } : message) }));
  },
  async finishStreamingMessage(content, modelId, run = null) {
    set((state) => ({ messages: state.messages.filter((message) => message.id !== 'streaming') }));
    return get().addMessage('assistant', content, run ? [{ type: 'run-status', ...run }] : [], modelId);
  },
  clearSession() {
    set({ messages: [], tokenEstimate: 0 });
  },
  setSearchQuery(searchQuery) {
    set({ searchQuery });
  },
  setHighlightMessageId(highlightMessageId) {
    set({ highlightMessageId });
  },
  exportSession() {
    const session = get().sessions.find((item) => item.id === get().activeSessionId);
    const title = session?.title || 'ZenexCoder Chat';
    return [`# ${title}`, '', ...get().messages.map((message) => `## ${message.role}\n\n${message.content}`)].join('\n\n');
  }
}));

