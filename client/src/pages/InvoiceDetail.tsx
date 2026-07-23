import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, errMsg, openFile } from '../lib/api';
import { Invoice } from '../lib/types';
import { Spinner, ErrorState, StatusBadge, Modal, useToast, useConfirm } from '../components/ui';
import { fmtDateTime, money, paidOf } from '../lib/format';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'cash', insurerName: '', claimRef: '' });

  const load = () => {
    setError('');
    api
      .get(`/invoices/${id}`)
      .then((r) => setInv(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!inv) return null;

  const paid = paidOf(inv);
  const balance = Math.max(0, inv.total - paid);

  const submitPayment = async () => {
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    try {
      await api.post(`/invoices/${inv.id}/payments`, {
        amount,
        method: pay.method,
        insurerName: pay.method === 'insurance' ? pay.insurerName : null,
        claimRef: pay.method === 'insurance' ? pay.claimRef : null,
      });
      toast('Payment recorded', 'success');
      setPayOpen(false);
      setPay({ amount: '', method: 'cash', insurerName: '', claimRef: '' });
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const cancelInvoice = async () => {
    const ok = await confirm({ title: 'Cancel invoice?', message: `Invoice ${inv.invoiceNo} will be voided. This cannot be undone.`, confirmText: 'Cancel invoice', danger: true });
    if (!ok) return;
    await api.post(`/invoices/${inv.id}/cancel`);
    toast('Invoice cancelled', 'success');
    load();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate('/billing')} className="mb-4 text-sm text-slate-500 hover:text-slate-700">← Back to billing</button>

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{inv.invoiceNo}</h1>
            <p className="text-sm text-slate-500">
              <Link to={`/patients/${inv.patientId}`} className="text-brand-700 hover:underline">{inv.patient?.fullName}</Link> · {fmtDateTime(inv.createdAt)}
            </p>
          </div>
          <StatusBadge status={inv.status} kind="invoice" />
        </div>

        {/* Items */}
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items?.map((it, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">{money(it.unitPrice)}</td>
                <td className="py-2 text-right">{money(it.amount || it.quantity * it.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <Row label="Subtotal" value={money(inv.subtotal)} />
          {inv.discountValue > 0 && <Row label={`Discount${inv.discountType === 'percent' ? ` (${inv.discountValue}%)` : ''}`} value={`-${money(inv.discountType === 'percent' ? (inv.subtotal * inv.discountValue) / 100 : inv.discountValue)}`} />}
          {inv.taxAmount > 0 && <Row label={`Tax (${inv.taxRate}%)`} value={money(inv.taxAmount)} />}
          <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>Total</span><span>{money(inv.total)}</span></div>
          <Row label="Paid" value={money(paid)} />
          <div className="flex justify-between font-semibold text-amber-600"><span>Balance</span><span>{money(balance)}</span></div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {inv.status !== 'CANCELLED' && balance > 0 && <button className="btn-primary" onClick={() => { setPay((p) => ({ ...p, amount: String(balance) })); setPayOpen(true); }}>Take payment</button>}
          <button className="btn-secondary" onClick={() => openFile(`/invoices/${inv.id}/pdf`)}>Print / PDF</button>
          {inv.status !== 'CANCELLED' && inv.status !== 'PAID' && <button className="btn-secondary text-red-600" onClick={cancelInvoice}>Cancel invoice</button>}
        </div>
      </div>

      {/* Payments */}
      {inv.payments && inv.payments.length > 0 && (
        <div className="card mt-4 p-6">
          <h3 className="mb-3 font-semibold text-slate-800">Payment history</h3>
          <div className="space-y-2">
            {inv.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{fmtDateTime(p.createdAt)} · <span className="capitalize">{p.method}</span>{p.insurerName ? ` (${p.insurerName}${p.claimRef ? ' / ' + p.claimRef : ''})` : ''}</span>
                <span className="font-medium">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Take payment">
        <div className="space-y-3">
          <div>
            <label className="label">Amount</label>
            <input className="input" type="number" min={0} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">Balance due: {money(balance)}</p>
          </div>
          <div>
            <label className="label">Method</label>
            <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
            </select>
          </div>
          {pay.method === 'insurance' && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Insurer name" value={pay.insurerName} onChange={(e) => setPay({ ...pay, insurerName: e.target.value })} />
              <input className="input" placeholder="Claim reference" value={pay.claimRef} onChange={(e) => setPay({ ...pay, claimRef: e.target.value })} />
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setPayOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={submitPayment}>Record payment</button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}
