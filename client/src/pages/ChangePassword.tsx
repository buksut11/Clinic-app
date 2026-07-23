import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { useToast } from '../components/ui';

export default function ChangePassword() {
  const toast = useToast();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) { toast('Passwords do not match', 'error'); return; }
    if (newPassword.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast('Password changed', 'success');
      navigate('/');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Change password</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <label className="label">Current password</label>
          <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/')}>Cancel</button>
          <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}
