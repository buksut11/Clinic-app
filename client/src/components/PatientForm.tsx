import { useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Patient } from '../lib/types';
import { useToast, Select, DatePicker } from './ui';

const GENDERS = ['Male', 'Female', 'Other'].map((g) => ({ value: g, label: g }));
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => ({ value: b, label: b }));

export default function PatientForm({
  patient,
  onSaved,
  onCancel,
}: {
  patient?: Patient | null;
  onSaved: (p: Patient) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    fullName: patient?.fullName || '',
    dob: patient?.dob ? patient.dob.slice(0, 10) : '',
    gender: patient?.gender || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    address: patient?.address || '',
    nationalId: patient?.nationalId || '',
    insuranceNo: patient?.insuranceNo || '',
    emergencyContact: patient?.emergencyContact || '',
    allergies: patient?.allergies || '',
    chronicConditions: patient?.chronicConditions || '',
    bloodType: patient?.bloodType || '',
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...f, dob: f.dob || null, email: f.email || null };
      const res = patient
        ? await api.put(`/patients/${patient.id}`, payload)
        : await api.post('/patients', payload);
      toast(patient ? 'Patient updated' : 'Patient registered', 'success');
      onSaved(res.data);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Full name *</label>
          <input className="input" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} required />
        </div>
        <div>
          <label className="label">Date of birth</label>
          <DatePicker value={f.dob} onChange={(v) => set('dob', v)} />
        </div>
        <div>
          <label className="label">Gender</label>
          <Select value={f.gender} onChange={(v) => set('gender', v)} options={GENDERS} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">National ID</label>
          <input className="input" value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
        </div>
        <div>
          <label className="label">Insurance number</label>
          <input className="input" value={f.insuranceNo} onChange={(e) => set('insuranceNo', e.target.value)} />
        </div>
        <div>
          <label className="label">Blood type</label>
          <Select value={f.bloodType} onChange={(v) => set('bloodType', v)} options={BLOOD} />
        </div>
        <div>
          <label className="label">Emergency contact</label>
          <input className="input" value={f.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} />
        </div>
        <div>
          <label className="label">Allergies</label>
          <input className="input" value={f.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="e.g. Penicillin" />
        </div>
        <div>
          <label className="label">Chronic conditions</label>
          <input className="input" value={f.chronicConditions} onChange={(e) => set('chronicConditions', e.target.value)} placeholder="e.g. Diabetes" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : patient ? 'Save changes' : 'Register patient'}</button>
      </div>
    </form>
  );
}
