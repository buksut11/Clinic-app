import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../lib/api';

const DEMO = [
  { role: 'Admin', email: 'admin@clinic.com', password: 'admin123' },
  { role: 'Doctor', email: 'dr.smith@clinic.com', password: 'doctor123' },
  { role: 'Receptionist', email: 'reception@clinic.com', password: 'reception123' },
  { role: 'Nurse', email: 'nurse@clinic.com', password: 'nurse123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@clinic.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-brand-600 p-10 text-white md:flex">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl">✚</div>
            <h1 className="text-2xl font-bold">Riverside Clinic</h1>
            <p className="mt-2 text-sm text-brand-100">Management System</p>
          </div>
          <ul className="space-y-2 text-sm text-brand-50">
            <li>• Patients, appointments & medical records</li>
            <li>• Prescriptions, lab orders & billing</li>
            <li>• Reports, dashboards & staff management</li>
          </ul>
          <p className="text-xs text-brand-200">Calm, simple software for busy clinics.</p>
        </div>

        {/* Form */}
        <div className="p-8 md:p-10">
          <h2 className="text-xl font-bold text-slate-800">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Log in to continue</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">Demo accounts — click to fill</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-start text-xs hover:border-brand-300"
                >
                  <div className="font-semibold text-slate-700">{d.role}</div>
                  <div className="text-slate-400">{d.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
