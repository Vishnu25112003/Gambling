import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * The design's primitives. Sizes, radii and weights are taken from
 * GamblingHub.dc.html rather than from a generic scale, so a button here looks
 * the same as the button in the mock.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * `primary` is the landing CTA (gradient + glow), `solid` the flatter
   * in-dashboard green, `secondary` the bordered neutral, `ghost` a bare row.
   */
  variant?: 'primary' | 'solid' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[linear-gradient(135deg,var(--green-solid),var(--green-deep))] text-on-green font-bold ' +
    'shadow-[0_8px_24px_rgba(34,197,94,0.22)] hover:brightness-110',
  solid: 'bg-green-solid text-on-green font-bold hover:brightness-110',
  secondary: 'bg-line2 text-text border border-line font-semibold hover:bg-line',
  ghost: 'bg-transparent text-muted font-semibold hover:text-text hover:bg-line2',
  danger: 'bg-transparent text-red border border-line font-semibold hover:bg-red/10',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3.5 py-2 text-[12.5px] rounded-[9px]',
  md: 'px-5 py-3 text-sm rounded-[10px]',
  lg: 'px-[34px] py-4 text-base rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 border-none
        whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

/**
 * The radius is a prop rather than a class because the design uses five
 * different corner sizes on the same card treatment, and a caller-supplied
 * `rounded-*` class would race the default one in the generated stylesheet.
 */
export function Card({
  children,
  className = '',
  radius = 18,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
}) {
  return (
    <div className={`border border-line bg-card ${className}`} style={{ borderRadius: radius }}>
      {children}
    </div>
  );
}

/** The `22px/800` page heading with its muted one-liner, used on every tab. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <h1 className="mb-1 text-[22px] font-extrabold">{title}</h1>
      {subtitle && <p className="mb-[22px] text-[13.5px] text-muted">{subtitle}</p>}
    </>
  );
}

/** A card header: icon + title on the left, an optional "View all →" on the right. */
export function SectionHeading({
  icon,
  title,
  subtitle,
  action,
  iconColor = 'var(--green)',
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="mb-[18px] flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-[9px]">
          {icon && (
            <span className="flex" style={{ color: iconColor }}>
              {icon}
            </span>
          )}
          <span className="text-lg font-bold">{title}</span>
        </div>
        {subtitle && <p className="mt-[5px] text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-[9px] border border-line bg-bg2 px-3.5 py-[11px] text-sm text-text
        placeholder:text-faint focus:border-green focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line
        border-t-green ${className}`}
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
    neutral: 'bg-line2 text-muted',
    success: 'bg-green-solid/15 text-green',
    warn: 'bg-gold/15 text-gold',
    danger: 'bg-red/15 text-red',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11.5px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The design's empty state: a bordered card with a scaled-up outline glyph,
 * a bold line and a muted explanation.
 */
export function EmptyState({
  icon,
  title,
  body,
  scaleIcon = false,
  radius = 18,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  /** The generic tab placeholders draw their icon at 1.7×. */
  scaleIcon?: boolean;
  radius?: number;
}) {
  return (
    <Card radius={radius} className="px-6 py-14 text-center">
      <div className="mb-3.5 flex justify-center text-faint">
        {/*
          Scale the icon itself, not the full-width flex wrapper. A 1.7× transform
          on the wrapper stretched its box past both viewport edges on phones
          (≈65px of horizontal overflow that pushed the whole page wide), because
          the transform blows up the centered container while keeping it laid out
          at 100% width. Scoping the scale to the inline icon keeps the wrapper at
          its natural width and the visual size identical.
        */}
        <span
          className="inline-flex"
          style={scaleIcon ? { transform: 'scale(1.7)' } : undefined}
        >
          {icon}
        </span>
      </div>
      <p className="mb-1.5 text-[15.5px] font-bold">{title}</p>
      <p className="text-[12.5px] text-muted">{body}</p>
    </Card>
  );
}
