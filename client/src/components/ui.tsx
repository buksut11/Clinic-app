import { ReactNode, createContext, useContext, useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  format, startOfMonth, startOfWeek, addDays, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, isBefore, parseISO, isValid,
} from 'date-fns';
import { IconCalendar } from './icons';

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
  // Portalled to <body>: a `.card`/`.glass` ancestor's `backdrop-filter` creates a new
  // containing block for `position: fixed` descendants, which would otherwise trap
  // and clip this overlay inside whatever card happened to render it.
  return createPortal(
    <div
      className="items-safe-center fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900/30 p-4"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className={`glass-strong my-auto w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-3xl p-6 shadow-2xl`}
        style={{ boxShadow: '0 20px 60px rgba(15,23,42,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/60" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Select (custom, glass-themed — replaces the browser-native <select> chrome)
// ---------------------------------------------------------------------------
export function useCloseOnOutside(open: boolean, onClose: () => void, refs: React.RefObject<HTMLElement>[]) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (refs.some((r) => r.current && r.current.contains(t))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, ...refs]);
}

// Positions a portalled dropdown/calendar panel against its trigger using
// viewport (fixed) coordinates, so it always escapes ancestor `.card`/`.glass`
// elements — their `backdrop-filter` creates a new stacking context AND
// containing block, which otherwise traps and clips `position: absolute/fixed`
// descendants (this is what caused panels to render behind or clipped inside
// later sibling cards).
export function useFloatingPanel(open: boolean, opts?: { align?: 'start' | 'end'; rtl?: boolean }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const align = opts?.align || 'start';
  const rtl = !!opts?.rtl;

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const margin = 8;
    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight || 0;
      let top = r.bottom + 6;
      if (panelH && top + panelH > window.innerHeight - margin && r.top - panelH - 6 > margin) {
        top = r.top - panelH - 6;
      }
      // 'end' anchors the panel's trailing edge (right in ltr, left in rtl) to the
      // trigger's trailing edge instead of matching its width from the leading edge.
      const anchorRight = (align === 'end') !== rtl;
      const panelW = panelRef.current?.offsetWidth || r.width;
      const rawLeft = anchorRight ? r.right - panelW : r.left;
      const left = Math.min(Math.max(rawLeft, margin), Math.max(window.innerWidth - panelW - margin, margin));
      setStyle({ top, left, width: r.width });
    };
    reposition();
    const raf = requestAnimationFrame(reposition); // re-measure once the panel has real size (for flip-up / end-alignment)
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, align, rtl]);

  return { triggerRef, panelRef, style };
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  allowClear = true,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useFloatingPanel(open);
  useCloseOnOutside(open, () => setOpen(false), [triggerRef, panelRef]);
  const selected = options.find((o) => o.value === value);

  return (
    <div ref={triggerRef} className={className}>
      <button
        type="button"
        disabled={disabled}
        className="input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>{selected ? selected.label : placeholder}</span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open &&
        !disabled &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-strong max-h-60 overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
            style={{ position: 'fixed', top: style.top, left: style.left, width: style.width, zIndex: 100, boxShadow: '0 16px 40px rgba(15,23,42,0.2)' }}
          >
            {allowClear && (
              <button
                type="button"
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${!value ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-white/70'}`}
                onClick={() => { onChange(''); setOpen(false); }}
              >
                {placeholder}
              </button>
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                ref={value === o.value ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${value === o.value ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-white/70'}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimePicker (custom, glass-themed — replaces the native "HH:MM" time popup)
// ---------------------------------------------------------------------------
function timeOptions(step: number) {
  const out: { value: string; label: string }[] = [];
  for (let mins = 0; mins < 24 * 60; mins += step) {
    const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    out.push({ value: t, label: t });
  }
  return out;
}

export function TimePicker({
  value,
  onChange,
  className = '',
  step = 15,
  disabled = false,
}: {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  className?: string;
  step?: number;
  disabled?: boolean;
}) {
  const options = useMemo(() => timeOptions(step), [step]);
  return (
    <Select
      className={className}
      value={value}
      onChange={onChange}
      options={options}
      allowClear={false}
      disabled={disabled}
      placeholder="Select…"
    />
  );
}

// ---------------------------------------------------------------------------
// DatePicker (custom, glass-themed calendar — replaces the native date popup)
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DatePicker({
  value,
  onChange,
  className = '',
  placeholder = 'dd/mm/yyyy',
  min,
}: {
  value: string; // yyyy-MM-dd
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  min?: string; // yyyy-MM-dd — days before this are disabled
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useFloatingPanel(open);
  useCloseOnOutside(open, () => setOpen(false), [triggerRef, panelRef]);
  const selected = value ? parseISO(value) : null;
  const validSelected = selected && isValid(selected) ? selected : null;
  const [month, setMonth] = useState(startOfMonth(validSelected || new Date()));
  const minDate = min ? parseISO(min) : null;

  const toggle = () => {
    if (!open) setMonth(startOfMonth(validSelected || new Date()));
    setOpen((o) => !o);
  };

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div ref={triggerRef} className={className}>
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={toggle}>
        <span className={validSelected ? 'text-slate-800' : 'text-slate-400'}>
          {validSelected ? format(validSelected, 'dd/MM/yyyy') : placeholder}
        </span>
        <IconCalendar className="h-4 w-4 flex-shrink-0 text-slate-500" />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-strong w-72 rounded-2xl p-3 shadow-2xl"
            style={{ position: 'fixed', top: style.top, left: style.left, zIndex: 100, boxShadow: '0 16px 40px rgba(15,23,42,0.2)' }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{format(month, 'MMMM yyyy')}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/70"
                  onClick={() => setMonth((m) => subMonths(m, 1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/70"
                  onClick={() => setMonth((m) => addMonths(m, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const inMonth = isSameMonth(d, month);
                const isSel = validSelected && isSameDay(d, validSelected);
                const today = isToday(d);
                const disabled = !!minDate && isBefore(d, minDate) && !isSameDay(d, minDate);
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    disabled={disabled}
                    className={`rounded-full py-1.5 text-sm transition ${
                      disabled
                        ? 'cursor-not-allowed text-slate-200'
                        : isSel
                        ? 'bg-brand-600 font-semibold text-white'
                        : today
                        ? 'font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/40'
                        : inMonth
                        ? 'text-slate-700 hover:bg-white/70'
                        : 'text-slate-300 hover:bg-white/50'
                    }`}
                    onClick={() => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }}
                  >
                    {format(d, 'd')}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/50 pt-2 text-sm font-semibold">
              <button type="button" className="text-slate-500 transition hover:text-slate-700" onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </button>
              <button
                type="button"
                className="text-brand-700 transition hover:text-brand-800"
                onClick={() => { onChange(format(new Date(), 'yyyy-MM-dd')); setOpen(false); }}
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )}
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
      {state &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <div className="glass-strong w-full max-w-sm rounded-3xl p-6 shadow-2xl">
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
          </div>,
          document.body
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
      {createPortal(
        <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="glass-strong flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl"
              style={{ animation: 'toastIn .25s ease' }}
            >
              <span
                className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  t.type === 'success' ? 'bg-green-500' : t.type === 'error' ? 'bg-red-500' : 'bg-slate-400'
                }`}
              />
              <span className="text-slate-700">{t.message}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------
const APPT_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-slate-500/15 text-slate-600',
  CHECKED_IN: 'bg-blue-500/15 text-blue-700',
  IN_CONSULTATION: 'bg-amber-500/15 text-amber-700',
  COMPLETED: 'bg-green-500/15 text-green-700',
  NO_SHOW: 'bg-red-500/15 text-red-700',
  CANCELLED: 'bg-slate-500/10 text-slate-400 line-through',
};
const LAB_COLORS: Record<string, string> = {
  ORDERED: 'bg-slate-500/15 text-slate-600',
  SAMPLE_COLLECTED: 'bg-blue-500/15 text-blue-700',
  RESULT_READY: 'bg-green-500/15 text-green-700',
};
const INV_COLORS: Record<string, string> = {
  UNPAID: 'bg-red-500/15 text-red-700',
  PARTIAL: 'bg-amber-500/15 text-amber-700',
  PAID: 'bg-green-500/15 text-green-700',
  CANCELLED: 'bg-slate-500/10 text-slate-400 line-through',
};

export function StatusBadge({ status, kind = 'appt' }: { status: string; kind?: 'appt' | 'lab' | 'invoice' }) {
  const map = kind === 'lab' ? LAB_COLORS : kind === 'invoice' ? INV_COLORS : APPT_COLORS;
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`badge ${map[status] || 'bg-slate-100 text-slate-700'}`}>{label}</span>;
}
