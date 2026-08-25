import { create } from 'zustand';

const CACHE_TTL_MS = 20 * 60 * 1000;
const CACHE_MARKER = '[[predictive-cache]]';

export function normalizeSpecText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function speculativeHash(value = '') {
  const text = normalizeSpecText(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sp-${(hash >>> 0).toString(16)}`;
}

function stripCodeFence(value = '') {
  const match = String(value).match(/```(?:\w+)?\s*([\s\S]*?)```/);
  return (match?.[1] || value || '').trim();
}

function codeFromResult(result = {}) {
  const matchingStep = (result.executionPlan?.steps || []).find((step) => step.content && (!result.filePath || step.filePath === result.filePath));
  const anyStep = (result.executionPlan?.steps || []).find((step) => step.content);
  return stripCodeFence(matchingStep?.content || anyStep?.content || result.code || '');
}

function isFresh(item = {}) {
  return Date.now() - Number(item.timestamp || 0) < CACHE_TTL_MS;
}

function promptLooksLikeErrorFix(prompt = '') {
  return /(fix|solve|debug|repair).*(error|exception|stack|terminal)|terminal error|stack trace/i.test(prompt);
}

function promptLooksLikeTodo(prompt = '') {
  return /(todo|fixme|complete|implement|write|create|generate)/i.test(prompt);
}

export const predictiveCacheMarker = CACHE_MARKER;

export const useSpeculativeStore = create((set, get) => ({
  cache: {},
  activeShadow: null,
  lastServed: null,
  settingsLoaded: false,
  settings: {
    enabled: true,
    maxMemoryPercent: 75,
    maxCpuPercent: 70,
    idleDelayMs: 3000
  },
  async loadSettings() {
    if (get().settingsLoaded) return get().settings;
    const settings = await window.zezenexcoderr.store.get('speculative:settings', get().settings).catch(() => get().settings);
    set({ settings: { ...get().settings, ...(settings || {}) }, settingsLoaded: true });
    return get().settings;
  },
  async saveSettings(patch = {}) {
    const settings = { ...get().settings, ...patch };
    await window.zezenexcoderr.store.set('speculative:settings', settings);
    set({ settings, settingsLoaded: true });
    return settings;
  },
  markShadow(payload = {}) {
    set({ activeShadow: payload });
  },
  applyCacheReady(payload = {}) {
    if (!payload.triggerHash || !payload.result) return;
    const item = {
      ...payload.result,
      triggerHash: payload.triggerHash,
      timestamp: payload.result.timestamp || payload.createdAt || Date.now()
    };
    set((state) => ({
      activeShadow: state.activeShadow?.triggerHash === payload.triggerHash ? null : state.activeShadow,
      cache: {
        ...state.cache,
        [payload.triggerHash]: item
      }
    }));
  },
  clearCache(reason = '') {
    set({ cache: {}, lastServed: reason || null, activeShadow: null });
  },
  clearEntry(triggerHash) {
    set((state) => {
      const { [triggerHash]: _removed, ...cache } = state.cache;
      return { cache };
    });
  },
  findSuggestion({ filePath, lineNumber, lineText = '' } = {}) {
    const items = Object.values(get().cache).filter(isFresh);
    const normalizedLine = normalizeSpecText(lineText);
    const exact = items.find((item) =>
      item.filePath === filePath &&
      (!item.lineNumber || item.lineNumber === lineNumber) &&
      (!item.intent?.context || normalizedLine.includes(normalizeSpecText(item.intent.context).slice(0, 60)))
    );
    const fallback = exact || items.find((item) => item.filePath === filePath && ['todo_completion', 'selection_action', 'large_paste'].includes(item.intent?.intentType));
    if (!fallback) return null;
    const code = codeFromResult(fallback).slice(0, 5000);
    if (!code) return null;
    return { ...fallback, code };
  },
  findPromptMatch(prompt = '') {
    const normalized = normalizeSpecText(prompt);
    const exactHash = speculativeHash(normalized);
    const cache = get().cache;
    if (cache[exactHash] && isFresh(cache[exactHash])) return { triggerHash: exactHash, result: cache[exactHash] };
    const items = Object.entries(cache).filter(([, item]) => isFresh(item));
    const exactPrompt = items.find(([, item]) => normalizeSpecText(item.prompt || item.intent?.context || '') === normalized);
    if (exactPrompt) return { triggerHash: exactPrompt[0], result: exactPrompt[1] };
    const errorMatch = promptLooksLikeErrorFix(prompt) && items.find(([, item]) => item.intent?.intentType === 'error_fix');
    if (errorMatch) return { triggerHash: errorMatch[0], result: errorMatch[1] };
    const todoMatch = promptLooksLikeTodo(prompt) && items.find(([, item]) => ['todo_completion', 'selection_action', 'large_paste'].includes(item.intent?.intentType));
    if (todoMatch) return { triggerHash: todoMatch[0], result: todoMatch[1] };
    return null;
  },
  formatCachedResponse(item = {}) {
    const code = codeFromResult(item);
    const language = item.filePath?.split('.').pop() || 'text';
    const lines = [
      CACHE_MARKER,
      item.explanation || 'Predictive cache result.',
      code ? `\n\`\`\`${language}\n${code}\n\`\`\`` : ''
    ];
    return lines.filter(Boolean).join('\n');
  }
}));
