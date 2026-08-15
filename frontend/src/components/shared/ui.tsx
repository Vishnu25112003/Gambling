import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const VARIANTS: Record<string, string> = {
  primary: 'bg-neon-500 text-ink-950 hover:bg-neon-400',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600',
  ghost: 'bg-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-800',
  danger: 'bg-danger-500 text-white hover:bg-danger-400',
};

const SIZES: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition
        disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2
        focus-visible:outline-offset-2 focus-visible:outline-neon-400
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-700/70 bg-ink-850/70 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink-100">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-ink-600
        border-t-neon-400 ${className}`}
    />
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
}) {
  const tones = {
    neutral: 'bg-ink-700 text-ink-300',
    success: 'bg-neon-500/15 text-neon-400',
    warn: 'bg-gold-500/15 text-gold-400',
    danger: 'bg-danger-500/15 text-danger-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-4xl opacity-60">{icon}</div>
      <p className="font-semibold text-ink-100">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-400">{body}</p>
    </div>
  );
}
