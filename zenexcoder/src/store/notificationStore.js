import { create } from 'zustand';

const STORE_KEY = 'notifications:center';
const MAX_NOTIFICATIONS = 250;

function inferType(payload = {}) {
  const text = `${payload.type || ''} ${payload.title || ''} ${payload.body || payload.message || ''}`.toLowerCase();
  if (/(error|failed|denied|conflict|unable)/.test(text)) return 'error';
  if (/(warn|approval|retry|sandbox|permission)/.test(text)) return 'warning';
  if (/(success|created|saved|enabled|complete|pushed)/.test(text)) return 'success';
  return payload.type || 'info';
}

function normalizeNotification(payload = {}) {
  return {
    id: payload.id || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: payload.title || 'ZenexCoder',
    message: payload.message || payload.body || '',
    type: inferType(payload),
    timestamp: payload.timestamp || Date.now(),
    read: Boolean(payload.read)
  };
}

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  toastQueue: [],
  centerOpen: false,
  unreadCount: 0,
  loaded: false,
  async load() {
    const stored = await window.zezenexcoderr.store.get(STORE_KEY, []).catch(() => []);
    const notifications = (Array.isArray(stored) ? stored : []).map(normalizeNotification).slice(0, MAX_NOTIFICATIONS);
    set({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      loaded: true
    });
  },
  persist() {
    const notifications = get().notifications.slice(0, MAX_NOTIFICATIONS);
    window.zezenexcoderr.store.set(STORE_KEY, notifications).catch(() => {});
  },
  addNotification(payload = {}) {
    const notification = normalizeNotification(payload);
    set((state) => {
      const notifications = [notification, ...state.notifications.filter((item) => item.id !== notification.id)].slice(0, MAX_NOTIFICATIONS);
      return {
        notifications,
        toastQueue: [notification, ...state.toastQueue].slice(0, 5),
        unreadCount: notifications.filter((item) => !item.read).length
      };
    });
    get().persist();
    return notification;
  },
  dismissToast(id) {
    set((state) => ({ toastQueue: state.toastQueue.filter((item) => item.id !== id) }));
  },
  markAllAsRead() {
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, read: true })),
      unreadCount: 0
    }));
    get().persist();
  },
  clearAll() {
    set({ notifications: [], toastQueue: [], unreadCount: 0 });
    window.zezenexcoderr.store.set(STORE_KEY, []).catch(() => {});
  },
  setCenterOpen(centerOpen) {
    set({ centerOpen });
    if (centerOpen) get().markAllAsRead();
  },
  toggleCenter() {
    get().setCenterOpen(!get().centerOpen);
  }
}));
