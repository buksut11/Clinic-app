import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Clinic, User, PriceItem, LabTest, AuditLog } from '../lib/types';
import { Spinner, Modal, useToast, useConfirm, Select, TimePicker } from '../components/ui';
import { fmtDateTime, money } from '../lib/format';

type Tab = 'clinic' | 'staff' | 'schedules' | 'prices' | 'lab' | 'audit';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('clinic');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'clinic', label: 'Clinic profile' },
    { key: 'staff', label: 'Staff' },
    { key: 'schedules', label: 'Doctor schedules' },
    { key: 'prices', label: 'Price list' },
    { key: 'lab', label: 'Lab catalog' },
    { key: 'audit', label: 'Audit log' },
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Settings</h1>
      <div className="segmented mb-5 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'is-active' : ''}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'clinic' && <ClinicTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'schedules' && <SchedulesTab />}
      {tab === 'prices' && <PricesTab />}
      {tab === 'lab' && <LabCatalogTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// -------------------------------------------------------------------------
function ClinicTab() {
  const toast = useToast();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/settings/clinic').then((r) => setClinic(r.data)); }, []);
  if (!clinic) return <Spinner />;

  const set = (k: keyof Clinic, v: any) => setClinic({ ...clinic, [k]: v });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings/clinic', {
        name: clinic.name, address: clinic.address, phone: clinic.phone,
        email: clinic.email, currency: clinic.currency, taxRate: Number(clinic.taxRate),
      });
      toast('Clinic profile saved', 'success');
    } catch (err) { toast(errMsg(err), 'error'); } finally { setSaving(false); }
  };
  const uploadLogo = async (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    const r = await api.post('/settings/clinic/logo', fd);
    setClinic(r.data);
    toast('Logo updated', 'success');
  };

  return (
    <form onSubmit={save} className="card max-w-2xl space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Clinic name</label><input className="input" value={clinic.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={clinic.address} onChange={(e) => set('address', e.target.value)} /></div>
        <div><label className="label">Phone</label><input className="input" value={clinic.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={clinic.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="label">Currency</label><input className="input" value={clinic.currency} onChange={(e) => set('currency', e.target.value)} /></div>
        <div><label className="label">Default tax rate (%)</label><input className="input" type="number" value={clinic.taxRate} onChange={(e) => set('taxRate', e.target.value)} /></div>
      </div>
      <div>
        <label className="label">Logo (shown on prescriptions & invoices)</label>
        <div className="flex items-center gap-3">
          {clinic.logoPath && <img src={`/api/documents/file/${clinic.logoPath}`} alt="logo" className="h-12 w-12 rounded object-contain" />}
          <label className="btn-secondary cursor-pointer">Upload logo<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label>
        </div>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  );
}

// -------------------------------------------------------------------------
function StaffTab() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');

  const load = () => { setLoading(true); api.get('/settings/users').then((r) => setUsers(r.data)).finally(() => setLoading(false)); };
  useEffect(load, []);

  const doReset = async () => {
    if (!resetTarget || newPw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    await api.post(`/settings/users/${resetTarget.id}/reset-password`, { password: newPw });
    toast('Password reset', 'success');
    setResetTarget(null); setNewPw('');
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setCreating(true)}>Add staff member</button></div>
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th><th className="th">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.name}</td>
                <td className="td text-slate-500">{u.email}</td>
                <td className="td"><span className="badge bg-brand-50 text-brand-700 capitalize">{u.role.toLowerCase()}</span></td>
                <td className="td">{u.isActive ? <span className="badge bg-green-100 text-green-700">Active</span> : <span className="badge bg-slate-100 text-slate-400">Inactive</span>}</td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="text-brand-600 hover:underline" onClick={() => setEditUser(u)}>Edit</button>
                    <button className="text-slate-500 hover:underline" onClick={() => setResetTarget(u)}>Reset password</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editUser) && (
        <UserModal user={editUser} onClose={() => { setCreating(false); setEditUser(null); }} onSaved={() => { setCreating(false); setEditUser(null); load(); }} />
      )}

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset password — ${resetTarget?.name}`}>
        <label className="label">New password</label>
        <input className="input" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" />
        <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setResetTarget(null)}>Cancel</button><button className="btn-primary" onClick={doReset}>Reset</button></div>
      </Modal>
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', password: '',
    role: user?.role || 'RECEPTIONIST', specialty: user?.specialty || '',
    signatureLine: user?.signatureLine || '', slotLength: user?.slotLength || 20, isActive: user?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (user) {
        await api.put(`/settings/users/${user.id}`, {
          name: f.name, role: f.role, specialty: f.specialty || null,
          signatureLine: f.signatureLine || null, slotLength: Number(f.slotLength), isActive: f.isActive,
        });
      } else {
        await api.post('/settings/users', {
          name: f.name, email: f.email, password: f.password, role: f.role,
          specialty: f.specialty || null, signatureLine: f.signatureLine || null, slotLength: Number(f.slotLength),
        });
      }
      toast(user ? 'Staff updated' : 'Staff created', 'success');
      onSaved();
    } catch (err) { toast(errMsg(err), 'error'); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={user ? 'Edit staff member' : 'Add staff member'} wide>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><label className="label">Role</label>
          <Select
            allowClear={false}
            value={f.role}
            onChange={(v) => set('role', v)}
            options={[
              { value: 'ADMIN', label: 'Admin' },
              { value: 'DOCTOR', label: 'Doctor' },
              { value: 'RECEPTIONIST', label: 'Receptionist' },
              { value: 'NURSE', label: 'Nurse' },
              { value: 'PHARMACIST', label: 'Pharmacist' },
            ]}
          />
        </div>
        {!user && <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>}
        {!user && <div><label className="label">Password</label><input className="input" type="text" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" /></div>}
        {f.role === 'DOCTOR' && <>
          <div><label className="label">Specialty</label><input className="input" value={f.specialty} onChange={(e) => set('specialty', e.target.value)} /></div>
          <div><label className="label">Slot length (min)</label><input className="input" type="number" value={f.slotLength} onChange={(e) => set('slotLength', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">Signature line (on prescriptions)</label><input className="input" value={f.signatureLine} onChange={(e) => set('signatureLine', e.target.value)} placeholder="e.g. Dr. Jane Doe, MD" /></div>
        </>}
        {user && <div className="col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (can log in)</label></div>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
    </Modal>
  );
}

// -------------------------------------------------------------------------
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function SchedulesTab() {
  const toast = useToast();
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [rows, setRows] = useState<{ weekday: number; enabled: boolean; startTime: string; endTime: string }[]>([]);

  useEffect(() => { api.get('/settings/doctors').then((r) => { setDoctors(r.data); if (r.data[0]) setDoctorId(r.data[0].id); }); }, []);
  useEffect(() => {
    if (!doctorId) return;
    api.get(`/settings/schedules/${doctorId}`).then((r) => {
      const existing = r.data as { weekday: number; startTime: string; endTime: string }[];
      setRows(WEEKDAYS.map((_, wd) => {
        const found = existing.find((e) => e.weekday === wd);
        return { weekday: wd, enabled: !!found, startTime: found?.startTime || '09:00', endTime: found?.endTime || '17:00' };
      }));
    });
  }, [doctorId]);

  const save = async () => {
    const schedules = rows.filter((r) => r.enabled).map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));
    await api.put(`/settings/schedules/${doctorId}`, { schedules });
    toast('Schedule saved', 'success');
  };

  return (
    <div className="card max-w-2xl p-6">
      <label className="label">Doctor</label>
      <Select
        className="mb-4 w-56"
        allowClear={false}
        value={doctorId}
        onChange={setDoctorId}
        options={doctors.map((d) => ({ value: d.id, label: d.name }))}
      />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.weekday} className="flex items-center gap-3">
            <label className="flex w-32 items-center gap-2 text-sm">
              <input type="checkbox" checked={r.enabled} onChange={(e) => setRows((s) => s.map((x, idx) => idx === i ? { ...x, enabled: e.target.checked } : x))} />
              {WEEKDAYS[r.weekday]}
            </label>
            <TimePicker className="w-32" value={r.startTime} disabled={!r.enabled} onChange={(v) => setRows((s) => s.map((x, idx) => idx === i ? { ...x, startTime: v } : x))} />
            <span className="text-slate-400">to</span>
            <TimePicker className="w-32" value={r.endTime} disabled={!r.enabled} onChange={(v) => setRows((s) => s.map((x, idx) => idx === i ? { ...x, endTime: v } : x))} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={save}>Save schedule</button></div>
    </div>
  );
}

// -------------------------------------------------------------------------
function PricesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => api.get('/settings/prices').then((r) => setPrices(r.data));
  useEffect(() => { load(); api.get('/settings/doctors').then((r) => setDoctors(r.data)); }, []);

  const remove = async (p: PriceItem) => {
    const ok = await confirm({ title: 'Delete price item?', message: `Delete "${p.name}"?`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await api.delete(`/settings/prices/${p.id}`);
    toast('Deleted', 'success');
    load();
  };

  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setCreating(true)}>Add price item</button></div>
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr><th className="th">Type</th><th className="th">Name</th><th className="th">Doctor / Visit</th><th className="th">Price</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {prices.map((p) => (
              <tr key={p.id}>
                <td className="td capitalize">{p.type}</td>
                <td className="td font-medium">{p.name}</td>
                <td className="td text-slate-500">{[p.doctor?.name, p.visitType].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td">{money(p.price)}</td>
                <td className="td"><div className="flex gap-2"><button className="text-brand-600 hover:underline" onClick={() => setEditing(p)}>Edit</button><button className="text-red-500 hover:underline" onClick={() => remove(p)}>Delete</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(creating || editing) && <PriceModal item={editing} doctors={doctors} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />}
    </div>
  );
}

function PriceModal({ item, doctors, onClose, onSaved }: { item: PriceItem | null; doctors: User[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ type: item?.type || 'consultation', name: item?.name || '', visitType: item?.visitType || '', doctorId: item?.doctorId || '', price: item?.price ?? 0, isActive: item?.isActive ?? true });
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      const payload = { type: f.type, name: f.name, visitType: f.visitType || null, doctorId: f.doctorId || null, price: Number(f.price), isActive: f.isActive };
      if (item) await api.put(`/settings/prices/${item.id}`, payload);
      else await api.post('/settings/prices', payload);
      toast('Saved', 'success');
      onSaved();
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  return (
    <Modal open onClose={onClose} title={item ? 'Edit price item' : 'Add price item'}>
      <div className="space-y-3">
        <div><label className="label">Type</label>
          <Select
            allowClear={false}
            value={f.type}
            onChange={(v) => set('type', v)}
            options={[
              { value: 'consultation', label: 'Consultation' },
              { value: 'procedure', label: 'Procedure' },
              { value: 'labtest', label: 'Lab test' },
            ]}
          />
        </div>
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        {f.type === 'consultation' && <>
          <div><label className="label">Doctor (optional)</label>
            <Select
              value={f.doctorId}
              onChange={(v) => set('doctorId', v)}
              placeholder="Any doctor"
              options={doctors.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div><label className="label">Visit type (optional)</label>
            <Select
              value={f.visitType}
              onChange={(v) => set('visitType', v)}
              placeholder="Any"
              options={[{ value: 'new', label: 'New' }, { value: 'follow-up', label: 'Follow-up' }]}
            />
          </div>
        </>}
        <div><label className="label">Price</label><input className="input" type="number" min={0} step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></div>
    </Modal>
  );
}

// -------------------------------------------------------------------------
function LabCatalogTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);

  const load = () => api.get('/settings/lab-tests').then((r) => setTests(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) { toast('Enter a test name', 'error'); return; }
    try {
      await api.post('/settings/lab-tests', { name, price: Number(price) });
      toast('Test added', 'success');
      setName(''); setPrice(0); load();
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  const remove = async (t: LabTest) => {
    const ok = await confirm({ title: 'Delete test?', message: `Delete "${t.name}"?`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await api.delete(`/settings/lab-tests/${t.id}`);
    load();
  };

  return (
    <div className="max-w-2xl">
      <div className="card mb-4 flex items-end gap-2 p-4">
        <div className="flex-1"><label className="label">Test name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CBC" /></div>
        <div className="w-32"><label className="label">Price</label><input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
        <button className="btn-primary" onClick={add}>Add</button>
      </div>
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50"><tr><th className="th">Test</th><th className="th">Price</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {tests.map((t) => (
              <tr key={t.id}><td className="td font-medium">{t.name}</td><td className="td">{money(t.price)}</td><td className="td"><button className="text-red-500 hover:underline" onClick={() => remove(t)}>Delete</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/settings/audit').then((r) => setLogs(r.data)).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  return (
    <div className="card overflow-hidden">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50"><tr><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Details</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="td whitespace-nowrap text-slate-400">{fmtDateTime(l.createdAt)}</td>
              <td className="td">{l.userName || 'System'}</td>
              <td className="td"><span className="badge bg-slate-100 text-slate-600">{l.action}</span></td>
              <td className="td text-slate-500">{l.entity || '—'}</td>
              <td className="td text-slate-500">{l.details || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
