import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, errMsg, openFile } from '../lib/api';
import { Patient } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, EmptyState, Modal, StatusBadge, useToast, useConfirm } from '../components/ui';
import { age, fmtDate, money, paidOf } from '../lib/format';
import PatientForm from '../components/PatientForm';

type Tab = 'overview' | 'visits' | 'prescriptions' | 'lab' | 'invoices' | 'documents';

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get(`/patients/${id}`)
      .then((r) => setPatient(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const archive = async () => {
    if (!patient) return;
    const ok = await confirm({
      title: 'Archive patient?',
      message: `${patient.fullName} will be hidden from the active list. Medical data is never deleted and can be restored later.`,
      confirmText: 'Archive',
      danger: true,
    });
    if (!ok) return;
    await api.post(`/patients/${patient.id}/archive`);
    toast('Patient archived', 'success');
    load();
  };
  const restore = async () => {
    if (!patient) return;
    await api.post(`/patients/${patient.id}/restore`);
    toast('Patient restored', 'success');
    load();
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/documents/patient/${id}`, fd);
      toast('Document uploaded', 'success');
      load();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: string, name: string) => {
    const ok = await confirm({ title: 'Delete document?', message: `Delete "${name}"? This cannot be undone.`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    await api.delete(`/documents/${docId}`);
    toast('Document deleted', 'success');
    load();
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!patient) return null;

  const hasAllergy = patient.allergies && patient.allergies.toLowerCase() !== 'none';
  const hasChronic = patient.chronicConditions && patient.chronicConditions.toLowerCase() !== 'none';

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'visits', label: 'Visits', count: patient.appointments?.length },
    { key: 'prescriptions', label: 'Prescriptions', count: patient.prescriptions?.length },
    { key: 'lab', label: 'Lab', count: patient.labOrders?.length },
    { key: 'invoices', label: 'Invoices', count: patient.invoices?.length },
    { key: 'documents', label: 'Documents', count: patient.documents?.length },
  ];

  return (
    <div>
      <Link to="/patients" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700">← Back to patients</Link>

      {/* Header */}
      <div className="card mb-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
              {patient.fullName.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{patient.fullName}</h1>
              <p className="text-sm text-slate-500">
                <span className="font-mono">{patient.patientNo}</span> · {age(patient.dob)} · {patient.gender || '-'} · {patient.bloodType || 'Blood type n/a'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {can('ADMIN', 'RECEPTIONIST', 'DOCTOR') && (
              <button className="btn-primary" onClick={() => navigate(`/appointments?patientId=${patient.id}`)}>Book appointment</button>
            )}
            {can('ADMIN', 'RECEPTIONIST', 'NURSE') && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
            )}
            {can('ADMIN', 'RECEPTIONIST') &&
              (patient.isArchived ? (
                <button className="btn-secondary" onClick={restore}>Restore</button>
              ) : (
                <button className="btn-secondary text-red-600" onClick={archive}>Archive</button>
              ))}
          </div>
        </div>

        {/* Red-highlighted allergies / chronic conditions */}
        {(hasAllergy || hasChronic) && (
          <div className="mt-4 flex flex-wrap gap-3">
            {hasAllergy && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <span className="font-semibold text-red-700">⚠ Allergies:</span> <span className="text-red-700">{patient.allergies}</span>
              </div>
            )}
            {hasChronic && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <span className="font-semibold text-red-700">⚠ Chronic:</span> <span className="text-red-700">{patient.chronicConditions}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="segmented mb-5 flex-wrap">
        {tabs.map((tt) => (
          <button key={tt.key} onClick={() => setTab(tt.key)} className={tab === tt.key ? 'is-active' : ''}>
            {tt.label}
            {tt.count != null && <span className="ms-1.5 rounded-full bg-slate-500/15 px-1.5 text-xs">{tt.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="mb-3 font-semibold text-slate-800">Personal information</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Phone" value={patient.phone} />
              <Row label="Email" value={patient.email} />
              <Row label="Address" value={patient.address} />
              <Row label="National ID" value={patient.nationalId} />
              <Row label="Insurance no." value={patient.insuranceNo} />
              <Row label="Emergency contact" value={patient.emergencyContact} />
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="mb-3 font-semibold text-slate-800">Medical</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Allergies" value={patient.allergies} />
              <Row label="Chronic conditions" value={patient.chronicConditions} />
              <Row label="Blood type" value={patient.bloodType} />
              <Row label="Date of birth" value={fmtDate(patient.dob)} />
            </dl>
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="space-y-3">
          {!patient.appointments?.length ? (
            <EmptyState title="No visits yet" hint="Book an appointment to start the visit history." />
          ) : (
            patient.appointments.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">
                      {fmtDate(a.date)} · {a.startTime} · Dr. {a.doctor?.name}
                    </p>
                    <p className="text-sm text-slate-500">{a.reason || 'No reason given'} · {a.visitType}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {can('ADMIN', 'DOCTOR', 'NURSE') && (
                      <Link to={`/consultation/${a.id}`} className="btn-secondary px-3 py-1 text-xs">Open</Link>
                    )}
                  </div>
                </div>
                {a.consultation && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                    {a.consultation.diagnosis && <p><span className="font-semibold text-slate-600">Diagnosis:</span> {a.consultation.diagnosis}</p>}
                    {a.consultation.treatmentPlan && <p className="mt-1 text-slate-600">{a.consultation.treatmentPlan}</p>}
                  </div>
                )}
                {a.vitals && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {a.vitals.weight != null && <span>Weight: {a.vitals.weight}kg</span>}
                    {a.vitals.height != null && <span>Height: {a.vitals.height}cm</span>}
                    {a.vitals.bpSystolic != null && <span>BP: {a.vitals.bpSystolic}/{a.vitals.bpDiastolic}</span>}
                    {a.vitals.temperature != null && <span>Temp: {a.vitals.temperature}°C</span>}
                    {a.vitals.pulse != null && <span>Pulse: {a.vitals.pulse}</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="space-y-3">
          {!patient.prescriptions?.length ? (
            <EmptyState title="No prescriptions yet" />
          ) : (
            patient.prescriptions.map((rx) => (
              <div key={rx.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{fmtDate(rx.createdAt)} · Dr. {rx.doctor?.name}</p>
                  <button className="btn-secondary px-3 py-1 text-xs" onClick={() => openFile(`/prescriptions/${rx.id}/pdf`)}>Print PDF</button>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {rx.items.map((it, i) => (
                    <li key={i}>• <span className="font-medium">{it.name}</span> {it.dosage} {it.frequency} {it.duration}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'lab' && (
        <div className="card overflow-hidden">
          {!patient.labOrders?.length ? (
            <EmptyState title="No lab orders" />
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr><th className="th">Test</th><th className="th">Status</th><th className="th">Result</th><th className="th">Ordered</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {patient.labOrders.map((l) => (
                  <tr key={l.id}>
                    <td className="td">{l.testName}</td>
                    <td className="td"><StatusBadge status={l.status} kind="lab" /></td>
                    <td className="td">
                      {l.resultText || (l.resultFilePath ? <button className="text-brand-600 hover:underline" onClick={() => openFile(`/documents/file/${l.resultFilePath}`)}>View file</button> : '-')}
                    </td>
                    <td className="td text-slate-400">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card overflow-hidden">
          {!patient.invoices?.length ? (
            <EmptyState title="No invoices" />
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr><th className="th">Invoice</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Balance</th><th className="th">Status</th><th className="th"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {patient.invoices.map((inv) => {
                  const paid = paidOf(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{inv.invoiceNo}</td>
                      <td className="td">{money(inv.total)}</td>
                      <td className="td">{money(paid)}</td>
                      <td className="td">{money(Math.max(0, inv.total - paid))}</td>
                      <td className="td"><StatusBadge status={inv.status} kind="invoice" /></td>
                      <td className="td">
                        {can('ADMIN', 'RECEPTIONIST') && <Link to={`/billing/${inv.id}`} className="text-brand-600 hover:underline">Open</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">Lab results, scans (PDF or images).</p>
            <div>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button className="btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload document'}</button>
            </div>
          </div>
          {!patient.documents?.length ? (
            <EmptyState title="No documents" hint="Upload lab results or scans here." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {patient.documents.map((d) => (
                <div key={d.id} className="card p-4">
                  <div className="mb-2 text-2xl">{d.mimeType.includes('pdf') ? '📄' : '🖼️'}</div>
                  <p className="truncate text-sm font-medium text-slate-800" title={d.filename}>{d.filename}</p>
                  <p className="text-xs text-slate-400">{(d.size / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}</p>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-secondary px-3 py-1 text-xs" onClick={() => openFile(`/documents/file/${d.storedName}`)}>View</button>
                    <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => deleteDoc(d.id, d.filename)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit patient" wide>
        <PatientForm patient={patient} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-end font-medium text-slate-700">{value || '-'}</dd>
    </div>
  );
}
