export function StatCard({ label, value, hint, tone = 'default' }) {
  const accent =
    tone === 'accent'
      ? 'border-l-accent'
      : tone === 'warn'
        ? 'border-l-amber-500'
        : tone === 'danger'
          ? 'border-l-rose-600'
          : 'border-l-primary';

  return (
    <div
      className={`rounded-lg border border-border border-l-4 ${accent} bg-surface p-5 shadow-[0_1px_2px_rgba(15,39,68,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-md animate-fee-in`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2.5 font-display text-2xl font-semibold tracking-tight text-primary tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}
