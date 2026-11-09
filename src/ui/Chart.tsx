/**
 * Zwei kleine Diagramme, von Hand gezeichnet.
 *
 * Keine Bibliothek: für zwei Darstellungen wären dreihundert Kilobyte Bundle
 * absurd, und eine Grafik, die aus denselben Token kommt wie der Rest, passt
 * besser zusammen als eine, die ihre eigenen Farben mitbringt.
 *
 * Beide zeichnen in einen festen viewBox-Raum und skalieren über die Breite —
 * auf dem Handy wie auf dem Bildschirm daneben.
 */

export interface Line {
  id: string
  name: string
  /** Ein Wert pro Woche, null wo nichts gespielt wurde. */
  points: (number | null)[]
  /** Hervorgehoben: die eigene Linie und die Spitze. */
  emphasis: 'me' | 'top' | 'rest'
}

/**
 * Der Verlauf der Tabelle: kumulierte Punkte über die Wochen.
 *
 * Hervorgehoben wird die eigene Linie, gedämpft der Rest — bei zwölf Spielern
 * ist eine Grafik, in der alle gleich laut sind, nicht lesbar.
 */
export function LineChart({ lines, weeks }: { lines: Line[]; weeks: number }) {
  const width = 320
  const height = 160
  const padding = { top: 8, right: 8, bottom: 18, left: 26 }

  const max = Math.max(
    1,
    ...lines.flatMap((line) => line.points.map((p) => p ?? 0)),
  )
  const stepX = (width - padding.left - padding.right) / Math.max(1, weeks - 1)
  const scaleY = (value: number) =>
    height - padding.bottom - (value / max) * (height - padding.top - padding.bottom)

  function path(points: (number | null)[]): string {
    let d = ''
    points.forEach((value, index) => {
      if (value === null) return
      const x = padding.left + index * stepX
      const y = scaleY(value)
      d += d === '' ? `M ${x} ${y}` : ` L ${x} ${y}`
    })
    return d
  }

  const ticks = [0, Math.round(max / 2), max]

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Verlauf der Tabelle">
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="var(--border-soft)"
            strokeWidth="1"
          />
          <text x="2" y={scaleY(tick) + 3} fill="var(--ink-faint)" fontSize="8">
            {tick}
          </text>
        </g>
      ))}

      {[...Array(weeks)].map((_, index) => (
        <text
          key={index}
          x={padding.left + index * stepX}
          y={height - 5}
          fill="var(--ink-faint)"
          fontSize="8"
          textAnchor="middle"
        >
          {index + 1}
        </text>
      ))}

      {/* Erst die gedämpften Linien, damit die eigene obenauf liegt. */}
      {['rest', 'top', 'me'].map((group) =>
        lines
          .filter((line) => line.emphasis === group)
          .map((line) => (
            <path
              key={line.id}
              d={path(line.points)}
              fill="none"
              stroke={
                line.emphasis === 'me'
                  ? 'var(--green)'
                  : line.emphasis === 'top'
                    ? 'var(--gold)'
                    : 'var(--border)'
              }
              strokeWidth={line.emphasis === 'rest' ? 1.2 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )),
      )}
    </svg>
  )
}

export interface Bar {
  label: string
  /** Wert, um den gezeichnet wird. Negativ zeichnet nach unten. */
  value: number
  highlight?: boolean
}

/**
 * Loch für Loch: wie weit die Liga auf jedem Loch über Par lag.
 *
 * Nullinie in der Mitte, damit ein Loch, auf dem jemand unter Par spielte, auch
 * als das zu sehen ist.
 */
export function BarChart({ bars, unit = '' }: { bars: Bar[]; unit?: string }) {
  const width = 320
  const height = 130
  const padding = { top: 12, bottom: 20 }
  const max = Math.max(0.5, ...bars.map((bar) => Math.abs(bar.value)))
  const zero = padding.top + (height - padding.top - padding.bottom) / 2
  const slot = width / bars.length
  const barWidth = Math.min(16, slot * 0.66)
  const scale = (height - padding.top - padding.bottom) / 2 / max

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Loch für Loch">
      <line
        x1="0"
        x2={width}
        y1={zero}
        y2={zero}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {bars.map((bar, index) => {
        const h = Math.abs(bar.value) * scale
        const x = index * slot + (slot - barWidth) / 2
        const y = bar.value >= 0 ? zero - h : zero
        return (
          <g key={bar.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, h)}
              rx="2"
              fill={bar.highlight ? 'var(--red)' : 'var(--green-dim)'}
            />
            <text
              x={index * slot + slot / 2}
              y={height - 6}
              fill={bar.highlight ? 'var(--red)' : 'var(--ink-faint)'}
              fontSize="8"
              textAnchor="middle"
            >
              {bar.label}
            </text>
            {bar.highlight && (
              <text
                x={index * slot + slot / 2}
                y={y - 3}
                fill="var(--red)"
                fontSize="8"
                textAnchor="middle"
              >
                {bar.value > 0 ? '+' : ''}
                {bar.value.toFixed(1)}
                {unit}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
