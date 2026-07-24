import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, errMsg, openFile } from '../lib/api';
import { Appointment, PrescriptionItem, LabTest } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, StatusBadge, useToast, Modal, Select, DatePicker } from '../components/ui';
import { age, fmtDate, fmtDateTime } from '../lib/format';

export default function Consultation() {
  const { appointmentId } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = () => {
    setError('');
    api
      .get(`/appointments/${appointmentId}`)
      .then((r) => setAppt(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [appointmentId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!appt) return null;

  const p = appt.patient!;
  const hasAllergy = p.allergies && p.allergies.toLowerCase() !== 'none';
  const hasChronic = p.chronicConditions && p.chronicConditions.toLowerCase() !== 'none';

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-slate-700">← Back</button>
        <StatusBadge status={appt.status} />
      </div>

      {/* Patient summary */}
      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to={`/patients/${p.id}`} className="text-lg font-bold text-brand-700 hover:underline">{p.fullName}</Link>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{p.patientNo}</span> · {age(p.dob)} · {p.gender || '-'} · {p.bloodType || 'n/a'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Visit: {fmtDate(appt.date)} {appt.startTime} · Dr. {appt.doctor?.name} · {appt.reason || appt.visitType}</p>
          </div>
          <div className="flex gap-2">
            {appt.status !== 'COMPLETED' && can('ADMIN', 'DOCTOR') && (
              <button className="btn-primary" onClick={async () => { await api.post(`/consultations/appointment/${appt.id}/complete`); toast('Consultation completed', 'success'); load(); }}>
                Complete visit
              </button>
            )}
          </div>
        </div>
        {(hasAllergy || hasChronic) && (
          <div className="mt-3 flex flex-wrap gap-3">
            {hasAllergy && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">⚠ Allergies: {p.allergies}</div>}
            {hasChronic && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">⚠ Chronic: {p.chronicConditions}</div>}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {can('ADMIN', 'DOCTOR') && <ConsultForm appt={appt} onSaved={load} onShowHistory={() => setShowHistory(true)} />}
          {can('ADMIN', 'DOCTOR') && <PrescriptionPanel appt={appt} onSaved={load} />}
          {can('ADMIN', 'DOCTOR') && <LabPanel appt={appt} onSaved={load} />}
        </div>
        <div className="space-y-4">
          <VitalsPanel appt={appt} onSaved={load} />
        </div>
      </div>

      {/* Edit history */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Consultation edit history" wide>
        {!appt.consultation?.edits?.length ? (
          <p className="text-sm text-slate-500">No previous versions. This note has not been amended.</p>
        ) : (
          <div className="space-y-3">
            {appt.consultation.edits.map((ed) => {
              const snap = JSON.parse(ed.snapshot);
              return (
                <div key={ed.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="mb-1 text-xs text-slate-400">Before edit by {ed.editedByName} · {fmtDateTime(ed.createdAt)}</p>
                  {snap.diagnosis && <p><b>Diagnosis:</b> {snap.diagnosis}</p>}
                  {snap.chiefComplaint && <p><b>Chief complaint:</b> {snap.chiefComplaint}</p>}
                  {snap.treatmentPlan && <p><b>Plan:</b> {snap.treatmentPlan}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

// -------------------------------------------------------------------------
function ConsultForm({ appt, onSaved, onShowHistory }: { appt: Appointment; onSaved: () => void; onShowHistory: () => void }) {
  const toast = useToast();
  const c = appt.consultation;
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    chiefComplaint: c?.chiefComplaint || appt.reason || '',
    symptoms: c?.symptoms || '',
    examinationNotes: c?.examinationNotes || '',
    diagnosis: c?.diagnosis || '',
    icd10: c?.icd10 || '',
    treatmentPlan: c?.treatmentPlan || '',
    followUpDate: c?.followUpDate ? c.followUpDate.slice(0, 10) : '',
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/consultations/appointment/${appt.id}`, { ...f, followUpDate: f.followUpDate || null });
      toast('Consultation saved', 'success');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Consultation notes</h3>
        {c && (
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onShowHistory}>
            Edit history {c.edits?.length ? `(${c.edits.length})` : ''}
          </button>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <label className="label">Chief complaint</label>
          <input className="input" value={f.chiefComplaint} onChange={(e) => set('chiefComplaint', e.target.value)} />
        </div>
        <div>
          <label className="label">Symptoms</label>
          <textarea className="input" rows={2} value={f.symptoms} onChange={(e) => set('symptoms', e.target.value)} />
        </div>
        <div>
          <label className="label">Examination notes</label>
          <textarea className="input" rows={2} value={f.examinationNotes} onChange={(e) => set('examinationNotes', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Diagnosis</label>
            <input className="input" value={f.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} />
          </div>
          <div>
            <label className="label">ICD-10</label>
            <input className="input" value={f.icd10} onChange={(e) => set('icd10', e.target.value)} placeholder="e.g. J06.9" />
          </div>
        </div>
        <div>
          <label className="label">Treatment plan</label>
          <textarea className="input" rows={2} value={f.treatmentPlan} onChange={(e) => set('treatmentPlan', e.target.value)} />
        </div>
        <div>
          <label className="label">Follow-up date</label>
          <DatePicker value={f.followUpDate} onChange={(v) => set('followUpDate', v)} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-400">{c ? `Records are append-only — previous versions are kept.` : ''}</p>
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : c ? 'Amend note' : 'Save note'}</button>
      </div>
    </form>
  );
}

// -------------------------------------------------------------------------
function VitalsPanel({ appt, onSaved }: { appt: Appointment; onSaved: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const v = appt.vitals;
  const editable = can('ADMIN', 'NURSE', 'DOCTOR');
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    weight: v?.weight?.toString() || '',
    height: v?.height?.toString() || '',
    bpSystolic: v?.bpSystolic?.toString() || '',
    bpDiastolic: v?.bpDiastolic?.toString() || '',
    temperature: v?.temperature?.toString() || '',
    pulse: v?.pulse?.toString() || '',
  });
  const set = (k: string, val: string) => setF((s) => ({ ...s, [k]: val }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const num = (x: string) => (x === '' ? null : Number(x));
      await api.put(`/vitals/appointment/${appt.id}`, {
        weight: num(f.weight), height: num(f.height),
        bpSystolic: num(f.bpSystolic), bpDiastolic: num(f.bpDiastolic),
        temperature: num(f.temperature), pulse: num(f.pulse),
      });
      toast('Vitals saved', 'success');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="card p-5">
      <h3 className="mb-3 font-semibold text-slate-800">Vitals</h3>
      {!editable ? (
        <p className="text-sm text-slate-400">Read-only</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)" value={f.weight} onChange={(v) => set('weight', v)} />
          <Field label="Height (cm)" value={f.height} onChange={(v) => set('height', v)} />
          <Field label="BP systolic" value={f.bpSystolic} onChange={(v) => set('bpSystolic', v)} />
          <Field label="BP diastolic" value={f.bpDiastolic} onChange={(v) => set('bpDiastolic', v)} />
          <Field label="Temp (°C)" value={f.temperature} onChange={(v) => set('temperature', v)} />
          <Field label="Pulse (bpm)" value={f.pulse} onChange={(v) => set('pulse', v)} />
        </div>
      )}
      {editable && <button className="btn-primary mt-4 w-full" disabled={saving}>{saving ? 'Saving…' : 'Save vitals'}</button>}
    </form>
  );
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// -------------------------------------------------------------------------
function PrescriptionPanel({ appt, onSaved }: { appt: Appointment; onSaved: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<PrescriptionItem[]>([{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const setItem = (i: number, k: keyof PrescriptionItem, v: string) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((s) => [...s, { name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  const removeItem = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const save = async () => {
    const valid = items.filter((i) => i.name.trim());
    if (!valid.length) { toast('Add at least one medicine', 'error'); return; }
    setSaving(true);
    try {
      const res = await api.post('/prescriptions', {
        patientId: appt.patientId,
        appointmentId: appt.id,
        notes,
        items: valid,
      });
      toast('Prescription created', 'success');
      openFile(`/prescriptions/${res.data.id}/pdf`);
      setItems([{ name: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
      setNotes('');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="mb-3 font-semibold text-slate-800">New prescription</h3>
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <input className="input col-span-2" placeholder="Medicine name *" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} />
              <input className="input" placeholder="Dosage (e.g. 500mg)" value={it.dosage || ''} onChange={(e) => setItem(i, 'dosage', e.target.value)} />
              <input className="input" placeholder="Frequency (e.g. 2x daily)" value={it.frequency || ''} onChange={(e) => setItem(i, 'frequency', e.target.value)} />
              <input className="input" placeholder="Duration (e.g. 7 days)" value={it.duration || ''} onChange={(e) => setItem(i, 'duration', e.target.value)} />
              <input className="input" placeholder="Instructions" value={it.instructions || ''} onChange={(e) => setItem(i, 'instructions', e.target.value)} />
            </div>
            {items.length > 1 && <button className="mt-2 text-xs text-red-500 hover:underline" onClick={() => removeItem(i)}>Remove</button>}
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm text-brand-600 hover:underline" onClick={addItem}>+ Add medicine</button>
      <textarea className="input mt-3" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn-primary mt-3" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create & print prescription'}</button>
    </div>
  );
}

// -------------------------------------------------------------------------
function LabPanel({ appt, onSaved }: { appt: Appointment; onSaved: () => void }) {
  const toast = useToast();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');

  useEffect(() => {
    api.get('/settings/lab-tests').then((r) => setTests(r.data.filter((t: LabTest) => t.isActive)));
  }, []);

  const order = async () => {
    const testName = custom.trim() || selected;
    if (!testName) { toast('Select or type a test', 'error'); return; }
    try {
      await api.post('/lab', { patientId: appt.patientId, appointmentId: appt.id, testName });
      toast('Lab test ordered', 'success');
      setSelected('');
      setCustom('');
      onSaved();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  return (
    <div className="card p-5">
      <h3 className="mb-3 font-semibold text-slate-800">Order lab test</h3>
      <div className="flex flex-wrap gap-2">
        <Select
          className="flex-1"
          value={selected}
          onChange={(v) => { setSelected(v); setCustom(''); }}
          placeholder="Choose from catalog…"
          options={tests.map((t) => ({ value: t.name, label: t.name }))}
        />
        <button className="btn-primary" onClick={order}>Order</button>
      </div>
      {appt.labOrders && appt.labOrders.length > 0 && (
        <div className="mt-4 space-y-2">
          {appt.labOrders.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{l.testName}</span>
              <StatusBadge status={l.status} kind="lab" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
