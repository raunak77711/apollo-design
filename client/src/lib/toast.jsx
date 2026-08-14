import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Check, TriangleAlert, X } from 'lucide-react';

/**
 * Small notification stack. Replaces window.alert() everywhere so failures read
 * as part of the product instead of the browser.
 */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message, { tone = 'neutral', detail, duration = 4200 } = {}) => {
      const id = ++idRef.current;
      setToasts((list) => [...list.slice(-2), { id, message, detail, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      show: push,
      success: (message, detail) => push(message, { tone: 'success', detail }),
      error: (message, detail) => push(message, { tone: 'error', detail, duration: 6000 }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[90] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full animate-rise items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-pop"
          >
            {t.tone === 'success' && <Check size={15} className="mt-px shrink-0 text-accent-text" />}
            {t.tone === 'error' && <TriangleAlert size={15} className="mt-px shrink-0 text-danger" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ink">{t.message}</p>
              {t.detail && <p className="mt-0.5 text-xs leading-snug text-ink-3">{t.detail}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
