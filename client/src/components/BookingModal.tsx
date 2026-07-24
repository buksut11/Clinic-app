import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Patient, User } from '../lib/types';
import { Modal, useToast, Select, DatePicker } from './ui';

// Add minutes to "HH:MM"
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function BookingModal({
  open,
  onClose,
  onBooked,
  presetPatientId,
  presetDate,
}: {
  open: boolean;
  onClose: () => void;
  onBooked: () => void;
  presetPatientId?: string;
  presetDate?: string;
}) {
  const toast = useToast();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPatientMode, setNewPatientMode] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [slotInfo, setSlotInfo] = useState<{ working: boolean; slots: string[]; workingHours?: { start: string; end: string } } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [f, setF] = useState({
    doctorId: '',
    date: presetDate || new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    reason: '',
    visitType: 'new',
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (open) {
      api.get('/settings/doctors').then((r) => {
        setDoctors(r.data);
        if (r.data[0]) setF((s) => ({ ...s, doctorId: s.doctorId || r.data[0].id }));
      });
      if (presetPatientId) {
        api.get(`/patients/${presetPatientId}`).then((r) => setPatient(r.data));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetPatientId]);

  useEffect(() => {
    if (!patientQuery) { setPatientResults([]); return; }
    const t = setTimeout(() => {
      api.get('/patients', { params: { q: patientQuery } }).then((r) => setPatientResults(r.data.slice(0, 6)));
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const slotLength = doctors.find((d) => d.id === f.doctorId)?.slotLength || 20;

  // Fetch available slots whenever the doctor or date changes (respects working hours)
  useEffect(() => {
    if (!open || !f.doctorId || !f.date) return;
    setLoadingSlots(true);
    setSlotInfo(null);
    api
      .get('/appointments/available-slots', { params: { doctorId: f.doctorId, date: f.date } })
      .then((r) => {
        setSlotInfo(r.data);
        // If the currently selected start time is no longer valid, reset it
        setF((s) => ({ ...s, startTime: r.data.slots.includes(s.startTime) ? s.startTime : r.data.slots[0] || '' }));
      })
      .catch(() => setSlotInfo({ working: false, slots: [] }))
      .finally(() => setLoadingSlots(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, f.doctorId, f.date]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let patientId = patient?.id;
      // Inline register new patient
      if (newPatientMode) {
        if (!newPatientName.trim()) { toast('Enter the new patient name', 'error'); setSaving(false); return; }
        const res = await api.post('/patients', { fullName: newPatientName, phone: newPatientPhone });
        patientId = res.data.id;
      }
      if (!patientId) { toast('Select a patient', 'error'); setSaving(false); return; }
      await api.post('/appointments', {
        patientId,
        doctorId: f.doctorId,
        date: f.date,
        startTime: f.startTime,
        endTime: addMinutes(f.startTime, slotLength),
        reason: f.reason,
        visitType: f.visitType,
      });
      toast('Appointment booked', 'success');
      onBooked();
      reset();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPatient(null);
    setPatientQuery('');
    setNewPatientMode(false);
    setNewPatientName('');
    setNewPatientPhone('');
  };

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Book appointment" wide>
      <form onSubmit={submit} className="space-y-4">
        {/* Patient selection */}
        <div>
          <label className="label">Patient *</label>
          {patient ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium">{patient.fullName} <span className="font-mono text-xs text-slate-400">{patient.patientNo}</span></span>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setPatient(null)}>Change</button>
            </div>
          ) : newPatientMode ? (
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Full name" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} />
              <input className="input" placeholder="Phone" value={newPatientPhone} onChange={(e) => setNewPatientPhone(e.target.value)} />
              <button type="button" className="col-span-2 text-start text-xs text-slate-500 hover:underline" onClick={() => setNewPatientMode(false)}>← Search existing instead</button>
            </div>
          ) : (
            <div className="relative">
              <input className="input" placeholder="Search patient by name / phone / ID…" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
              {patientResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {patientResults.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setPatient(p); setPatientResults([]); setPatientQuery(''); }} className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50">
                      {p.fullName} <span className="font-mono text-xs text-slate-400">{p.patientNo}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="mt-1 text-xs text-brand-600 hover:underline" onClick={() => setNewPatientMode(true)}>+ Register new patient inline</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Doctor *</label>
            <Select
              value={f.doctorId}
              onChange={(v) => set('doctorId', v)}
              allowClear={false}
              options={doctors.map((d) => ({ value: d.id, label: `${d.name}${d.specialty ? ` — ${d.specialty}` : ''}` }))}
            />
          </div>
          <div>
            <label className="label">Visit type</label>
            <Select
              value={f.visitType}
              onChange={(v) => set('visitType', v)}
              allowClear={false}
              options={[{ value: 'new', label: 'New visit' }, { value: 'follow-up', label: 'Follow-up' }]}
            />
          </div>
          <div>
            <label className="label">Date *</label>
            <DatePicker value={f.date} onChange={(v) => set('date', v)} min={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">
              Start time * <span className="font-normal text-slate-400">({slotLength} min slot)</span>
            </label>
            {loadingSlots ? (
              <div className="input flex items-center text-slate-400">Loading slots…</div>
            ) : slotInfo && !slotInfo.working ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">The doctor does not work on this day. Pick another date.</div>
            ) : slotInfo && slotInfo.slots.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">No free slots left{slotInfo.workingHours ? ` (${slotInfo.workingHours.start}–${slotInfo.workingHours.end})` : ''}.</div>
            ) : (
              <Select
                value={f.startTime}
                onChange={(v) => set('startTime', v)}
                allowClear={false}
                options={(slotInfo?.slots || []).map((s) => ({ value: s, label: s }))}
              />
            )}
          </div>
        </div>

        <div>
          <label className="label">Reason for visit</label>
          <input className="input" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Fever and cough" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={() => { onClose(); reset(); }}>Cancel</button>
          <button className="btn-primary" disabled={saving || !f.startTime || !(slotInfo?.slots.length)}>{saving ? 'Booking…' : 'Book appointment'}</button>
        </div>
      </form>
    </Modal>
  );
}
