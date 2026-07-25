import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Medication, StockMovement } from '../../lib/types';
import { Modal, Spinner, useToast, DatePicker } from '../ui';
import { fmtDate, fmtDateTime } from '../../lib/format';

export default function StockModals({
  med,
  mode,
  onClose,
  onDone,
}: {
  med: Medication;
  mode: 'receive' | 'adjust' | 'movements';
  onClose: () => void;
  onDone: () => void;
}) {
  if (mode === 'receive') return <ReceiveModal med={med} onClose={onClose} onDone={onDone} />;
  if (mode === 'adjust') return <AdjustModal med={med} onClose={onClose} onDone={onDone} />;
  return <MovementsModal med={med} onClose={onClose} />;
}

function ReceiveModal({ med, onClose, onDone }: { med: Medication; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ quantity: '', batchNo: med.batchNo || '', expiryDate: med.expiryDate ? med.expiryDate.slice(0, 10) : '', reason: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const quantity = Number(f.quantity);
    if (!quantity || quantity <= 0) { toast('Enter a quantity greater than zero', 'error'); return; }
    setSaving(true);
    try {
      await api.post(`/pharmacy/medications/${med.id}/receive`, {
        quantity, batchNo: f.batchNo || null, expiryDate: f.expiryDate || null, reason: f.reason || null,
      });
      toast(`Received ${quantity} ${med.unit} of ${med.name}`, 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Receive stock — ${med.name}`}>
      <p className="mb-3 text-sm text-slate-500">Current stock: <span className="font-semibold text-slate-700">{med.quantity} {med.unit}(s)</span></p>
      <div className="space-y-3">
        <div><label className="label">Quantity received *</label><input className="input" type="number" min={1} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Batch no.</label><input className="input" value={f.batchNo} onChange={(e) => set('batchNo', e.target.value)} /></div>
          <div><label className="label">Expiry date</label><DatePicker value={f.expiryDate} onChange={(v) => set('expiryDate', v)} /></div>
        </div>
        <div><label className="label">Note / supplier reference</label><input className="input" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. PO #4821" /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add to stock'}</button></div>
    </Modal>
  );
}

function AdjustModal({ med, onClose, onDone }: { med: Medication; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) { toast('Enter an amount greater than zero', 'error'); return; }
    if (!reason.trim()) { toast('A reason is required for adjustments', 'error'); return; }
    const signed = direction === 'remove' ? -n : n;
    setSaving(true);
    try {
      await api.post(`/pharmacy/medications/${med.id}/adjust`, { quantity: signed, reason });
      toast('Stock adjusted', 'success');
      onDone();
    } catch (err) { toast(errMsg(err), 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Adjust stock — ${med.name}`}>
      <p className="mb-3 text-sm text-slate-500">Current stock: <span className="font-semibold text-slate-700">{med.quantity} {med.unit}(s)</span>. Use this for stock counts, damage or expiry write-offs.</p>
      <div className="space-y-3">
        <div className="flex gap-2">
          <button type="button" className={`flex-1 rounded-lg border px-3 py-2 text-sm ${direction === 'remove' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 text-slate-600'}`} onClick={() => setDirection('remove')}>Remove (−)</button>
          <button type="button" className={`flex-1 rounded-lg border px-3 py-2 text-sm ${direction === 'add' ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-300 text-slate-600'}`} onClick={() => setDirection('add')}>Add (+)</button>
        </div>
        <div><label className="label">Amount *</label><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div><label className="label">Reason *</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in storage, stock count correction" /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Apply adjustment'}</button></div>
    </Modal>
  );
}

function MovementsModal({ med, onClose }: { med: Medication; onClose: () => void }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/pharmacy/medications/${med.id}`).then((r) => setMovements(r.data.movements || [])).finally(() => setLoading(false));
  }, [med.id]);

  const badge = (t: string) =>
    t === 'RECEIVE' ? 'bg-green-100 text-green-700'
    : t === 'PURCHASE' ? 'bg-teal-100 text-teal-700'
    : t === 'DISPENSE' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700';

  return (
    <Modal open onClose={onClose} title={`Stock ledger — ${med.name}`} wide>
      {loading ? (
        <Spinner />
      ) : movements.length === 0 ? (
        <p className="text-sm text-slate-500">No stock movements recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-2">When</th><th className="py-2">Type</th><th className="py-2 text-right">Change</th><th className="py-2 text-right">Balance</th><th className="py-2">Reason</th><th className="py-2">By</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="py-2 whitespace-nowrap text-slate-500">{fmtDateTime(m.createdAt)}</td>
                  <td className="py-2"><span className={`badge ${badge(m.type)}`}>{m.type}</span></td>
                  <td className={`py-2 text-right font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                  <td className="py-2 text-right">{m.balanceAfter}</td>
                  <td className="py-2 text-slate-500">{m.reason || '—'}{m.expiryDate ? ` (exp ${fmtDate(m.expiryDate)})` : ''}</td>
                  <td className="py-2 text-slate-500">{m.createdByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end"><button className="btn-secondary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
