export function TrashCanIcon({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/70">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0v12a1 1 0 001 1h6a1 1 0 001-1V7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
    </svg>
  )
}