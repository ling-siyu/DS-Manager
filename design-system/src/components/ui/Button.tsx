import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children?: ReactNode;
}

const BG: Record<ButtonVariant, string> = {
  primary: 'var(--ds-semantic-color-interactive-primary-bg)',
  secondary: 'var(--ds-semantic-color-interactive-secondary-bg)',
  ghost: 'var(--ds-semantic-color-interactive-ghost-bg)',
  destructive: 'var(--ds-semantic-color-interactive-destructive-bg)',
};
const FG: Record<ButtonVariant, string> = {
  primary: 'var(--ds-semantic-color-interactive-primary-text)',
  secondary: 'var(--ds-semantic-color-interactive-secondary-text)',
  ghost: 'var(--ds-semantic-color-interactive-ghost-text)',
  destructive: 'var(--ds-semantic-color-interactive-destructive-text)',
};
const HEIGHT: Record<ButtonSize, string> = {
  sm: 'var(--ds-component-button-height-sm)',
  md: 'var(--ds-component-button-height-md)',
  lg: 'var(--ds-component-button-height-lg)',
};
const PAD_X: Record<ButtonSize, string> = {
  sm: 'var(--ds-component-button-paddingX-sm)',
  md: 'var(--ds-component-button-paddingX-md)',
  lg: 'var(--ds-component-button-paddingX-lg)',
};
const FONT_SIZE: Record<ButtonSize, string> = {
  sm: 'var(--ds-component-button-fontSize-sm)',
  md: 'var(--ds-component-button-fontSize-md)',
  lg: 'var(--ds-component-button-fontSize-lg)',
};

/** Demo Button — styled exclusively from DSM design tokens (no raw values). */
export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  children,
  style,
  ...rest
}: ButtonProps) {
  const css: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--ds-component-button-gap)',
    height: HEIGHT[size],
    padding: `0 ${PAD_X[size]}`,
    fontSize: FONT_SIZE[size],
    fontWeight: 'var(--ds-component-button-fontWeight)' as CSSProperties['fontWeight'],
    borderRadius: 'var(--ds-component-button-radius)',
    background: BG[variant],
    color: FG[variant],
    border:
      variant === 'secondary'
        ? '1px solid var(--ds-semantic-color-interactive-secondary-border)'
        : '1px solid transparent',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style,
  };

  return (
    <button disabled={disabled} style={css} {...rest}>
      {children}
    </button>
  );
}
