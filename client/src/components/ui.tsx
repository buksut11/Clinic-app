import { ReactNode, createContext, useContext, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Loading / error / empty states
// ---------------------------------------------------------------------------
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-red-50 p-3 text-red-500">⚠️</div>
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-4xl">🗒️</div>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10" onClick={onClose}>
      <div
        className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button className="btn-ghost px-2 py-1 text-lg" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (imperative via context)
// ---------------------------------------------------------------------------
interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(null!);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ ...o, resolve }));
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800">{state.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  state.resolve(false);
                  setState(null);
                }}
              >
                Cancel
              </button>
              <button
                className={state.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => {
                  state.resolve(true);
                  setState(null);
                }}
              >
                {state.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}
const ToastCtx = createContext<(message: string, type?: Toast['type']) => void>(null!);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card px-4 py-3 text-sm shadow-lg ${
              t.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------
const APPT_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700',
  CHECKED_IN: 'bg-blue-100 text-blue-700',
  IN_CONSULTATION: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  NO_SHOW: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-400 line-through',
};
const LAB_COLORS: Record<string, string> = {
  ORDERED: 'bg-slate-100 text-slate-700',
  SAMPLE_COLLECTED: 'bg-blue-100 text-blue-700',
  RESULT_READY: 'bg-green-100 text-green-700',
};
const INV_COLORS: Record<string, string> = {
  UNPAID: 'bg-red-100 text-red-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-400 line-through',
};

export function StatusBadge({ status, kind = 'appt' }: { status: string; kind?: 'appt' | 'lab' | 'invoice' }) {
  const map = kind === 'lab' ? LAB_COLORS : kind === 'invoice' ? INV_COLORS : APPT_COLORS;
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`badge ${map[status] || 'bg-slate-100 text-slate-700'}`}>{label}</span>;
}
