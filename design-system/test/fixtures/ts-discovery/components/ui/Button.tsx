// Mirrors SecuraMark's Button: prop type is IMPORTED (not local), and is a
// discriminated union of intersections built on Omit<> + (typeof CONST)[number].
import type { ButtonProps } from '../../types/ui'

export default function Button({
  variant = 'outline',
  size = 'md',
  iconOnly = false,
  children,
}: ButtonProps) {
  return (
    <button className={`${variant} ${size}`} data-icon-only={iconOnly}>
      {children}
    </button>
  )
}
