import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Medication, PendingPrescription } from '../../lib/types';
import { Modal, useToast } from '../ui';
import { money } from '../../lib/format';

interface Line {
  medicationId: string;
  name: string;
  unit: string;
  available: number;
  unitPrice: number;
  quantity: number;
}

export default function DispenseModal({
  prescription,
  onClose,
  onDispensed,
}: {
  prescription: PendingPrescription | null;
  onClose: () => void;
  onDispensed: () => void;
}) {
  const toast = useToast();
  const [allMeds, setAllMeds] = useState<Medication[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/pharmacy/medications').then((r) => {
      const meds: Medication[] = r.data;
      setAllMeds(meds);
      // Try to pre-match prescription items to inventory by name/generic
      if (prescription) {
        const prefilled: Line[] = [];
        for (const it of prescription.items) {
          const needle = it.name.toLowerCase();
          const match = meds.find((m) =>
            needle.includes(m.name.toLowerCase()) ||
            (m.genericName && needle.includes(m.genericName.toLowerCase())) ||
            m.name.toLowerCase().includes(needle.split(' ')[0])
          );
          if (match && !prefilled.some((l) => l.medicationId === match.id)) {
            prefilled.push({
              medicationId: match.id,
              name: `${match.name}${match.strength ? ' ' + match.strength : ''}`,
              unit: match.unit,
              available: match.quantity,
              unitPrice: match.unitPrice,
              quantity: 1,
            });
          }
        }
        setLines(prefilled);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = search
    ? allMeds
        .filter((m) => m.isActive && (m.name.toLowerCase().includes(search.toLowerCase()) || (m.genericName || '').toLowerCase().includes(search.toLowerCase()) || m.sku.toLowerCase().includes(search.toLowerCase())))
        .filter((m) => !lines.some((l) => l.medicationId === m.id))
        .slice(0, 6)
    : [];

  const addMed = (m: Medication) => {
    setLines((s) => [...s, { medicationId: m.id, name: `${m.name}${m.strength ? ' ' + m.strength : ''}`, unit: m.unit, available: m.quantity, unitPrice: m.unitPrice, quantity: 1 }]);
    setSearch('');
  };
  const setQty = (i: number, q: number) => setLines((s) => s.map((l, idx) => (idx === i ? { ...l, quantity: q } : l)));
  const remove = (i: number) => setLines((s) => s.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const hasStockIssue = lines.some((l) => l.quantity > l.available || l.quantity < 1);

  const submit = async () => {
    if (lines.length === 0) { toast('Add at least one medication', 'error'); return; }
    if (hasStockIssue) { toast('Fix quantities — some exceed available stock', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/pharmacy/dispense', {
        patientId: prescription?.patient.id || null,
        prescriptionId: prescription?.id || null,
        notes: notes || null,
        items: lines.map((l) => ({ medicationId: l.medicationId, quantity: l.quantity })),
      });
      toast('Dispensed successfully', 'success');
      onDispensed();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={prescription ? `Dispense — ${prescription.patient.fullName}` : 'Over-the-counter dispense'} wide>
      {/* Prescription reference */}
      {prescription && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Prescribed by Dr. {prescription.doctor?.name}</p>
          {prescription.patient.allergies && prescription.patient.allergies.toLowerCase() !== 'none' && (
            <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">⚠ Allergy: {prescription.patient.allergies}</p>
          )}
          <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
            {prescription.items.map((it, i) => (
              <li key={i}>• <span className="font-medium">{it.name}</span> {it.dosage} {it.frequency} {it.duration}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Matched items are pre-filled below — verify quantities against the prescription before dispensing.</p>
        </div>
      )}

      {/* Add medication search */}
      <div className="relative mb-3">
        <label className="label">Add medication from inventory</label>
        <input className="input" placeholder="Search name, generic or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((m) => (
              <button key={m.id} type="button" onClick={() => addMed(m)} className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50">
                <span>{m.name} {m.strength} <span className="text-xs text-slate-400">{m.genericName}</span></span>
                <span className={`text-xs ${m.quantity === 0 ? 'text-red-600' : 'text-slate-400'}`}>{m.quantity} {m.unit}(s)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line items */}
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No items added yet. Search above to add medications.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((l, i) => {
            const over = l.quantity > l.available;
            return (
              <div key={l.medicationId} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{l.name}</p>
                  <p className={`text-xs ${over ? 'text-red-600' : 'text-slate-400'}`}>{l.available} {l.unit}(s) in stock{over ? ' — not enough!' : ''}</p>
                </div>
                <input
                  className={`input w-20 ${over ? 'border-red-400' : ''}`}
                  type="number"
                  min={1}
                  max={l.available}
                  value={l.quantity}
                  onChange={(e) => setQty(i, Number(e.target.value))}
                />
                <span className="w-20 text-end text-sm text-slate-600">{money(l.unitPrice * l.quantity)}</span>
                <button type="button" className="btn-ghost px-2 text-red-500" onClick={() => remove(i)}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <label className="label">Notes (optional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Counselled patient on dosage" />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <div className="text-lg font-bold text-slate-800">Total: {money(total)}</div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving || lines.length === 0 || hasStockIssue}>{saving ? 'Dispensing…' : 'Confirm & dispense'}</button>
        </div>
      </div>
    </Modal>
  );
}
