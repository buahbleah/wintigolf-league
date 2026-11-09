/**
 * Der Trendpfeil der Power Rankings.
 *
 * Nicht nur eine Richtung, sondern auch der Betrag — «steigt» sagt wenig, wenn
 * man nicht weiss, ob es um einen halben Punkt geht oder um zehn.
 */
export function Trend({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="trend trend--flat" title="noch keine Vorgeschichte">–</span>
  }
  if (value > 0.5) {
    return (
      <span className="trend trend--up" title={`${value.toFixed(1)} Punkte besser als davor`}>
        ▲ {value.toFixed(1)}
      </span>
    )
  }
  if (value < -0.5) {
    return (
      <span className="trend trend--down" title={`${Math.abs(value).toFixed(1)} Punkte schlechter als davor`}>
        ▼ {Math.abs(value).toFixed(1)}
      </span>
    )
  }
  return <span className="trend trend--flat" title="unverändert">■</span>
}
