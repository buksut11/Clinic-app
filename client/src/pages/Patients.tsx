import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { Patient } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, EmptyState, Modal, useToast } from '../components/ui';
import { IconPlus, IconSearch } from '../components/icons';
import { age, fmtDate } from '../lib/format';
import PatientForm from '../components/PatientForm';

export default function Patients() {
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const pageSize = 15;

  const load = (query: string, archived: boolean, p: number) => {
    setLoading(true);
    setError('');
    api
      .get('/patients', { params: { q: query, includeArchived: archived, page: p, pageSize } })
      .then((r) => {
        setPatients(r.data.items);
        setTotal(r.data.total);
        setPages(r.data.pages || 1);
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };

  // Reset to page 1 whenever the query/filter changes
  useEffect(() => { setPage(1); }, [q, includeArchived]);

  // As-you-type search (debounced) + pagination
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      load(q, includeArchived, page);
      setParams(q ? { q } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, includeArchived, page]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Patients</h1>
          <p className="text-sm text-slate-500">{total} patient{total === 1 ? '' : 's'}</p>
        </div>
        {can('ADMIN', 'RECEPTIONIST') && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <IconPlus className="h-4 w-4" /> Register patient
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input ps-9"
            placeholder="Search by name, phone, or patient ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(q, includeArchived, page)} />
        ) : patients.length === 0 ? (
          <EmptyState
            title={q ? 'No patients match your search' : 'No patients yet'}
            hint={q ? 'Try a different name or number.' : 'Register your first patient to get started.'}
          />
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Patient ID</th>
                <th className="th">Name</th>
                <th className="th">Age</th>
                <th className="th">Gender</th>
                <th className="th">Phone</th>
                <th className="th">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {patients.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.isArchived ? 'opacity-50' : ''}`}>
                  <td className="td font-mono text-xs">{p.patientNo}</td>
                  <td className="td">
                    <Link to={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.fullName}
                    </Link>
                    {p.isArchived && <span className="ms-2 badge bg-slate-100 text-slate-400">Archived</span>}
                  </td>
                  <td className="td">{age(p.dob)}</td>
                  <td className="td">{p.gender || '-'}</td>
                  <td className="td">{p.phone || '-'}</td>
                  <td className="td text-slate-400">{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {page} of {pages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button>
            <button className="btn-secondary px-3 py-1.5" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next →</button>
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Register patient" wide>
        <PatientForm
          onSaved={(p) => {
            setShowForm(false);
            toast('Patient registered', 'success');
            setPage(1);
            load(q, includeArchived, 1);
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
