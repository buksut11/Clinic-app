import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState } from '../components/ui';
import { money } from '../lib/format';

interface DashboardData {
  todaysAppointments: number;
  revenueToday: number;
  revenueMonth: number;
  newPatientsMonth: number;
  noShowRate: number;
  outstandingTotal: number;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([api.get('/reports/dashboard'), api.get('/settings/clinic')])
      .then(([d, c]) => {
        setData(d.data);
        setCurrency(c.data.currency);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Welcome, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-500">Here's what's happening at the clinic today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Today's appointments" value={String(data.todaysAppointments)} accent="text-brand-600" />
        <Stat label="Revenue today" value={money(data.revenueToday, currency)} accent="text-green-600" />
        <Stat label="Revenue this month" value={money(data.revenueMonth, currency)} accent="text-green-600" />
        <Stat label="New patients this month" value={String(data.newPatientsMonth)} />
        <Stat label="No-show rate (month)" value={`${data.noShowRate}%`} accent={data.noShowRate > 20 ? 'text-red-600' : 'text-slate-800'} />
        <Stat label="Outstanding balances" value={money(data.outstandingTotal, currency)} accent="text-amber-600" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/queue" className="card p-5 transition hover:border-brand-300 hover:shadow">
          <p className="font-semibold text-slate-800">Today's Queue →</p>
          <p className="mt-1 text-sm text-slate-500">See who's waiting and check patients in.</p>
        </Link>
        <Link to="/appointments" className="card p-5 transition hover:border-brand-300 hover:shadow">
          <p className="font-semibold text-slate-800">Appointments →</p>
          <p className="mt-1 text-sm text-slate-500">Browse the calendar and book visits.</p>
        </Link>
        <Link to="/patients" className="card p-5 transition hover:border-brand-300 hover:shadow">
          <p className="font-semibold text-slate-800">Patients →</p>
          <p className="mt-1 text-sm text-slate-500">Register and search patient records.</p>
        </Link>
      </div>
    </div>
  );
}
