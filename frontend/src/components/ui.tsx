export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight text-primary">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  size = 'md',
  ...props
}) {
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };
  const styles = {
    primary:
      'bg-primary text-white hover:bg-primary-dark shadow-sm shadow-primary/10',
    accent: 'bg-accent text-white hover:bg-teal-800 shadow-sm shadow-accent/10',
    secondary:
      'bg-white text-primary border border-border hover:bg-slate-50 hover:border-slate-300',
    ghost: 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white',
    danger: 'bg-rose-700 text-white hover:bg-rose-800',
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldClass =
  'relative z-[1] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-slate-50 disabled:text-muted';

export function Input({ label, className = '', hint, id, ...props }) {
  const inputId = id || (label ? `f-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className="block text-sm">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <input id={inputId} className={`${fieldClass} ${className}`} {...props} />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function Select({ label, children, className = '', id, ...props }) {
  const selectId = id || (label ? `s-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className="block text-sm">
      {label ? (
        <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <select id={selectId} className={`${fieldClass} ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className = '', id, ...props }) {
  const areaId = id || (label ? `t-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className="block text-sm">
      {label ? (
        <label htmlFor={areaId} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <textarea id={areaId} className={`${fieldClass} ${className}`} {...props} />
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(15,39,68,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message, title }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white/70 px-6 py-14 text-center">
      {title ? <p className="mb-1 text-sm font-semibold text-primary">{title}</p> : null}
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function Alert({ type = 'error', children }) {
  const cls =
    type === 'warning'
      ? 'border-amber-300/80 bg-amber-50 text-amber-950'
      : type === 'success'
        ? 'border-emerald-300/80 bg-emerald-50 text-emerald-950'
        : type === 'info'
          ? 'border-sky-300/80 bg-sky-50 text-sky-950'
          : 'border-rose-300/80 bg-rose-50 text-rose-950';
  return (
    <div className={`rounded-md border px-3.5 py-2.5 text-sm leading-relaxed ${cls}`} role="alert">
      {children}
    </div>
  );
}
