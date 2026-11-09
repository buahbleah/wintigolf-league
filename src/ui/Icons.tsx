/**
 * Das Zeichensystem.
 *
 * Alle Symbole sitzen auf demselben 24er-Raster, mit derselben Strichstärke und
 * ohne Füllung — sie nehmen die Farbe aus `currentColor`, damit die Navigation
 * ihren Zustand selber färben kann.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g {...stroke}>{children}</g>
    </svg>
  )
}

/** Fahne im Grün — die Liga, das Zuhause. */
export const IconFlag = () => (
  <Svg>
    <path d="M7 21V3" />
    <path d="M7 4h10.5l-2.2 3.6L17.5 11H7" />
    <path d="M4.5 21h5" />
  </Svg>
)

/** Scorecard — die Woche, die Karten. */
export const IconCard = () => (
  <Svg>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </Svg>
)

/** Kalender — die Termine. */
export const IconCalendar = () => (
  <Svg>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </Svg>
)

/** Sprechblasen — das Clubhaus. */
export const IconChat = () => (
  <Svg>
    <path d="M20 13.5a3 3 0 0 1-3 3H9l-4 3.5v-3.5H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
  </Svg>
)

/** Person — das Profil. */
export const IconUser = () => (
  <Svg>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Svg>
)

export const IconBell = () => (
  <Svg>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
)

export const IconCheck = () => (
  <Svg>
    <path d="M5 12.5 10 17.5 19 7" />
  </Svg>
)

export const IconBack = () => (
  <Svg>
    <path d="M14.5 5 8 12l6.5 7" />
  </Svg>
)

export const IconCog = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Svg>
)
