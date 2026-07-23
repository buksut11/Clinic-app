import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { Invoice, Patient, InvoiceItem, Appointment } from '../lib/types';
import { Spinner, ErrorState, EmptyState, StatusBadge, Modal, useToast } from '../components/ui';
import { IconPlus } from '../components/icons';
import { fmtDate, money, paidOf } from '../lib/format';

export default function Billing() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get('/invoices', { params: { status: filter || undefined, page, pageSize } })
      .then((r) => {
        setInvoices(r.data.items);
        setPages(r.data.pages || 1);
        setTotal(r.data.total);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setPage(1); }, [filter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [filter, page]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Billing</h1>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
          <button className="btn-primary" onClick={() => setCreating(true)}><IconPlus className="h-4 w-4" /> New invoice</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices yet" hint="Create an invoice from a visit or manually." />
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Invoice</th><th className="th">Patient</th><th className="th">Date</th>
                <th className="th">Total</th><th className="th">Paid</th><th className="th">Balance</th><th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((inv) => {
                const paid = paidOf(inv);
                return (
                  <tr key={inv.id} className="cursor-pointer hover:bg-slate-50">
                    <td className="td"><Link to={`/billing/${inv.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">{inv.invoiceNo}</Link></td>
                    <td className="td">{inv.patient?.fullName}</td>
                    <td className="td text-slate-400">{fmtDate(inv.createdAt)}</td>
                    <td className="td">{money(inv.total)}</td>
                    <td className="td">{money(paid)}</td>
                    <td className="td font-medium">{money(Math.max(0, inv.total - paid))}</td>
                    <td className="td"><StatusBadge status={inv.status} kind="invoice" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">{total} invoices · page {page} of {pages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button>
            <button className="btn-secondary px-3 py-1.5" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next →</button>
          </div>
        </div>
      )}

      <InvoiceCreateModal open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setPage(1); load(); }} />
    </div>
  );
}

// -------------------------------------------------------------------------
function InvoiceCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [patientQuery, setPatientQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) api.get('/settings/clinic').then((r) => setTaxRate(r.data.taxRate));
  }, [open]);

  useEffect(() => {
    if (!patientQuery) { setResults([]); return; }
    const t = setTimeout(() => api.get('/patients', { params: { q: patientQuery } }).then((r) => setResults(r.data.slice(0, 6))), 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const pickPatient = async (p: Patient) => {
    setPatient(p);
    setResults([]);
    setPatientQuery('');
    // load recent completed appointments to allow auto-fill
    const r = await api.get('/appointments', { params: { doctorId: undefined } });
    setAppointments((r.data as Appointment[]).filter((a) => a.patientId === p.id && a.status === 'COMPLETED'));
  };

  const autoFill = async (appointmentId: string) => {
    if (!appointmentId) return;
    const r = await api.get(`/invoices/suggest/${appointmentId}`);
    setItems(r.data.items.length ? r.data.items : [{ description: '', quantity: 1, unitPrice: 0 }]);
  };

  const setItem = (i: number, k: keyof InvoiceItem, v: string | number) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((s) => [...s, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discount = discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue;
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + tax;

  const save = async () => {
    if (!patient) { toast('Select a patient', 'error'); return; }
    const valid = items.filter((i) => i.description.trim());
    if (!valid.length) { toast('Add at least one line item', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/invoices', {
        patientId: patient.id,
        items: valid.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
        discountType,
        discountValue: Number(discountValue),
        taxRate: Number(taxRate),
      });
      toast('Invoice created', 'success');
      reset();
      onCreated();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setPatient(null); setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
    setDiscountValue(0); setAppointments([]);
  };

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="New invoice" wide>
      <div className="space-y-4">
        <div>
          <label className="label">Patient *</label>
          {patient ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium">{patient.fullName} <span className="font-mono text-xs text-slate-400">{patient.patientNo}</span></span>
              <button className="text-xs text-slate-500 hover:underline" onClick={() => setPatient(null)}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <input className="input" placeholder="Search patient…" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {results.map((p) => (
                    <button key={p.id} onClick={() => pickPatient(p)} className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50">
                      {p.fullName} <span className="font-mono text-xs text-slate-400">{p.patientNo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {appointments.length > 0 && (
          <div>
            <label className="label">Auto-fill from a completed visit</label>
            <select className="input" onChange={(e) => autoFill(e.target.value)} defaultValue="">
              <option value="">Choose a visit…</option>
              {appointments.map((a) => <option key={a.id} value={a.id}>{fmtDate(a.date)} — Dr. {a.doctor?.name} ({a.visitType})</option>)}
            </select>
          </div>
        )}

        {/* Line items */}
        <div>
          <label className="label">Line items</label>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-1" placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                <input className="input w-16" type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, 'quantity', Number(e.target.value))} title="Qty" />
                <input className="input w-24" type="number" min={0} step="0.01" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', Number(e.target.value))} title="Unit price" />
                <button className="btn-ghost px-2 text-red-500" onClick={() => removeItem(i)} disabled={items.length === 1}>✕</button>
              </div>
            ))}
          </div>
          <button className="mt-2 text-sm text-brand-600 hover:underline" onClick={addItem}>+ Add line</button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Discount</label>
            <div className="flex gap-1">
              <input className="input" type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} />
              <select className="input w-20" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="amount">$</option>
                <option value="percent">%</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Tax rate (%)</label>
            <input className="input" type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{money(discount)}</span></div>}
          {tax > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{money(tax)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => { onClose(); reset(); }}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create invoice'}</button>
        </div>
      </div>
    </Modal>
  );
}
