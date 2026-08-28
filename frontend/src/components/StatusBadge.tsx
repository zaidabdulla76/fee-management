export function StatusBadge({ status }) {
  const map = {
    Paid: 'bg-emerald-50 text-emerald-800 ring-emerald-700/15',
    Pending: 'bg-amber-50 text-amber-900 ring-amber-700/15',
    Overdue: 'bg-rose-50 text-rose-800 ring-rose-700/15',
    Active: 'bg-accent-soft text-accent ring-accent/20',
    Inactive: 'bg-slate-100 text-slate-600 ring-slate-500/15',
    Frozen: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  };
  const cls = map[status] || 'bg-slate-100 text-slate-700 ring-slate-500/15';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}
