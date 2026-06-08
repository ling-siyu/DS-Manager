import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'error';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children?: ReactNode;
}

const TEXT: Record<BadgeVariant, string> = {
  neutral: 'var(--ds-semantic-color-text-subtle)',
  brand: 'var(--ds-semantic-color-text-brand)',
  success: 'var(--ds-semantic-color-text-success)',
  warning: 'var(--ds-semantic-color-text-warning)',
  error: 'var(--ds-semantic-color-text-error)',
};

/** Demo Badge — compact status label driven by DSM tokens. */
export default function Badge({ variant = 'neutral', children, style, ...rest }: BadgeProps) {
  const css: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--ds-primitive-spacing-1)',
    padding: 'var(--ds-primitive-spacing-0-5) var(--ds-primitive-spacing-2)',
    fontSize: 'var(--ds-primitive-typography-fontSize-xs)',
    fontWeight: 'var(--ds-primitive-typography-fontWeight-medium)' as CSSProperties['fontWeight'],
    borderRadius: 'var(--ds-primitive-borderRadius-full)',
    color: TEXT[variant],
    background: 'var(--ds-semantic-color-background-subtle)',
    border: '1px solid var(--ds-semantic-color-border-subtle)',
    ...style,
  };

  return (
    <span style={css} {...rest}>
      {children}
    </span>
  );
}
