import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { Appointment } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, EmptyState, StatusBadge, useToast } from '../components/ui';

export default function Queue() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api
      .get('/appointments/queue')
      .then((r) => setAppts(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // auto-refresh queue
    return () => clearInterval(t);
  }, []);

  const setStatus = async (a: Appointment, status: string) => {
    await api.put(`/appointments/${a.id}/status`, { status });
    toast(`Marked ${status.replace('_', ' ').toLowerCase()}`, 'success');
    load();
  };

  const waiting = appts.filter((a) => a.status === 'CHECKED_IN');
  const scheduled = appts.filter((a) => a.status === 'SCHEDULED');
  const inConsult = appts.filter((a) => a.status === 'IN_CONSULTATION');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Today's Queue</h1>
        <p className="text-sm text-slate-500">Auto-refreshes every 20 seconds · {new Date().toDateString()}</p>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : appts.length === 0 ? (
        <EmptyState title="No patients in the queue" hint="Checked-in patients will appear here." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Column title="Waiting" tint="blue" appts={waiting}>
            {(a) => (
              <>
                {can('ADMIN', 'DOCTOR') && <button className="btn-primary w-full py-2.5" onClick={() => navigate(`/consultation/${a.id}`)}>Start consultation</button>}
                {can('NURSE') && <button className="btn-primary w-full py-2.5" onClick={() => navigate(`/consultation/${a.id}`)}>Record vitals</button>}
              </>
            )}
          </Column>
          <Column title="Scheduled (not yet arrived)" tint="slate" appts={scheduled}>
            {(a) => (
              can('ADMIN', 'RECEPTIONIST') ? (
                <button className="btn-primary w-full py-2.5" onClick={() => setStatus(a, 'CHECKED_IN')}>Check in</button>
              ) : null
            )}
          </Column>
          <Column title="In consultation" tint="amber" appts={inConsult}>
            {(a) => (
              can('ADMIN', 'DOCTOR') ? (
                <button className="btn-secondary w-full py-2.5" onClick={() => navigate(`/consultation/${a.id}`)}>Open</button>
              ) : null
            )}
          </Column>
        </div>
      )}
    </div>
  );
}

function Column({
  title, tint, appts, children,
}: {
  title: string;
  tint: 'blue' | 'slate' | 'amber';
  appts: Appointment[];
  children: (a: Appointment) => React.ReactNode;
}) {
  const tints = { blue: 'bg-blue-50 text-blue-700', slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-50 text-amber-700' };
  return (
    <div>
      <div className={`mb-3 flex items-center justify-between rounded-lg px-3 py-2 ${tints[tint]}`}>
        <span className="text-sm font-semibold">{title}</span>
        <span className="rounded-full bg-white/70 px-2 text-sm font-bold">{appts.length}</span>
      </div>
      <div className="space-y-3">
        {appts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-300">Empty</p>
        ) : (
          appts.map((a, i) => {
            const allergy = a.patient?.allergies && a.patient.allergies.toLowerCase() !== 'none';
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">{i + 1}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{a.patient?.fullName}</p>
                      <p className="text-xs text-slate-400">{a.startTime} · Dr. {a.doctor?.name}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                {allergy && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">⚠ Allergy: {a.patient?.allergies}</div>}
                <div className="mt-3">{children(a)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
