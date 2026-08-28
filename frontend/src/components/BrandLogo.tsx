import { APP_NAME, INSTITUTION_NAME, LOGO_ALT, LOGO_SRC } from '../brand';

const sizes = {
  sm: 36,
  md: 48,
  lg: 88,
};

export function BrandLogo({ size = 'md', className = '' }) {
  const px = sizes[size] ?? sizes.md;

  return (
    <img
      src={LOGO_SRC}
      alt={LOGO_ALT}
      width={px}
      height={px}
      decoding="async"
      className={`brand-logo brand-logo--${size} ${className}`.trim()}
    />
  );
}

export function BrandMark({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? 'justify-center' : 'gap-3'}`}>
      <BrandLogo size={compact ? 'sm' : 'md'} />
      {compact ? null : (
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-300/90">
            {INSTITUTION_NAME}
          </p>
          <p className="mt-0.5 truncate font-display text-base font-semibold leading-snug text-white">
            {APP_NAME}
          </p>
        </div>
      )}
    </div>
  );
}
