import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Spinner, ErrorState, useToast } from '../components/ui';
import { money } from '../lib/format';
import { format } from 'date-fns';
import BarChart from '../components/BarChart';

interface ReportData {
  totalRevenue: number;
  revenueByDoctor: { name: string; amount: number }[];
  revenueByService: { name: string; amount: number }[];
  revenueByMethod: { method: string; amount: number }[];
  appointmentVolume: { status: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number }[];
  outstanding: { invoiceNo: string; patient: string; patientNo: string; total: number; paid: number; balance: number }[];
}

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}
function downloadCSV(filename: string, rows: Record<string, any>[]) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get('/reports', { params: { from, to } })
      .then((r) => setData(r.data))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500">Analyse revenue, appointments and outstanding balances.</p>
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={load}>Apply</button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm text-slate-500">Total revenue in range</p>
              <p className="text-3xl font-bold text-green-600">{money(data.totalRevenue)}</p>
            </div>
            <div className="card p-5 lg:col-span-2">
              <h3 className="mb-3 font-semibold text-slate-800">Revenue by doctor</h3>
              <BarChart data={data.revenueByDoctor.map((r) => ({ label: r.name, value: Math.round(r.amount) }))} format={(n) => money(n)} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-800">Appointment volume</h3>
              <BarChart data={data.appointmentVolume.map((r) => ({ label: r.status.replace('_', ' '), value: r.count }))} />
            </div>
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-800">Revenue by service</h3>
              <BarChart data={data.revenueByService.slice(0, 8).map((r) => ({ label: r.name, value: Math.round(r.amount), color: '#3b82f6' }))} format={(n) => money(n)} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable
              title="Revenue by doctor"
              cols={['Doctor', 'Amount']}
              rows={data.revenueByDoctor.map((r) => [r.name, money(r.amount)])}
              onExport={() => downloadCSV('revenue-by-doctor.csv', data.revenueByDoctor)}
            />
            <ReportTable
              title="Revenue by service"
              cols={['Service', 'Amount']}
              rows={data.revenueByService.map((r) => [r.name, money(r.amount)])}
              onExport={() => downloadCSV('revenue-by-service.csv', data.revenueByService)}
            />
            <ReportTable
              title="Revenue by payment method"
              cols={['Method', 'Amount']}
              rows={data.revenueByMethod.map((r) => [r.method, money(r.amount)])}
              onExport={() => downloadCSV('revenue-by-method.csv', data.revenueByMethod)}
            />
            <ReportTable
              title="Appointment volume"
              cols={['Status', 'Count']}
              rows={data.appointmentVolume.map((r) => [r.status.replace('_', ' '), String(r.count)])}
              onExport={() => downloadCSV('appointment-volume.csv', data.appointmentVolume)}
            />
            <ReportTable
              title="Top diagnoses"
              cols={['Diagnosis', 'Count']}
              rows={data.topDiagnoses.map((r) => [r.diagnosis, String(r.count)])}
              onExport={() => downloadCSV('top-diagnoses.csv', data.topDiagnoses)}
            />
            <ReportTable
              title="Outstanding balances"
              cols={['Invoice', 'Patient', 'Balance']}
              rows={data.outstanding.map((r) => [r.invoiceNo, r.patient, money(r.balance)])}
              onExport={() => downloadCSV('outstanding-balances.csv', data.outstanding)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReportTable({ title, cols, rows, onExport }: { title: string; cols: string[]; rows: string[][]; onExport: () => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <button className="btn-secondary px-3 py-1 text-xs" onClick={onExport} disabled={!rows.length}>Export CSV</button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-300">No data</p>
      ) : (
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>{cols.map((c) => <th key={c} className="th">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => <td key={j} className="td">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
