import { ReactNode, createContext, useContext, useState, useCallback, useId, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
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
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  header,
  children,
  footer,
  footerLead,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Replaces the plain title line when a dialog needs a richer header; `title` is still the accessible name. */
  header?: ReactNode;
  children: ReactNode;
  /** Actions pinned below a divider, so every dialog puts its buttons in the same place. */
  footer?: ReactNode;
  /** Summary shown at the start of the footer row, opposite the actions (totals, counts, blocking reasons). */
  footerLead?: ReactNode;
  /** `true` widens to 3xl; `'xl'` to 5xl, for dialogs that lay their body out in columns. */
  wide?: boolean | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape closes, Tab is trapped inside the panel, the page behind is frozen, and
  // focus returns to whatever opened the dialog. Without this, keyboard users tab
  // straight through the overlay into the page underneath.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A Select/DatePicker popover owns Escape while it is open — it closes first.
        if (document.querySelector('[data-floating-panel]')) return;
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass-strong my-auto w-full ${wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-3xl' : 'max-w-lg'} rounded-3xl p-6 shadow-2xl focus:outline-none`}
        style={{ boxShadow: '0 20px 60px rgba(15,23,42,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-4 flex justify-between gap-4 ${header ? 'items-start' : 'items-center'}`}>
          {header ?? <h3 id={titleId} className="text-lg font-bold text-slate-800">{title}</h3>}
          {header && <span id={titleId} className="sr-only">{title}</span>}
          <button
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/60"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
        {(footer || footerLead) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-400/20 pt-4">
            {footerLead ?? <span />}
            <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
          </div>
        )}
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
            data-floating-panel
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
// Menu — overflow actions
//
// A row that offers five equal buttons offers none: the eye has to read all of
// them to find the one it wants. The two everyday actions stay inline and the
// rest live here, which also keeps a wide table from growing an action column
// wider than its data.
// ---------------------------------------------------------------------------
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function Menu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
  const { triggerRef, panelRef, style } = useFloatingPanel(open, { align: 'end', rtl });
  useCloseOnOutside(open, () => setOpen(false), [triggerRef, panelRef]);

  return (
    <div ref={triggerRef} className="inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            data-floating-panel
            role="menu"
            className="glass-strong min-w-[10rem] rounded-2xl p-1.5 shadow-2xl"
            style={{ position: 'fixed', top: style.top, left: style.left, zIndex: 100, boxShadow: '0 16px 40px rgba(15,23,42,0.2)' }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`block w-full rounded-xl px-3 py-2 text-start text-sm transition hover:bg-white/70 ${
                  it.danger ? 'text-red-700' : 'text-slate-700'
                }`}
                onClick={() => { setOpen(false); it.onSelect(); }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — a week of daily totals behind a headline figure
//
// Deliberately axis-less: it is there to say "rising", "flat" or "that Tuesday
// was odd", and the precise number is already printed next to it in full. The
// last point is emphasised because that is the one the headline refers to.
// ---------------------------------------------------------------------------
export function Sparkline({
  values,
  label,
  className = '',
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  const id = useId();
  if (values.length < 2) return null;

  const w = 116;
  const h = 40;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat week — including a week of no sales at all — reads as a level line
  // through the middle. Scaling it against a zero span would either divide by
  // zero or pin a perfectly steady week to the floor as if it had collapsed.
  const flat = max === min;
  const span = max - min;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1);
  const y = (v: number) => (flat ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2));

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`;
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d9488" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke="#0d9488" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="5.5" fill="#0d9488" opacity="0.16" />
      <circle cx={lastX} cy={lastY} r="3" fill="#0d9488" />
    </svg>
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
            data-floating-panel
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
