import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { useNotificationStore } from '@/store/notificationStore';

const icons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info
};

function ToastItem({ notification }) {
  const dismissToast = useNotificationStore((state) => state.dismissToast);
  const Icon = icons[notification.type] || Info;

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(notification.id), 5000);
    return () => window.clearTimeout(timer);
  }, [dismissToast, notification.id]);

  return (
    <div className={`notification-toast ${notification.type}`}>
      <Icon size={16} />
      <div className="notification-toast-main">
        <strong>{notification.title}</strong>
        {notification.message && <span>{notification.message}</span>}
      </div>
      <button className="icon-button" onClick={() => dismissToast(notification.id)} title="Dismiss notification">
        <X size={12} />
      </button>
    </div>
  );
}

export default function NotificationToast() {
  const toastQueue = useNotificationStore((state) => state.toastQueue);
  if (!toastQueue.length) return null;
  return createPortal(
    <div className="notification-toast-stack">
      {toastQueue.map((notification) => (
        <ToastItem notification={notification} key={notification.id} />
      ))}
    </div>,
    document.body
  );
}
