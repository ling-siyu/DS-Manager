import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'flat' | 'elevated';
export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  children?: ReactNode;
}

const PADDING: Record<CardPadding, string> = {
  sm: 'var(--ds-component-card-padding-sm)',
  md: 'var(--ds-component-card-padding-md)',
  lg: 'var(--ds-component-card-padding-lg)',
};

/** Demo Card — surface container driven by DSM tokens. */
export default function Card({
  variant = 'default',
  padding = 'md',
  children,
  style,
  ...rest
}: CardProps) {
  const css: CSSProperties = {
    background: 'var(--ds-component-card-bg)',
    color: 'var(--ds-semantic-color-text-default)',
    padding: PADDING[padding],
    borderRadius: 'var(--ds-component-card-radius)',
    border: variant === 'flat' ? '1px solid transparent' : '1px solid var(--ds-component-card-border)',
    boxShadow: variant === 'elevated' ? 'var(--ds-component-card-shadow)' : 'none',
    ...style,
  };

  return (
    <div style={css} {...rest}>
      {children}
    </div>
  );
}
