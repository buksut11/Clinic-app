// Lightweight dependency-free horizontal bar chart (inline SVG). Good enough for
// clinic dashboards without pulling in a charting library.
export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export default function BarChart({
  data,
  format = (n) => String(n),
  height = 28,
}: {
  data: BarDatum[];
  format?: (n: number) => string;
  height?: number;
}) {
  if (!data.length) return <p className="py-6 text-center text-sm text-slate-300">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 flex-shrink-0 truncate text-xs text-slate-500" title={d.label}>{d.label}</div>
          <div className="relative flex-1">
            <div className="h-6 rounded bg-slate-100" style={{ height }}>
              <div
                className="flex h-full items-center justify-end rounded px-2 text-xs font-medium text-white transition-all"
                style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 6 : 0)}%`, minWidth: d.value > 0 ? 28 : 0, background: d.color || '#0d9488' }}
              >
                {d.value > 0 && <span className="whitespace-nowrap">{format(d.value)}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
