import { XIcon } from '@phosphor-icons/react';
import { dismissToast, toastStore } from '../lib/toasts.ts';
import { useStore } from '../lib/store.ts';

export function Toaster() {
  const toasts = useStore(toastStore, (s) => s.toasts);
  return (
    <div className="toaster" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="palette toast">
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => {
                toast.action?.run();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-small"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
          >
            <XIcon size={14} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  );
}
