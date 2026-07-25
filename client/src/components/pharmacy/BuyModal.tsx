import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Medication } from '../../lib/types';
import { Modal, useToast } from '../ui';
import { money } from '../../lib/format';

interface Line {
  medicationId: string;
  name: string;
  unit: string;
  costPrice: number;
  quantity: number;
  batchNo: string;
  expiryDate: string;
}

// Buy stock from a supplier: adds quantity to inventory and records what it cost.
export default function BuyModal({ onClose, onBought }: { onClose: () => void; onBought: () => void }) {
  const toast = useToast();
  const [allMeds, setAllMeds] = useState<Medication[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/pharmacy/medications', { params: { includeInactive: 'true' } }).then((r) => setAllMeds(r.data));
  }, []);

  const results = search
    ? allMeds
        .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || (m.genericName || '').toLowerCase().includes(search.toLowerCase()) || m.sku.toLowerCase().includes(search.toLowerCase()))
        .filter((m) => !lines.some((l) => l.medicationId === m.id))
        .slice(0, 6)
    : [];

  const addMed = (m: Medication) => {
    setLines((s) => [
      ...s,
      {
        medicationId: m.id,
        name: `${m.name}${m.strength ? ' ' + m.strength : ''}`,
        unit: m.unit,
        costPrice: m.costPrice || 0,
        quantity: 1,
        batchNo: m.batchNo || '',
        expiryDate: m.expiryDate ? m.expiryDate.slice(0, 10) : '',
      },
    ]);
    setSearch('');
  };
  const setLine = (i: number, patch: Partial<Line>) => setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLines((s) => s.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + l.costPrice * l.quantity, 0);
  const invalid = lines.some((l) => l.quantity < 1 || l.costPrice < 0);

  const submit = async () => {
    if (lines.length === 0) { toast('Add at least one medication', 'error'); return; }
    if (invalid) { toast('Check quantities and cost prices', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/pharmacy/purchases', {
        supplier: supplier || null,
        invoiceRef: invoiceRef || null,
        notes: notes || null,
        items: lines.map((l) => ({
          medicationId: l.medicationId,
          quantity: l.quantity,
          costPrice: l.costPrice,
          batchNo: l.batchNo || null,
          expiryDate: l.expiryDate || null,
        })),
      });
      toast(`Purchase ${data.purchaseNo} recorded — stock updated`, 'success');
      onBought();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Buy stock from supplier" wide>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className="label">Supplier</label><input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. MediSupply Co." /></div>
        <div><label className="label">Supplier invoice / bill no.</label><input className="input" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="e.g. INV-88213" /></div>
        <div><label className="label">Note</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
      </div>

      {/* Add medication search */}
      <div className="relative mb-3">
        <label className="label">Add medication to purchase</label>
        <input className="input" placeholder="Search name, generic or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((m) => (
              <button key={m.id} type="button" onClick={() => addMed(m)} className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50">
                <span>{m.name} {m.strength} <span className="text-xs text-slate-400">{m.genericName}</span></span>
                <span className="text-xs text-slate-400">in stock: {m.quantity} {m.unit}(s)</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">Only medications already in the catalogue can be purchased. Add a new medication from the Inventory tab first.</p>
      </div>

      {/* Line items */}
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No items added yet. Search above to add medications to this purchase.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-1">Medication</th>
                <th className="py-1 text-right">Quantity</th>
                <th className="py-1 text-right">Cost / unit</th>
                <th className="py-1">Batch</th>
                <th className="py-1">Expiry</th>
                <th className="py-1 text-right">Amount</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.medicationId} className="border-b border-slate-50">
                  <td className="py-2 pr-2 font-medium text-slate-800">{l.name}</td>
                  <td className="py-2"><input className="input w-20 text-right" type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} /></td>
                  <td className="py-2"><input className="input w-24 text-right" type="number" min={0} step="0.01" value={l.costPrice} onChange={(e) => setLine(i, { costPrice: Number(e.target.value) })} /></td>
                  <td className="py-2"><input className="input w-24" value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} placeholder="Batch" /></td>
                  <td className="py-2"><input className="input w-36" type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} /></td>
                  <td className="py-2 text-right text-slate-600">{money(l.costPrice * l.quantity)}</td>
                  <td className="py-2 text-right"><button type="button" className="btn-ghost px-2 text-red-500" onClick={() => remove(i)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <div className="text-lg font-bold text-slate-800">Total cost: {money(total)}</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || lines.length === 0 || invalid}>{saving ? 'Saving…' : 'Record purchase'}</button>
        </div>
      </div>
    </Modal>
  );
}
