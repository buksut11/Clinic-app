import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Medication, PharmacyStats, PendingPrescription, Dispense, Purchase } from '../lib/types';
import { Spinner, ErrorState, EmptyState, Modal, Menu, Sparkline, useToast, useConfirm, Select } from '../components/ui';
import { IconCheck, IconCopy, IconPlus, IconPrinter } from '../components/icons';
import { fmtDate, fmtDateTime, fmtTime, money } from '../lib/format';
import { allergyCheck } from '../lib/dispense';
import DispenseModal from '../components/pharmacy/DispenseModal';
import BuyModal from '../components/pharmacy/BuyModal';
import MedicationForm from '../components/pharmacy/MedicationForm';
import StockModals from '../components/pharmacy/StockModals';

type Tab = 'sell' | 'buy' | 'inventory' | 'history';
/** Inventory filters, shared between the alert tiles and the Inventory tab. */
type StockFilter = '' | 'low' | 'expiring';

// Is a medication expiring within ~90 days?
export function expirySoon(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const soon = new Date();
  soon.setDate(soon.getDate() + 90);
  return new Date(dateStr) <= soon;
}

export default function Pharmacy() {
  const [tab, setTab] = useState<Tab>('sell');
  const [stats, setStats] = useState<PharmacyStats | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>('');

  const loadStats = () => api.get('/pharmacy/stats').then((r) => setStats(r.data)).catch(() => {});
  useEffect(() => { loadStats(); }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sell', label: 'Sell' },
    { key: 'buy', label: 'Buy' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'history', label: 'History' },
  ];

  /** An alert tile is a shortcut into the work, not a number to admire. */
  const openStock = (filter: StockFilter) => { setStockFilter(filter); setTab('inventory'); };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Pharmacy</h1>
        <p className="text-sm meta">Dispense prescriptions, sell over the counter, and keep stock honest.</p>
      </div>

      {stats && <TodayStrip stats={stats} onOpenStock={openStock} />}

      <div className="segmented mb-5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'is-active' : ''}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sell' && <DispenseTab onChange={loadStats} />}
      {tab === 'buy' && <BuyTab onChange={loadStats} />}
      {tab === 'inventory' && <InventoryTab onChange={loadStats} filter={stockFilter} setFilter={setStockFilter} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today — one headline, two supporting figures, two alerts
//
// Six equal tiles gave six numbers and no hierarchy, three of which read
// "0.00" for most of the morning. Takings are the figure the day is judged on,
// so they get the size and the week behind them for context; low stock and
// expiry are the only two that ask for a decision, so they alone are pressable.
// ---------------------------------------------------------------------------
function TodayStrip({ stats, onOpenStock }: { stats: PharmacyStats; onOpenStock: (f: StockFilter) => void }) {
  const trend = stats.salesTrend?.map((d) => d.total) ?? [];
  const yesterday = stats.salesTotalYesterday ?? 0;
  // A percentage against a zero baseline is noise, not information.
  const delta = yesterday > 0 ? Math.round(((stats.salesTotalToday - yesterday) / yesterday) * 100) : null;

  return (
    <div className="scrim mb-5 grid gap-3 p-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card flex items-end justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="eyebrow">Sales today</p>
          <p className="mt-0.5 text-[2rem] font-bold leading-tight tracking-tight text-slate-900 tabular-nums">
            {money(stats.salesTotalToday)}
          </p>
          <p className="mt-0.5 text-xs meta tabular-nums">
            {stats.dispensedToday} {stats.dispensedToday === 1 ? 'sale' : 'sales'}
            {delta !== null && (
              <>
                {' · '}
                <span className={delta >= 0 ? 'font-semibold text-brand-700' : 'font-semibold text-red-700'}>
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                </span>{' '}
                vs. yesterday
              </>
            )}
          </p>
        </div>
        {trend.length > 1 && (
          <Sparkline
            values={trend}
            className="flex-shrink-0"
            label={`Sales over the last 7 days, ending at ${money(stats.salesTotalToday)} today`}
          />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
        <div className="card flex flex-col justify-center p-4">
          <p className="eyebrow">Profit today</p>
          <p className={`mt-0.5 text-xl font-bold tracking-tight tabular-nums ${stats.profitToday >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
            {money(stats.profitToday)}
          </p>
          <p className="mt-0.5 text-[11.5px] meta tabular-nums">
            {stats.salesTotalToday > 0
              ? `${Math.round((stats.profitToday / stats.salesTotalToday) * 100)}% margin`
              : 'No sales yet today'}
          </p>
        </div>

        <div className="card flex flex-col justify-center p-4">
          <p className="eyebrow">Purchases today</p>
          {/* Blue, not teal: money going out, matching the cost column in Buy. */}
          <p className="mt-0.5 text-xl font-bold tracking-tight text-blue-700 tabular-nums">{money(stats.purchaseTotalToday)}</p>
          <p className="mt-0.5 text-[11.5px] meta tabular-nums">
            {stats.purchasedToday} {stats.purchasedToday === 1 ? 'order received' : 'orders received'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenStock('low')}
          className={`alert-tile ${stats.lowStock > 0 ? 'alert-warn' : 'alert-quiet'}`}
        >
          <span className="text-2xl font-bold leading-none tabular-nums">{stats.lowStock}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">Below reorder level</span>
            <span className="block text-[11.5px] opacity-80">
              {stats.outOfStock > 0 ? `${stats.outOfStock} of them out of stock` : 'Review and reorder'}
            </span>
          </span>
          <Chevron />
        </button>

        <button
          type="button"
          onClick={() => onOpenStock('expiring')}
          className={`alert-tile ${stats.expiringSoon > 0 ? 'alert-crit' : 'alert-quiet'}`}
        >
          <span className="text-2xl font-bold leading-none tabular-nums">{stats.expiringSoon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">Expiring within 90 days</span>
            <span className="block text-[11.5px] opacity-80">Sell first or write off</span>
          </span>
          <Chevron />
        </button>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="ms-auto h-4 w-4 flex-shrink-0 opacity-60 rtl-flip" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function PaymentBadge({ method, detailed = false }: { method?: string | null; detailed?: boolean }) {
  const m = method || 'cash';
  const invoiced = m === 'invoice';
  const label = invoiced ? 'Invoiced' : m.charAt(0).toUpperCase() + m.slice(1);
  // Amber, because an invoiced sale is money not yet collected — the same
  // language "needs attention" carries everywhere else on this screen.
  const cls = invoiced ? 'pill-low' : 'pill-ok';
  if (!detailed) return <span className={`pill ${cls}`}>{invoiced ? 'On invoice' : `Paid · ${label}`}</span>;
  // On the receipt the question is whether the money arrived, not just how it was taken.
  return (
    <span className={`pill pill-nodot ${cls}`}>
      {!invoiced && <IconCheck className="h-3 w-3" />}
      {invoiced ? 'On invoice — unpaid' : `Paid · ${label}`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sell tab — a dispensing counter: the queue on one side, the work on the other
//
// This was twenty identical cards, each opening a dialog. Dispensing is the
// task a pharmacist repeats all day, so it stopped costing an open-and-close
// cycle: picking a patient fills the surface beside the queue. Walk-in sales
// are an occasional interruption and stay a dialog.
// ---------------------------------------------------------------------------

/** How long someone has been waiting, in the units a counter actually thinks in. */
function waitedFor(iso: string): { label: string; long: boolean } | null {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return null;
  if (mins < 60) return { label: `${mins}m`, long: mins >= 20 };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ${mins % 60}m`, long: true };
  return { label: fmtDate(iso), long: false };
}

/** Does anything on this prescription conflict with the recorded allergies? */
function rxConflicts(rx: PendingPrescription): boolean {
  const a = rx.patient.allergies;
  if (!a || a.trim().toLowerCase() === 'none') return false;
  return rx.items.some((it) => allergyCheck(a, it.name).length > 0);
}

function DispenseTab({ onChange }: { onChange: () => void }) {
  const [pending, setPending] = useState<PendingPrescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otc, setOtc] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get('/pharmacy/prescriptions/pending')
      .then((r) => {
        const rows: PendingPrescription[] = r.data;
        setPending(rows);
        // Keep whoever is on the surface if they are still waiting; otherwise
        // fall to the head of the queue so the counter is never idle.
        setSelectedId((cur) => (cur && rows.some((p) => p.id === cur) ? cur : rows[0]?.id ?? null));
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const afterDispense = () => { setOtc(false); load(); onChange(); };
  const selected = pending.find((p) => p.id === selectedId) ?? null;

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      {pending.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No prescriptions waiting"
            hint="New prescriptions from doctors appear here to dispense."
            action={
              <button className="btn-primary" onClick={() => setOtc(true)}>
                <IconPlus className="h-4 w-4" /> Sell to a walk-in customer
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-white/55 px-4 py-3">
              <p className="eyebrow">
                Waiting · {pending.length}
              </p>
              <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setOtc(true)}>
                <IconPlus className="h-3.5 w-3.5" /> Walk-in
              </button>
            </div>
            <ul className="max-h-[32rem] space-y-0.5 overflow-y-auto p-1.5">
              {pending.map((rx) => {
                const waited = waitedFor(rx.createdAt);
                const conflict = rxConflicts(rx);
                return (
                  <li key={rx.id}>
                    <button
                      type="button"
                      aria-current={rx.id === selectedId}
                      onClick={() => setSelectedId(rx.id)}
                      className={`qrow ${conflict ? 'qrow-flag' : ''}`}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13.5px] font-semibold tracking-tight text-slate-800">
                          {rx.patient.fullName}
                        </span>
                        {waited && (
                          <span className={`ms-auto flex-shrink-0 text-[11px] tabular-nums ${waited.long ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
                            {waited.label}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-600">
                        <span className="font-mono text-[10.5px]">{rx.patient.patientNo}</span>
                        <span>{rx.items.length} {rx.items.length === 1 ? 'item' : 'items'}</span>
                        {/* Only a real conflict earns the chip. A recorded allergy
                            that clears the check is not news at the queue. */}
                        {conflict && (
                          <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 text-[9.5px] font-bold uppercase tracking-wider text-red-700">
                            Allergy
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected ? (
            <DispenseModal
              key={selected.id}
              inline
              prescription={selected}
              onClose={() => setSelectedId(null)}
              onDispensed={afterDispense}
            />
          ) : (
            <div className="card">
              <EmptyState title="Nothing selected" hint="Pick a patient from the queue to start dispensing." />
            </div>
          )}
        </div>
      )}

      {otc && <DispenseModal prescription={null} onClose={() => setOtc(false)} onDispensed={afterDispense} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buy tab — purchase stock from suppliers + purchase history
// ---------------------------------------------------------------------------
function BuyTab({ onChange }: { onChange: () => void }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.get('/pharmacy/purchases').then((r) => setPurchases(r.data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const afterBuy = () => { setBuying(false); load(); onChange(); };

  const spend = purchases.reduce((s, p) => s + p.total, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm meta tabular-nums">
          {purchases.length} {purchases.length === 1 ? 'purchase' : 'purchases'} recorded
          {purchases.length > 0 && <> · <span className="font-semibold text-blue-700">{money(spend)}</span> spent</>}
        </p>
        <button className="btn-primary" onClick={() => setBuying(true)}><IconPlus className="h-4 w-4" /> Buy stock</button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : purchases.length === 0 ? (
        <div className="card">
          <EmptyState title="No purchases yet" hint="Record a purchase to bring stock in from a supplier and track what it cost." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th">Purchase</th><th className="th">Received</th><th className="th">Supplier</th>
                <th className="th">Bill ref</th><th className="th text-end">Items</th><th className="th text-end">Total cost</th>
                <th className="th">Recorded by</th><th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {purchases.map((p) => {
                const shortDated = p.items.some((it) => expirySoon(it.expiryDate));
                return (
                  <tr key={p.id}>
                    <td className="td font-mono text-xs">{p.purchaseNo}</td>
                    <td className="td meta tabular-nums">{fmtDateTime(p.createdAt)}</td>
                    <td className="td font-medium text-slate-800">{p.supplier || <span className="meta">—</span>}</td>
                    <td className="td meta font-mono text-xs">{p.invoiceRef || '—'}</td>
                    <td className="td text-end tabular-nums">{p.items.length}</td>
                    {/* Blue: money going out, the same language as the total on the record. */}
                    <td className="td text-end font-semibold text-blue-700 tabular-nums">{money(p.total)}</td>
                    <td className="td meta">{p.createdBy?.name || '—'}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        {shortDated && <span className="pill pill-low">Short-dated</span>}
                        <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setOpen(p)}>Record</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {buying && <BuyModal onClose={() => setBuying(false)} onBought={afterBuy} />}

      {open && <PurchaseRecordModal purchase={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purchase record — the goods-in counterpart of the sale receipt, and the paper
// trail behind a supplier bill, so batch and expiry have to be readable.
// ---------------------------------------------------------------------------
function PurchaseRecordModal({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shortDated = purchase.items.some((it) => expirySoon(it.expiryDate));

  const copyNo = async () => {
    try {
      await navigator.clipboard.writeText(purchase.purchaseNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable outside a secure context — the number stays selectable.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Purchase record ${purchase.purchaseNo}`}
      wide
      header={
        <div className="flex flex-1 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase record</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate font-mono text-xl font-semibold tracking-tight text-slate-900">{purchase.purchaseNo}</span>
              <button
                type="button"
                onClick={copyNo}
                aria-label="Copy purchase number"
                title={copied ? 'Copied' : 'Copy purchase number'}
                className="flex-shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/70 hover:text-brand-600"
              >
                {copied ? <IconCheck className="h-4 w-4 text-brand-600" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {/* Stock that lands already close to expiry is the one thing worth catching here. */}
          {shortDated && <span className="badge bg-amber-100 text-amber-700">Expires soon</span>}
        </div>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" /> Print record
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <div className="print-area">
        {/* Paper loses the dialog header, so the printed copy restates what it is. */}
        <div className="mb-4 hidden print:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchase record</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{purchase.purchaseNo}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-2xl border border-white/70 bg-white/50 px-4 py-3.5 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className={META_LABEL}>Supplier</dt>
            <dd className="truncate text-sm font-medium text-slate-800">{purchase.supplier || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className={META_LABEL}>Supplier bill</dt>
            <dd className="truncate text-sm font-medium text-slate-800">{purchase.invoiceRef || '—'}</dd>
          </div>
          <div>
            <dt className={META_LABEL}>Received</dt>
            <dd className="text-sm font-medium tabular-nums text-slate-800">{fmtDate(purchase.createdAt)}</dd>
            <dd className="text-xs tabular-nums text-slate-500">{fmtTime(purchase.createdAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className={META_LABEL}>Recorded by</dt>
            <dd className="truncate text-sm font-medium text-slate-800">{purchase.createdBy?.name || '—'}</dd>
          </div>
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-slate-400/25 ${META_LABEL}`}>
                <th className="pb-2 text-left font-bold">Item</th>
                <th className="pb-2 text-right font-bold">Qty</th>
                <th className="pb-2 text-right font-bold">Cost</th>
                <th className="pb-2 text-right font-bold">Amount</th>
                <th className="pb-2 pl-6 text-right font-bold">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((it) => (
                <tr key={it.id || it.medicationId} className="border-t border-white/80 first:border-t-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-slate-800">{it.name}</span>
                    {it.batchNo && <span className="block text-xs tabular-nums text-slate-500">Batch {it.batchNo}</span>}
                  </td>
                  <td className="py-2.5 text-right align-top tabular-nums text-slate-600">{it.quantity}</td>
                  <td className="py-2.5 text-right align-top tabular-nums text-slate-600">{money(it.costPrice)}</td>
                  <td className="py-2.5 text-right align-top font-semibold tabular-nums text-slate-800">{money(it.amount)}</td>
                  <td className={`py-2.5 pl-6 text-right align-top tabular-nums ${expirySoon(it.expiryDate) ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                    {it.expiryDate ? fmtDate(it.expiryDate) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          {/* Blue, not brand teal: money going out, matching the cost column in the table behind. */}
          <div className="flex min-w-[15rem] items-baseline justify-between gap-8 rounded-2xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Total cost</span>
            <span className="text-2xl font-bold tabular-nums tracking-tight text-blue-700">{money(purchase.total)}</span>
          </div>
        </div>

        {purchase.notes && (
          <div className="mt-4 rounded-xl border-l-[3px] border-slate-400/50 bg-white/55 px-3.5 py-2.5">
            <p className={META_LABEL}>Note</p>
            <p className="text-sm text-slate-600">{purchase.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Inventory tab
// ---------------------------------------------------------------------------
function InventoryTab({
  onChange,
  filter,
  setFilter,
}: {
  onChange: () => void;
  /** Lifted, so the alert tiles in the header can land straight on a filtered view. */
  filter: StockFilter;
  setFilter: (f: StockFilter) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Medication | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockModal, setStockModal] = useState<{ med: Medication; mode: 'receive' | 'adjust' | 'movements' } | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.get('/pharmacy/medications', { params: { q: q || undefined, filter: filter || undefined } })
      .then((r) => setMeds(r.data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, filter]);

  const archive = async (m: Medication) => {
    const ok = await confirm({ title: 'Deactivate medication?', message: `Hide "${m.name}" from the active catalogue? Stock history is kept and it can be reactivated later.`, confirmText: 'Deactivate', danger: true });
    if (!ok) return;
    await api.post(`/pharmacy/medications/${m.id}/archive`);
    toast('Medication deactivated', 'success');
    load(); onChange();
  };

  const afterStock = () => { setStockModal(null); load(); onChange(); };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-64" placeholder="Search name, generic or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select
            className="w-56"
            value={filter}
            onChange={(v) => setFilter(v as StockFilter)}
            placeholder="All items"
            options={[
              { value: 'low', label: 'Below reorder level' },
              { value: 'expiring', label: 'Expiring within 90 days' },
            ]}
          />
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}><IconPlus className="h-4 w-4" /> Add medication</button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : meds.length === 0 ? (
          <EmptyState title="No medications found" hint={q || filter ? 'Try clearing the search or filter.' : 'Add your first medication to the inventory.'} />
        ) : (
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th">SKU</th><th className="th">Medication</th>
                <th className="th">Stock</th><th className="th text-end">Cost</th><th className="th text-end">Sell</th>
                <th className="th text-end">Margin</th><th className="th">Expiry</th><th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {meds.map((m) => {
                const low = m.quantity <= m.reorderLevel;
                const out = m.quantity === 0;
                const soon = expirySoon(m.expiryDate);
                const margin = m.unitPrice - (m.costPrice || 0);
                const marginPct = m.costPrice > 0 ? Math.round((margin / m.costPrice) * 100) : null;
                return (
                  <tr key={m.id} className={m.isActive ? '' : 'opacity-55'}>
                    <td className="td font-mono text-xs">{m.sku}</td>
                    <td className="td">
                      <div className="font-medium text-slate-800">
                        {m.name} {m.strength && <span className="meta">{m.strength}</span>}
                      </div>
                      {/* Form moved in here: it identifies the product, it isn't a
                          column anyone scans down, and the row had one too many. */}
                      <div className="text-xs capitalize meta">
                        {[m.genericName, m.form, m.location].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="td">
                      <span className={`pill ${out ? 'pill-out' : low ? 'pill-low' : 'pill-ok'}`}>
                        {out ? 'Out of stock' : `${m.quantity} ${m.unit}${m.quantity === 1 ? '' : 's'}`}
                      </span>
                      {low && !out && <div className="mt-1 text-xs tabular-nums text-amber-700">Reorder at {m.reorderLevel}</div>}
                    </td>
                    <td className="td meta text-end tabular-nums">{money(m.costPrice || 0)}</td>
                    <td className="td text-end font-medium text-slate-800 tabular-nums">{money(m.unitPrice)}</td>
                    <td className={`td text-end font-semibold tabular-nums ${margin < 0 ? 'text-red-700' : 'text-brand-700'}`}>
                      {money(margin)}
                      {marginPct !== null && <span className="ms-1 text-xs font-normal meta">({marginPct}%)</span>}
                    </td>
                    <td className={`td tabular-nums ${soon ? 'font-semibold text-red-700' : 'meta'}`}>
                      {m.expiryDate ? fmtDate(m.expiryDate) : '—'}
                    </td>
                    <td className="td">
                      {/* Two everyday actions inline, the rest behind the overflow:
                          five equal buttons on every row means none of them reads
                          as the one you wanted. */}
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setStockModal({ med: m, mode: 'receive' })}>Receive</button>
                        <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setStockModal({ med: m, mode: 'adjust' })}>Adjust</button>
                        <Menu
                          label={`More actions for ${m.name}`}
                          items={[
                            { label: 'Stock ledger', onSelect: () => setStockModal({ med: m, mode: 'movements' }) },
                            { label: 'Edit details', onSelect: () => setEditing(m) },
                            ...(m.isActive ? [{ label: 'Deactivate', onSelect: () => archive(m), danger: true }] : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <Modal open onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Edit medication' : 'Add medication'} wide>
          <MedicationForm med={editing} onSaved={() => { setCreating(false); setEditing(null); load(); onChange(); }} onCancel={() => { setCreating(false); setEditing(null); }} />
        </Modal>
      )}

      {stockModal && <StockModals med={stockModal.med} mode={stockModal.mode} onClose={() => setStockModal(null)} onDone={afterStock} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------
function HistoryTab() {
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Dispense | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    api.get('/pharmacy/dispenses').then((r) => setDispenses(r.data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (dispenses.length === 0) {
    return (
      <div className="card">
        <EmptyState title="No dispensing history yet" hint="Every sale you record appears here with its receipt." />
      </div>
    );
  }

  const takings = dispenses.reduce((s, d) => s + d.total, 0);

  return (
    <div>
      <p className="mb-3 text-sm meta tabular-nums">
        {dispenses.length} {dispenses.length === 1 ? 'sale' : 'sales'} ·{' '}
        <span className="font-semibold text-brand-700">{money(takings)}</span> taken
      </p>

      <div className="card overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="th">Sale</th><th className="th">When</th><th className="th">Buyer</th>
              <th className="th">Payment</th><th className="th text-end">Items</th><th className="th text-end">Total</th>
              <th className="th">Served by</th><th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {dispenses.map((d) => (
              <tr key={d.id}>
                <td className="td font-mono text-xs">{d.dispenseNo}</td>
                <td className="td meta tabular-nums">{fmtDateTime(d.createdAt)}</td>
                <td className="td">
                  {d.patient?.fullName || d.customerName ? (
                    <>
                      <div className="font-medium text-slate-800">{d.patient?.fullName || d.customerName}</div>
                      {d.patient?.patientNo && <div className="font-mono text-[10.5px] meta">{d.patient.patientNo}</div>}
                    </>
                  ) : (
                    <span className="meta">Walk-in</span>
                  )}
                </td>
                <td className="td"><PaymentBadge method={d.paymentMethod} /></td>
                <td className="td text-end tabular-nums">{d.items.length}</td>
                {/* Teal: money coming in, the opposite of the blue used on Buy. */}
                <td className="td text-end font-semibold text-brand-700 tabular-nums">{money(d.total)}</td>
                <td className="td meta">{d.dispensedBy?.name || '—'}</td>
                <td className="td text-end">
                  <button className="btn-secondary px-3 py-1 text-xs" onClick={() => setOpen(d)}>Receipt</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <SaleReceiptModal sale={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sale receipt — the record a customer may ask to be read out, reprinted or
// disputed, so the number, who served them and the total all have to carry.
// ---------------------------------------------------------------------------
// slate-400 over the pastel wash measures about 2.3:1 — under the 4.5:1 small
// text needs. slate-600 keeps the label quiet and still legible.
const META_LABEL = 'text-[0.68rem] font-bold uppercase tracking-wider text-slate-600';

function SaleReceiptModal({ sale, onClose }: { sale: Dispense; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const buyer = sale.patient?.fullName || sale.customerName || 'Walk-in';

  const copyNo = async () => {
    try {
      await navigator.clipboard.writeText(sale.dispenseNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is unavailable outside a secure context — the number stays selectable.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sale receipt ${sale.dispenseNo}`}
      header={
        <div className="flex flex-1 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sale receipt</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate font-mono text-xl font-semibold tracking-tight text-slate-900">{sale.dispenseNo}</span>
              <button
                type="button"
                onClick={copyNo}
                aria-label="Copy receipt number"
                title={copied ? 'Copied' : 'Copy receipt number'}
                className="flex-shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/70 hover:text-brand-600"
              >
                {copied ? <IconCheck className="h-4 w-4 text-brand-600" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <PaymentBadge method={sale.paymentMethod} detailed />
        </div>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-4 w-4" /> Print receipt
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <div className="print-area">
        {/* Paper loses the dialog header, so the printed copy restates what it is. */}
        <div className="mb-4 hidden print:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sale receipt</p>
          <p className="font-mono text-lg font-semibold text-slate-900">{sale.dispenseNo}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-2xl border border-white/70 bg-white/50 px-4 py-3.5 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className={META_LABEL}>Buyer</dt>
            <dd className="truncate text-sm font-medium text-slate-800">{buyer}</dd>
            {sale.customerPhone && <dd className="truncate text-xs tabular-nums text-slate-500">{sale.customerPhone}</dd>}
          </div>
          <div>
            <dt className={META_LABEL}>Sold</dt>
            <dd className="text-sm font-medium tabular-nums text-slate-800">{fmtDate(sale.createdAt)}</dd>
            <dd className="text-xs tabular-nums text-slate-500">{fmtTime(sale.createdAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className={META_LABEL}>Served by</dt>
            <dd className="truncate text-sm font-medium text-slate-800">{sale.dispensedBy?.name || '—'}</dd>
          </div>
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-slate-400/25 ${META_LABEL}`}>
                <th className="pb-2 text-left font-bold">Item</th>
                <th className="pb-2 text-right font-bold">Qty</th>
                <th className="pb-2 text-right font-bold">Unit</th>
                <th className="pb-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((it) => (
                <tr key={it.id || it.medicationId} className="border-t border-white/80 first:border-t-0">
                  <td className="py-2.5 pr-3 font-medium text-slate-800">{it.name}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">{it.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">{money(it.unitPrice)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-slate-800">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="flex min-w-[14rem] items-baseline justify-between gap-8 rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Total</span>
            <span className="text-2xl font-bold tabular-nums tracking-tight text-brand-700">{money(sale.total)}</span>
          </div>
        </div>

        {sale.notes && (
          <div className="mt-4 rounded-xl border-l-[3px] border-slate-400/50 bg-white/55 px-3.5 py-2.5">
            <p className={META_LABEL}>Note</p>
            <p className="text-sm text-slate-600">{sale.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
