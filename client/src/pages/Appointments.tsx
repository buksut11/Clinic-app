import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { Appointment, User } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, StatusBadge, useToast, useConfirm, Modal } from '../components/ui';
import { IconPlus } from '../components/icons';
import BookingModal from '../components/BookingModal';
import {
  startOfWeek, addDays, format, parseISO, isSameDay, addWeeks, subWeeks,
} from 'date-fns';

export default function Appointments() {
  const { user, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'week' | 'day'>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [doctors, setDoctors] = useState<User[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(!!params.get('patientId'));
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = view === 'week' ? Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)) : [anchor];

  useEffect(() => {
    api.get('/settings/doctors').then((r) => setDoctors(r.data));
  }, []);

  const load = () => {
    setLoading(true);
    setError('');
    const from = view === 'week' ? weekStart : anchor;
    const to = view === 'week' ? addDays(weekStart, 4) : anchor;
    api
      .get('/appointments', {
        params: {
          from: format(from, 'yyyy-MM-dd'),
          to: format(to, 'yyyy-MM-dd'),
          doctorId: doctorFilter || undefined,
        },
      })
      .then((r) => setAppts(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [anchor, view, doctorFilter]);

  const changeStatus = async (a: Appointment, status: string) => {
    await api.put(`/appointments/${a.id}/status`, { status });
    toast(`Marked ${status.replace('_', ' ').toLowerCase()}`, 'success');
    load();
  };

  const doCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) { toast('Enter a reason', 'error'); return; }
    await api.put(`/appointments/${cancelTarget.id}/cancel`, { reason: cancelReason });
    toast('Appointment cancelled', 'success');
    setCancelTarget(null);
    setCancelReason('');
    load();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
        {can('ADMIN', 'RECEPTIONIST', 'DOCTOR') && (
          <button className="btn-primary" onClick={() => setBooking(true)}><IconPlus className="h-4 w-4" /> Book appointment</button>
        )}
      </div>

      {/* Controls */}
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <button className="btn-secondary px-3 py-1.5" onClick={() => setAnchor(view === 'week' ? subWeeks(anchor, 1) : addDays(anchor, -1))}>←</button>
          <button className="btn-secondary px-3 py-1.5" onClick={() => setAnchor(new Date())}>Today</button>
          <button className="btn-secondary px-3 py-1.5" onClick={() => setAnchor(view === 'week' ? addWeeks(anchor, 1) : addDays(anchor, 1))}>→</button>
          <span className="ms-2 text-sm font-medium text-slate-600">
            {view === 'week' ? `${format(weekStart, 'dd MMM')} – ${format(addDays(weekStart, 4), 'dd MMM yyyy')}` : format(anchor, 'EEEE, dd MMM yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user?.role !== 'DOCTOR' && (
            <select className="input w-auto" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="">All doctors</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg border border-slate-300">
            <button className={`px-3 py-1.5 text-sm ${view === 'day' ? 'bg-brand-600 text-white' : 'text-slate-600'}`} onClick={() => setView('day')}>Day</button>
            <button className={`px-3 py-1.5 text-sm ${view === 'week' ? 'bg-brand-600 text-white' : 'text-slate-600'}`} onClick={() => setView('week')}>Week</button>
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className={`grid gap-3 ${view === 'week' ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1'}`}>
          {days.map((day) => {
            const dayAppts = appts.filter((a) => isSameDay(parseISO(a.date), day)).sort((x, y) => x.startTime.localeCompare(y.startTime));
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className="card p-3">
                <div className={`mb-2 rounded-md px-2 py-1 text-center text-sm font-semibold ${isToday ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`}>
                  {format(day, 'EEE dd MMM')}
                </div>
                {dayAppts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-300">No appointments</p>
                ) : (
                  <div className="space-y-2">
                    {dayAppts.map((a) => (
                      <div key={a.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">{a.startTime}</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="mt-1 font-medium text-slate-800">{a.patient?.fullName}</p>
                        <p className="text-xs text-slate-400">Dr. {a.doctor?.name} · {a.reason || a.visitType}</p>
                        {a.status !== 'CANCELLED' && a.status !== 'COMPLETED' && a.status !== 'NO_SHOW' && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {a.status === 'SCHEDULED' && <button className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100" onClick={() => changeStatus(a, 'CHECKED_IN')}>Check in</button>}
                            {(a.status === 'SCHEDULED' || a.status === 'CHECKED_IN') && <button className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200" onClick={() => changeStatus(a, 'NO_SHOW')}>No-show</button>}
                            <button className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 hover:bg-red-100" onClick={() => setCancelTarget(a)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BookingModal
        open={booking}
        onClose={() => { setBooking(false); if (params.get('patientId')) setParams({}, { replace: true }); }}
        onBooked={() => { setBooking(false); load(); }}
        presetPatientId={params.get('patientId') || undefined}
        presetDate={view === 'day' ? format(anchor, 'yyyy-MM-dd') : undefined}
      />

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel appointment">
        <p className="mb-3 text-sm text-slate-600">Please provide a reason for cancelling {cancelTarget?.patient?.fullName}'s appointment.</p>
        <textarea className="input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason…" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setCancelTarget(null)}>Keep it</button>
          <button className="btn-danger" onClick={doCancel}>Cancel appointment</button>
        </div>
      </Modal>
    </div>
  );
}
