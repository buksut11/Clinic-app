import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Medication, PharmacyStats, PendingPrescription, Dispense, Purchase } from '../lib/types';
import { Spinner, ErrorState, EmptyState, Modal, useToast, useConfirm, Select } from '../components/ui';
import { IconPlus } from '../components/icons';
import { fmtDate, fmtDateTime, money } from '../lib/format';
import DispenseModal from '../components/pharmacy/DispenseModal';
import BuyModal from '../components/pharmacy/BuyModal';
import MedicationForm from '../components/pharmacy/MedicationForm';
import StockModals from '../components/pharmacy/StockModals';

type Tab = 'sell' | 'buy' | 'inventory' | 'history';

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

  const loadStats = () => api.get('/pharmacy/stats').then((r) => setStats(r.data)).catch(() => {});
  useEffect(() => { loadStats(); }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sell', label: 'Sell' },
    { key: 'buy', label: 'Buy' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pharmacy</h1>
        <p className="text-sm text-slate-500">Buy stock from suppliers, sell to patients and walk-in customers, and manage inventory.</p>
      </div>

      {/* Stat strip */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Medications" value={String(stats.totalItems)} />
          <StatCard label="Sales today" value={money(stats.salesTotalToday)} accent="text-green-600" hint={`${stats.dispensedToday} sale(s)`} />
          <StatCard label="Profit today" value={money(stats.profitToday)} accent={stats.profitToday >= 0 ? 'text-green-600' : 'text-red-600'} />
          <StatCard label="Purchases today" value={money(stats.purchaseTotalToday)} accent="text-blue-600" hint={`${stats.purchasedToday} order(s)`} />
          <StatCard label="Low stock" value={String(stats.lowStock)} accent={stats.lowStock > 0 ? 'text-amber-600' : undefined} />
          <StatCard label="Expiring soon" value={String(stats.expiringSoon)} accent={stats.expiringSoon > 0 ? 'text-red-600' : undefined} />
        </div>
      )}

      <div className="segmented mb-5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'is-active' : ''}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sell' && <DispenseTab onChange={loadStats} />}
      {tab === 'buy' && <BuyTab onChange={loadStats} />}
      {tab === 'inventory' && <InventoryTab onChange={loadStats} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function StatCard({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function PaymentBadge({ method }: { method?: string | null }) {
  const m = method || 'cash';
  const label = m === 'invoice' ? 'Invoiced' : m.charAt(0).toUpperCase() + m.slice(1);
  const cls = m === 'invoice' ? 'bg-amber-100 text-amber-700' : m === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Dispense tab — pending prescriptions + over-the-counter
// ---------------------------------------------------------------------------
function DispenseTab({ onChange }: { onChange: () => void }) {
  const [pending, setPending] = useState<PendingPrescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispenseFor, setDispenseFor] = useState<PendingPrescription | null>(null);
  const [otc, setOtc] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api.get('/pharmacy/prescriptions/pending').then((r) => setPending(r.data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const afterDispense = () => { setDispenseFor(null); setOtc(false); load(); onChange(); };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{pending.length} prescription(s) waiting to be dispensed</p>
        <button className="btn-primary" onClick={() => setOtc(true)}><IconPlus className="h-4 w-4" /> Sell to walk-in customer</button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : pending.length === 0 ? (
        <EmptyState title="No prescriptions waiting" hint="New prescriptions from doctors will appear here to dispense." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {pending.map((rx) => {
            const allergy = rx.patient.allergies && rx.patient.allergies.toLowerCase() !== 'none';
            return (
              <div key={rx.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{rx.patient.fullName}</p>
                    <p className="text-xs text-slate-400">{rx.patient.patientNo} · {fmtDate(rx.createdAt)} · Dr. {rx.doctor?.name}</p>
                  </div>
                </div>
                {allergy && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">⚠ Allergy: {rx.patient.allergies}</div>}
                <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-600">
                  {rx.items.map((it, i) => (
                    <li key={i}>• <span className="font-medium">{it.name}</span> {it.dosage} {it.frequency} {it.duration}</li>
                  ))}
                </ul>
                <button className="btn-primary mt-4 w-full" onClick={() => setDispenseFor(rx)}>Dispense</button>
              </div>
            );
          })}
        </div>
      )}

      {(dispenseFor || otc) && (
        <DispenseModal prescription={dispenseFor} onClose={() => { setDispenseFor(null); setOtc(false); }} onDispensed={afterDispense} />
      )}
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{purchases.length} purchase(s) recorded</p>
        <button className="btn-primary" onClick={() => setBuying(true)}><IconPlus className="h-4 w-4" /> Buy stock</button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : purchases.length === 0 ? (
        <EmptyState title="No purchases yet" hint="Record a purchase to bring stock in from a supplier and track what it cost." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr><th className="th">Purchase #</th><th className="th">When</th><th className="th">Supplier</th><th className="th">Bill ref</th><th className="th">Items</th><th className="th">Total cost</th><th className="th">By</th><th className="th"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{p.purchaseNo}</td>
                  <td className="td text-slate-500">{fmtDateTime(p.createdAt)}</td>
                  <td className="td">{p.supplier || <span className="text-slate-400">—</span>}</td>
                  <td className="td text-slate-500">{p.invoiceRef || '—'}</td>
                  <td className="td">{p.items.length}</td>
                  <td className="td font-medium text-blue-600">{money(p.total)}</td>
                  <td className="td text-slate-500">{p.createdBy?.name || '—'}</td>
                  <td className="td"><button className="text-brand-600 hover:underline" onClick={() => setOpen(p)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {buying && <BuyModal onClose={() => setBuying(false)} onBought={afterBuy} />}

      <Modal open={!!open} onClose={() => setOpen(null)} title={`Purchase ${open?.purchaseNo || ''}`}>
        {open && (
          <div>
            <p className="mb-3 text-sm text-slate-500">{open.supplier || 'Supplier —'} · {fmtDateTime(open.createdAt)}{open.invoiceRef ? ` · Bill ${open.invoiceRef}` : ''}</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Cost</th><th className="py-1 text-right">Amount</th><th className="py-1">Expiry</th></tr></thead>
              <tbody>
                {open.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-50"><td className="py-1">{it.name}</td><td className="py-1 text-right">{it.quantity}</td><td className="py-1 text-right">{money(it.costPrice)}</td><td className="py-1 text-right">{money(it.amount)}</td><td className="py-1 text-slate-500">{it.expiryDate ? fmtDate(it.expiryDate) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 font-bold"><span>Total cost</span><span>{money(open.total)}</span></div>
            {open.notes && <p className="mt-3 text-sm text-slate-500">Notes: {open.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory tab
// ---------------------------------------------------------------------------
function InventoryTab({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
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
            className="w-44"
            value={filter}
            onChange={setFilter}
            placeholder="All items"
            options={[
              { value: 'low', label: 'Low stock' },
              { value: 'expiring', label: 'Expiring soon' },
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
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">SKU</th><th className="th">Medication</th><th className="th">Form</th>
                <th className="th">Stock</th><th className="th">Cost</th><th className="th">Sell</th><th className="th">Margin</th><th className="th">Expiry</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {meds.map((m) => {
                const low = m.quantity <= m.reorderLevel;
                const out = m.quantity === 0;
                const soon = expirySoon(m.expiryDate);
                const margin = m.unitPrice - (m.costPrice || 0);
                const marginPct = m.costPrice > 0 ? Math.round((margin / m.costPrice) * 100) : null;
                return (
                  <tr key={m.id} className={`hover:bg-slate-50 ${m.isActive ? '' : 'opacity-50'}`}>
                    <td className="td font-mono text-xs">{m.sku}</td>
                    <td className="td">
                      <div className="font-medium text-slate-800">{m.name} {m.strength && <span className="text-slate-400">{m.strength}</span>}</div>
                      <div className="text-xs text-slate-400">{m.genericName || '—'}{m.location ? ` · ${m.location}` : ''}</div>
                    </td>
                    <td className="td capitalize">{m.form}</td>
                    <td className="td">
                      <span className={`badge ${out ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {m.quantity} {m.unit}{m.quantity === 1 ? '' : 's'}
                      </span>
                      {low && !out && <div className="mt-0.5 text-xs text-amber-600">≤ reorder {m.reorderLevel}</div>}
                      {out && <div className="mt-0.5 text-xs text-red-600">Out of stock</div>}
                    </td>
                    <td className="td text-slate-500">{money(m.costPrice || 0)}</td>
                    <td className="td font-medium text-slate-800">{money(m.unitPrice)}</td>
                    <td className={`td ${margin < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(margin)}{marginPct !== null && <span className="text-xs text-slate-400"> ({marginPct}%)</span>}</td>
                    <td className={`td ${soon ? 'font-medium text-red-600' : 'text-slate-500'}`}>{m.expiryDate ? fmtDate(m.expiryDate) : '—'}{soon && ' ⚠'}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setStockModal({ med: m, mode: 'receive' })}>Receive</button>
                        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setStockModal({ med: m, mode: 'adjust' })}>Adjust</button>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setStockModal({ med: m, mode: 'movements' })}>Ledger</button>
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(m)}>Edit</button>
                        {m.isActive && <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => archive(m)}>Deactivate</button>}
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
  if (dispenses.length === 0) return <EmptyState title="No dispensing history yet" />;

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr><th className="th">Sale #</th><th className="th">When</th><th className="th">Buyer</th><th className="th">Payment</th><th className="th">Items</th><th className="th">Total</th><th className="th">By</th><th className="th"></th></tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {dispenses.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50">
              <td className="td font-mono text-xs">{d.dispenseNo}</td>
              <td className="td text-slate-500">{fmtDateTime(d.createdAt)}</td>
              <td className="td">{d.patient?.fullName || d.customerName || <span className="text-slate-400">Walk-in</span>}</td>
              <td className="td"><PaymentBadge method={d.paymentMethod} /></td>
              <td className="td">{d.items.length}</td>
              <td className="td">{money(d.total)}</td>
              <td className="td text-slate-500">{d.dispensedBy?.name || '—'}</td>
              <td className="td"><button className="text-brand-600 hover:underline" onClick={() => setOpen(d)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!open} onClose={() => setOpen(null)} title={`Sale ${open?.dispenseNo || ''}`}>
        {open && (
          <div>
            <p className="mb-1 text-sm text-slate-500">{open.patient?.fullName || open.customerName || 'Walk-in'}{open.customerPhone ? ` · ${open.customerPhone}` : ''} · {fmtDateTime(open.createdAt)}</p>
            <p className="mb-3"><PaymentBadge method={open.paymentMethod} /></p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Amount</th></tr></thead>
              <tbody>
                {open.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-50"><td className="py-1">{it.name}</td><td className="py-1 text-right">{it.quantity}</td><td className="py-1 text-right">{money(it.unitPrice)}</td><td className="py-1 text-right">{money(it.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 font-bold"><span>Total</span><span>{money(open.total)}</span></div>
            {open.notes && <p className="mt-3 text-sm text-slate-500">Notes: {open.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
