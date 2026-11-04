export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-ink',
    secondary: 'bg-surface text-ink border border-line hover:border-ink/30',
    ghost: 'text-muted hover:text-ink hover:bg-ink/5',
    danger: 'text-rose-600 border border-rose-200 bg-surface hover:bg-rose-50',
  };
  const sizes = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-12 px-5 text-base' };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', padded = true, ...props }) {
  return <div className={`rounded-2xl border border-line bg-surface ${padded ? 'p-5' : ''} ${className}`} {...props} />;
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-ink/5 text-muted',
    accent: 'bg-accent-soft text-accent-ink',
    good: 'bg-emerald-50 text-emerald-700',
    bad: 'bg-rose-50 text-rose-600',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, id, className = '', ...props }) {
  return (
    <label htmlFor={id} className="block">
      {label && <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>}
      <input
        id={id}
        className={`w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-base outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <button type="button" onClick={onClose} className="animate-pop rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
        {message}
      </button>
    </div>
  );
}
