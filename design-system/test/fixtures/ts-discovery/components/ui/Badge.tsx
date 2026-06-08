// Imported interface prop type + (typeof BADGE_VARIANTS)[number] variant enum.
import type { BadgeProps } from '../../types/ui'

export default function Badge({ label, variant }: BadgeProps) {
  return <span className={variant}>{label}</span>
}
