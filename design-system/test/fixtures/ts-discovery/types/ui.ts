// Hermetic fixture replicating SecuraMark's typing style (src/types/ui.ts).
// The DOM base (ButtonHTMLAttributes) is imported from a simulated external
// package under node_modules, so its members are classified INHERITED — like
// @types/react in a real repo. Everything declared in THIS file is "own".
// Still exercises Omit<>, intersections (&), unions (|), (typeof CONST)[number].
import type { ButtonHTMLAttributes } from 'dom-lite'

export type ReactNode = string | number | boolean | null | undefined | object

type IconType = (props: { size?: number }) => ReactNode

export const BUTTON_VARIANTS = ['outline', 'ghost', 'danger', 'success', 'primary', 'wechat'] as const
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const
export const ICON_POSITIONS = ['left', 'right'] as const
export const BADGE_VARIANTS = ['encrypted', 'pending', 'done', 'error', 'warning'] as const

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
export type ButtonSize = (typeof BUTTON_SIZES)[number]
export type IconPosition = (typeof ICON_POSITIONS)[number]
export type BadgeVariant = (typeof BADGE_VARIANTS)[number]

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  iconPosition?: IconPosition
  className?: string
}

type IconOnlyButtonProps = ButtonBaseProps & {
  iconOnly: true
  icon?: IconType
  children?: ReactNode
}

type TextButtonProps = ButtonBaseProps & {
  icon?: IconType
  iconOnly?: false
  children?: ReactNode
}

export type ButtonProps = IconOnlyButtonProps | TextButtonProps

export interface BadgeProps {
  label: string
  variant?: BadgeVariant
  className?: string
}

// Stand-in DOM type referenced by ButtonHTMLAttributes<HTMLButtonElement>.
type HTMLButtonElement = { tagName: 'BUTTON' }
