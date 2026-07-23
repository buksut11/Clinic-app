import { useEffect, useState, useRef } from 'react';
import { api, errMsg, openFile } from '../lib/api';
import { LabOrder } from '../lib/types';
import { Spinner, ErrorState, EmptyState, StatusBadge, useToast, Modal } from '../components/ui';
import { fmtDate } from '../lib/format';

const STATUSES = ['ORDERED', 'SAMPLE_COLLECTED', 'RESULT_READY'];

export default function Lab() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [resultTarget, setResultTarget] = useState<LabOrder | null>(null);
  const [resultText, setResultText] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get('/lab', { params: { status: filter || undefined } })
      .then((r) => setOrders(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [filter]);

  const setStatus = async (o: LabOrder, status: string) => {
    await api.put(`/lab/${o.id}/status`, { status });
    toast('Status updated', 'success');
    load();
  };

  const saveResult = async () => {
    if (!resultTarget || !resultText.trim()) { toast('Enter a result', 'error'); return; }
    await api.put(`/lab/${resultTarget.id}/result`, { resultText });
    toast('Result saved', 'success');
    setResultTarget(null);
    setResultText('');
    load();
  };

  const uploadResult = async (o: LabOrder, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/lab/${o.id}/result-file`, fd);
      toast('Result file uploaded', 'success');
      load();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Lab Orders</h1>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : orders.length === 0 ? (
          <EmptyState title="No lab orders" hint="Doctors can order tests from a consultation." />
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Test</th><th className="th">Patient</th><th className="th">Ordered by</th>
                <th className="th">Date</th><th className="th">Status</th><th className="th">Result</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{o.testName}</td>
                  <td className="td">{o.patient?.fullName} <span className="font-mono text-xs text-slate-400">{o.patient?.patientNo}</span></td>
                  <td className="td text-slate-500">Dr. {o.doctor?.name}</td>
                  <td className="td text-slate-400">{fmtDate(o.createdAt)}</td>
                  <td className="td"><StatusBadge status={o.status} kind="lab" /></td>
                  <td className="td">
                    {o.resultText || (o.resultFilePath ? <button className="text-brand-600 hover:underline" onClick={() => openFile(`/documents/file/${o.resultFilePath}`)}>View file</button> : <span className="text-slate-300">—</span>)}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {o.status === 'ORDERED' && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setStatus(o, 'SAMPLE_COLLECTED')}>Collect sample</button>}
                      {o.status !== 'RESULT_READY' && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => { setResultTarget(o); setResultText(o.resultText || ''); }}>Enter result</button>}
                      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" />
                      <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
                        Upload
                        <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadResult(o, e.target.files[0])} />
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!resultTarget} onClose={() => setResultTarget(null)} title={`Result — ${resultTarget?.testName}`}>
        <label className="label">Result (text / values)</label>
        <textarea className="input" rows={4} value={resultText} onChange={(e) => setResultText(e.target.value)} placeholder="e.g. Hemoglobin 13.5 g/dL — within normal range" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setResultTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveResult}>Save result</button>
        </div>
      </Modal>
    </div>
  );
}
