export function Modal({ open, title, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fee-fade">
      <div className="absolute inset-0 bg-primary/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-2xl shadow-primary/20 animate-fee-in ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <h2 className="font-display text-lg font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted transition hover:bg-slate-100 hover:text-ink"
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
