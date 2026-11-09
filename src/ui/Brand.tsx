/**
 * Die Marke.
 *
 * Ein Loch mit Fahne, von oben gesehen: der Kreis ist das Grün, der Punkt das
 * Loch, der Strich die Fahnenstange. Mehr braucht es nicht, und es bleibt auch
 * als 32-Pixel-Symbol lesbar.
 */

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="none" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="14" cy="20" r="3.2" fill="var(--green)" opacity="0.18" />
      <circle cx="14" cy="20" r="1.5" fill="var(--green)" />
      <path
        d="M14 20V7"
        fill="none"
        stroke="var(--ink-strong)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M14 7.6h8.5l-1.9 2.8 1.9 2.8H14Z" fill="var(--green)" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <div className="wordmark">
      <Mark size={22} />
      <span style={{ marginLeft: 8, color: 'var(--ink-strong)' }}>Wintigolf</span>
      <span>League</span>
    </div>
  )
}
