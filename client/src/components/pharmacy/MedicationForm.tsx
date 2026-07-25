import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Medication } from '../../lib/types';
import { useToast, Select, DatePicker } from '../ui';

const FORMS = ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other'];
const FORM_OPTIONS = FORMS.map((x) => ({ value: x, label: x.charAt(0).toUpperCase() + x.slice(1) }));

export default function MedicationForm({
  med,
  onSaved,
  onCancel,
}: {
  med?: Medication | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    name: med?.name || '',
    genericName: med?.genericName || '',
    form: med?.form || 'tablet',
    strength: med?.strength || '',
    unit: med?.unit || 'tablet',
    quantity: med ? undefined : 0, // opening stock only on create
    reorderLevel: med?.reorderLevel ?? 20,
    unitPrice: med?.unitPrice ?? 0,
    costPrice: med?.costPrice ?? 0,
    batchNo: med?.batchNo || '',
    expiryDate: med?.expiryDate ? med.expiryDate.slice(0, 10) : '',
    supplier: med?.supplier || '',
    location: med?.location || '',
  });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        name: f.name,
        genericName: f.genericName || null,
        form: f.form,
        strength: f.strength || null,
        unit: f.unit,
        reorderLevel: Number(f.reorderLevel),
        unitPrice: Number(f.unitPrice),
        costPrice: Number(f.costPrice),
        batchNo: f.batchNo || null,
        expiryDate: f.expiryDate || null,
        supplier: f.supplier || null,
        location: f.location || null,
      };
      if (!med) payload.quantity = Number(f.quantity || 0);
      if (med) await api.put(`/pharmacy/medications/${med.id}`, payload);
      else await api.post('/pharmacy/medications', payload);
      toast(med ? 'Medication updated' : 'Medication added', 'success');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><label className="label">Name *</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Amoxil" /></div>
        <div><label className="label">Generic name</label><input className="input" value={f.genericName} onChange={(e) => set('genericName', e.target.value)} placeholder="e.g. Amoxicillin" /></div>
        <div><label className="label">Form</label>
          <Select allowClear={false} value={f.form} onChange={(v) => set('form', v)} options={FORM_OPTIONS} />
        </div>
        <div><label className="label">Strength</label><input className="input" value={f.strength} onChange={(e) => set('strength', e.target.value)} placeholder="e.g. 500mg" /></div>
        <div><label className="label">Dispensing unit</label><input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. tablet, bottle, vial" /></div>
        <div><label className="label">Cost price (buy)</label><input className="input" type="number" min={0} step="0.01" value={f.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="What you pay per unit" /></div>
        <div><label className="label">Selling price</label><input className="input" type="number" min={0} step="0.01" value={f.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="What you charge per unit" /></div>
        {!med && <div><label className="label">Opening stock</label><input className="input" type="number" min={0} value={f.quantity} onChange={(e) => set('quantity', e.target.value)} /></div>}
        <div><label className="label">Reorder level</label><input className="input" type="number" min={0} value={f.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} /></div>
        <div><label className="label">Batch no.</label><input className="input" value={f.batchNo} onChange={(e) => set('batchNo', e.target.value)} /></div>
        <div><label className="label">Expiry date</label><DatePicker value={f.expiryDate} onChange={(v) => set('expiryDate', v)} /></div>
        <div><label className="label">Supplier</label><input className="input" value={f.supplier} onChange={(e) => set('supplier', e.target.value)} /></div>
        <div><label className="label">Location (shelf/bin)</label><input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : med ? 'Save changes' : 'Add medication'}</button>
      </div>
    </form>
  );
}
