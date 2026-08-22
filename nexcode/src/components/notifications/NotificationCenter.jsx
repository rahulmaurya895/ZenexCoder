import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';

function timeLabel(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '';
  }
}

function NotificationContent({ embedded = false }) {
  const notifications = useNotificationStore((state) => state.notifications);
  const setCenterOpen = useNotificationStore((state) => state.setCenterOpen);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const clearAll = useNotificationStore((state) => state.clearAll);

  return (
      <aside className={embedded ? 'panel notification-center embedded' : 'notification-center'}>
        <div className="panel-header">
          <Bell size={16} />
          <span className="panel-title">Notifications</span>
          <div className="top-bar-spacer" />
          <button className="icon-button" onClick={markAllAsRead} title="Mark all as read">
            <CheckCheck size={14} />
          </button>
          <button className="icon-button" onClick={clearAll} title="Clear all">
            <Trash2 size={14} />
          </button>
          {!embedded && (
            <button className="icon-button" onClick={() => setCenterOpen(false)} title="Close">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="notification-list">
          {!notifications.length && <div className="empty-state">No notifications yet.</div>}
          {notifications.map((notification) => (
            <article className={`notification-row ${notification.type} ${notification.read ? '' : 'unread'}`} key={notification.id}>
              <div className="notification-row-title">
                <strong>{notification.title}</strong>
                <span>{timeLabel(notification.timestamp)}</span>
              </div>
              {notification.message && <p>{notification.message}</p>}
            </article>
          ))}
        </div>
      </aside>
  );
}

export default function NotificationCenter({ embedded = false }) {
  const open = useNotificationStore((state) => state.centerOpen);
  const setCenterOpen = useNotificationStore((state) => state.setCenterOpen);

  if (embedded) {
    return <NotificationContent embedded />;
  }

  if (!open) return null;

  return (
    <div className="notification-center-layer">
      <button className="notification-center-scrim" onClick={() => setCenterOpen(false)} aria-label="Close notifications" />
      <NotificationContent />
    </div>
  );
}
