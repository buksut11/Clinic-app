import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState } from '../components/ui';
import { money } from '../lib/format';
import BarChart from '../components/BarChart';

interface DashboardData {
  todaysAppointments: number;
  newPatientsMonth: number;
  noShowRate: number;
  appointmentStatus: Record<string, number>;
  revenueToday?: number;
  revenueMonth?: number;
  outstandingTotal?: number;
  myAppointmentsToday?: number;
  pendingPrescriptions?: number;
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#94a3b8',
  CHECKED_IN: '#3b82f6',
  IN_CONSULTATION: '#f59e0b',
  COMPLETED: '#10b981',
  NO_SHOW: '#ef4444',
  CANCELLED: '#cbd5e1',
};

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
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

  const showMoney = can('ADMIN', 'RECEPTIONIST');
  const statusData = Object.entries(data.appointmentStatus || {})
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      label: status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      value: count,
      color: STATUS_COLORS[status] || '#0d9488',
    }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Welcome, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-500">Here's what's happening at the clinic today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Today's appointments" value={String(data.todaysAppointments)} accent="text-brand-600" />
        {data.myAppointmentsToday != null && <Stat label="My appointments today" value={String(data.myAppointmentsToday)} accent="text-brand-600" />}
        {data.pendingPrescriptions != null && <Stat label="Prescriptions to dispense" value={String(data.pendingPrescriptions)} accent={data.pendingPrescriptions > 0 ? 'text-amber-600' : undefined} />}
        <Stat label="New patients this month" value={String(data.newPatientsMonth)} />
        <Stat label="No-show rate (month)" value={`${data.noShowRate}%`} accent={data.noShowRate > 20 ? 'text-red-600' : 'text-slate-800'} />
        {showMoney && <Stat label="Revenue today" value={money(data.revenueToday || 0, currency)} accent="text-green-600" />}
        {showMoney && <Stat label="Revenue this month" value={money(data.revenueMonth || 0, currency)} accent="text-green-600" />}
        {showMoney && <Stat label="Outstanding balances" value={money(data.outstandingTotal || 0, currency)} accent="text-amber-600" />}
      </div>

      {/* Appointment status chart */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Appointments this month by status</h3>
          <BarChart data={statusData} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <QuickLink to="/queue" title="Today's Queue" hint="See who's waiting and check patients in." show={can('ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE')} />
          <QuickLink to="/appointments" title="Appointments" hint="Browse the calendar and book visits." show={can('ADMIN', 'DOCTOR', 'RECEPTIONIST')} />
          <QuickLink to="/patients" title="Patients" hint="Register and search patient records." show />
          <QuickLink to="/pharmacy" title="Pharmacy" hint="Dispense prescriptions and manage stock." show={can('ADMIN', 'PHARMACIST')} />
          <QuickLink to="/billing" title="Billing" hint="Create invoices and take payments." show={can('ADMIN', 'RECEPTIONIST')} />
          <QuickLink to="/reports" title="Reports" hint="Revenue, volume and outstanding balances." show={can('ADMIN')} />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, title, hint, show }: { to: string; title: string; hint: string; show: boolean }) {
  if (!show) return null;
  return (
    <Link to={to} className="card p-5 transition hover:border-brand-300 hover:shadow">
      <p className="font-semibold text-slate-800">{title} →</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </Link>
  );
}
