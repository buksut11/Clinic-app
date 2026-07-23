import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Medication, PharmacyStats, PendingPrescription, Dispense } from '../lib/types';
import { Spinner, ErrorState, EmptyState, Modal, useToast, useConfirm } from '../components/ui';
import { IconPlus } from '../components/icons';
import { fmtDate, fmtDateTime, money } from '../lib/format';
import DispenseModal from '../components/pharmacy/DispenseModal';
import MedicationForm from '../components/pharmacy/MedicationForm';
import StockModals from '../components/pharmacy/StockModals';

type Tab = 'dispense' | 'inventory' | 'history';

// Is a medication expiring within ~90 days?
export function expirySoon(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const soon = new Date();
  soon.setDate(soon.getDate() + 90);
  return new Date(dateStr) <= soon;
}

export default function Pharmacy() {
  const [tab, setTab] = useState<Tab>('dispense');
  const [stats, setStats] = useState<PharmacyStats | null>(null);

  const loadStats = () => api.get('/pharmacy/stats').then((r) => setStats(r.data)).catch(() => {});
  useEffect(() => { loadStats(); }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dispense', label: 'Dispense' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pharmacy</h1>
        <p className="text-sm text-slate-500">Dispense prescriptions and manage medication stock.</p>
      </div>

      {/* Stat strip */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Medications" value={String(stats.totalItems)} />
          <StatCard label="Pending Rx" value={String(stats.pendingRx)} accent={stats.pendingRx > 0 ? 'text-brand-600' : undefined} />
          <StatCard label="Dispensed today" value={String(stats.dispensedToday)} />
          <StatCard label="Low stock" value={String(stats.lowStock)} accent={stats.lowStock > 0 ? 'text-amber-600' : undefined} />
          <StatCard label="Expiring soon" value={String(stats.expiringSoon)} accent={stats.expiringSoon > 0 ? 'text-red-600' : undefined} />
          <StatCard label="Stock value" value={money(stats.stockValue)} accent="text-green-600" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dispense' && <DispenseTab onChange={loadStats} />}
      {tab === 'inventory' && <InventoryTab onChange={loadStats} />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  );
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
        <button className="btn-secondary" onClick={() => setOtc(true)}><IconPlus className="h-4 w-4" /> Over-the-counter dispense</button>
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
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All items</option>
            <option value="low">Low stock</option>
            <option value="expiring">Expiring soon</option>
          </select>
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
                <th className="th">Stock</th><th className="th">Price</th><th className="th">Expiry</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {meds.map((m) => {
                const low = m.quantity <= m.reorderLevel;
                const out = m.quantity === 0;
                const soon = expirySoon(m.expiryDate);
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
                    <td className="td">{money(m.unitPrice)}</td>
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
          <tr><th className="th">Dispense #</th><th className="th">When</th><th className="th">Patient</th><th className="th">Items</th><th className="th">Total</th><th className="th">By</th><th className="th"></th></tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {dispenses.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50">
              <td className="td font-mono text-xs">{d.dispenseNo}</td>
              <td className="td text-slate-500">{fmtDateTime(d.createdAt)}</td>
              <td className="td">{d.patient?.fullName || <span className="text-slate-400">Walk-in</span>}</td>
              <td className="td">{d.items.length}</td>
              <td className="td">{money(d.total)}</td>
              <td className="td text-slate-500">{d.dispensedBy?.name || '—'}</td>
              <td className="td"><button className="text-brand-600 hover:underline" onClick={() => setOpen(d)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!open} onClose={() => setOpen(null)} title={`Dispense ${open?.dispenseNo || ''}`}>
        {open && (
          <div>
            <p className="mb-3 text-sm text-slate-500">{open.patient?.fullName || 'Walk-in'} · {fmtDateTime(open.createdAt)}</p>
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
