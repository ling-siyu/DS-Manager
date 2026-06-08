// Regression case: a plain LOCAL interface in the same file. The current regex
// parser already handles this; Phase 2 must keep it working.
interface CardProps {
  title: string
  padded?: boolean
}

export default function Card({ title, padded }: CardProps) {
  return <div className={padded ? 'p-4' : ''}>{title}</div>
}
