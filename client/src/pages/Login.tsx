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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Vibrant ambient background with floating colour blooms */}
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'linear-gradient(135deg,#0f766e 0%,#0891b2 45%,#4f46e5 100%)' }} />
      <div className="pointer-events-none absolute -left-32 -top-32 -z-10 h-96 w-96 rounded-full opacity-60 blur-3xl" style={{ background: 'radial-gradient(circle,#5eead4,transparent 70%)' }} />
      <div className="pointer-events-none absolute -bottom-32 -right-24 -z-10 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle,#f0abfc,transparent 70%)' }} />
      <div className="pointer-events-none absolute right-1/4 top-1/4 -z-10 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle,#7dd3fc,transparent 70%)' }} />

      <div className="glass-strong grid w-full max-w-4xl overflow-hidden rounded-[2rem] shadow-2xl md:grid-cols-2" style={{ boxShadow: '0 30px 80px rgba(2,20,40,0.45)' }}>
        {/* Brand panel */}
        <div className="hidden flex-col justify-between p-10 text-white md:flex" style={{ background: 'linear-gradient(160deg,rgba(13,148,136,0.55),rgba(79,70,229,0.35))' }}>
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/25 text-2xl backdrop-blur">✚</div>
            <h1 className="text-3xl font-bold tracking-tight">Riverside Clinic</h1>
            <p className="mt-2 text-sm text-white/80">Management System</p>
          </div>
          <ul className="space-y-2.5 text-sm text-white/90">
            <li>• Patients, appointments & medical records</li>
            <li>• Prescriptions, lab orders & pharmacy</li>
            <li>• Billing, reports & staff management</li>
          </ul>
          <p className="text-xs text-white/60">Calm, simple software for busy clinics.</p>
        </div>

        {/* Form */}
        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Welcome back</h2>
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
            {error && <div className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/50 bg-white/40 p-3 backdrop-blur">
            <p className="mb-2 text-xs font-semibold text-slate-500">Demo accounts — click to fill</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="rounded-xl border border-white/60 bg-white/60 px-2.5 py-2 text-start text-xs transition hover:bg-white/90"
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
