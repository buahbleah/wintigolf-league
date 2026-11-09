/**
 * Tabelle, Streichresultate und Power Rankings.
 *
 * Eine Regel steht über allem: gewertet werden die besten Wochen, nicht alle.
 * Bei zehn Wochen und zwei Streichresultaten zählen am Ende die besten acht —
 * und solange weniger Wochen gespielt sind, zählen eben alle, die es gibt. Sonst
 * stünde in Woche 2 eine Tabelle, in der die halbe Liga bei null liegt.
 *
 * Reine Rechnung, keine Datenbank: was hier herauskommt, lässt sich Zeile für
 * Zeile nachrechnen, und genau das erwartet man von einer Tabelle, an der eine
 * Saison hängt.
 */

export interface PlayerResult {
  weekNumber: number
  points: number
  /** Unbestätigte Karten zählen vorläufig mit, werden aber ausgewiesen. */
  confirmed: boolean
}

export interface PlayerInput {
  userId: string
  name: string
  avatarUrl: string | null
  indoorHandicap: number | null
  joinedWeek: number
  status: 'active' | 'withdrawn'
  results: PlayerResult[]
}

export interface StandingRow {
  rank: number
  userId: string
  name: string
  avatarUrl: string | null
  indoorHandicap: number | null
  status: 'active' | 'withdrawn'
  /** Punkte je Woche, null wenn (noch) kein Ergebnis vorliegt. */
  byWeek: Record<number, number | null>
  /** Wochen, deren Punkte in die Wertung zählen. */
  countedWeeks: number[]
  /** Wochen, die als Streichresultat aus der Wertung fallen. */
  droppedWeeks: number[]
  total: number
  played: number
  best: number
  average: number
  weekWins: number
  unconfirmed: number
}

export interface StandingsOptions {
  /** Spielwochen der Saison insgesamt. */
  weeks: number
  /** Wie viele der schlechtesten Wochen gestrichen werden. */
  droppedWeeks: number
  /** Wochen, deren Deadline vorbei ist — dort zählt eine fehlende Karte als 0. */
  closedWeeks: number[]
}

/** Die Tabelle. */
export function standings(players: PlayerInput[], options: StandingsOptions): StandingRow[] {
  const closed = new Set(options.closedWeeks)

  const rows = players.map((player) => {
    const byWeek: Record<number, number | null> = {}
    const values: { weekNumber: number; points: number }[] = []

    for (let week = 1; week <= options.weeks; week++) {
      const result = player.results.find((r) => r.weekNumber === week)
      if (result) {
        byWeek[week] = result.points
        values.push({ weekNumber: week, points: result.points })
      } else if (closed.has(week) && week >= player.joinedWeek) {
        // Vorbei und nichts abgegeben: null Punkte, und die zählen als Ergebnis.
        byWeek[week] = 0
        values.push({ weekNumber: week, points: 0 })
      } else {
        byWeek[week] = null
      }
    }

    // So viele Wochen zählen, wie es Ergebnisse gibt — höchstens aber die
    // Wochenzahl abzüglich der Streichresultate.
    const counting = Math.min(values.length, Math.max(1, options.weeks - options.droppedWeeks))
    const ranked = [...values].sort((a, b) => b.points - a.points)
    const counted = ranked.slice(0, counting)
    const dropped = ranked.slice(counting)

    const total = counted.reduce((sum, v) => sum + v.points, 0)
    const played = player.results.length

    return {
      rank: 0,
      userId: player.userId,
      name: player.name,
      avatarUrl: player.avatarUrl,
      indoorHandicap: player.indoorHandicap,
      status: player.status,
      byWeek,
      countedWeeks: counted.map((v) => v.weekNumber).sort((a, b) => a - b),
      droppedWeeks: dropped.map((v) => v.weekNumber).sort((a, b) => a - b),
      total,
      played,
      best: player.results.length ? Math.max(...player.results.map((r) => r.points)) : 0,
      average: player.results.length
        ? Math.round((player.results.reduce((s, r) => s + r.points, 0) / player.results.length) * 10) / 10
        : 0,
      weekWins: 0,
      unconfirmed: player.results.filter((r) => !r.confirmed).length,
    } satisfies StandingRow
  })

  /* Wochensiege: wer in einer Woche die meisten Punkte hat. Gleichstand zählt
     für beide — ein geteilter Wochensieg ist ein Wochensieg. */
  for (let week = 1; week <= options.weeks; week++) {
    const scores = rows
      .map((row) => ({ row, points: row.byWeek[week] }))
      .filter((s): s is { row: StandingRow; points: number } => s.points !== null)
    if (!scores.length) continue
    const top = Math.max(...scores.map((s) => s.points))
    if (top === 0) continue
    for (const score of scores) if (score.points === top) score.row.weekWins++
  }

  /* Reihenfolge: Punkte, dann bessere Einzelrunde, dann Wochensiege, dann
     tieferes Indoor-Handicap. Ausgeschiedene stehen am Ende. */
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (b.total !== a.total) return b.total - a.total
    if (b.best !== a.best) return b.best - a.best
    if (b.weekWins !== a.weekWins) return b.weekWins - a.weekWins
    const ha = a.indoorHandicap ?? 99
    const hb = b.indoorHandicap ?? 99
    if (ha !== hb) return ha - hb
    return a.name.localeCompare(b.name, 'de-CH')
  })

  // Gleiche Punktzahl und gleiche Entscheidungskriterien heisst gleicher Rang.
  rows.forEach((row, i) => {
    const previous = rows[i - 1]
    row.rank =
      previous &&
      previous.total === row.total &&
      previous.best === row.best &&
      previous.weekWins === row.weekWins
        ? previous.rank
        : i + 1
  })

  return rows
}

export interface PowerRow {
  userId: string
  name: string
  avatarUrl: string | null
  /** Schnitt der letzten drei Runden. */
  form: number
  /** Schnitt der drei davor — die Grundlage für den Trend. */
  previousForm: number | null
  /** form minus previousForm. */
  trend: number | null
  average: number
  /** Standardabweichung der Punkte: je kleiner, desto verlässlicher. */
  spread: number
  /** Form und Saisonschnitt gewichtet — die Reihenfolge der Power Rankings. */
  score: number
  rank: number
}

/**
 * Power Rankings: wer gerade in Form ist, nicht wer die meisten Punkte
 * gesammelt hat.
 *
 * Drei Viertel Form, ein Viertel Saisonschnitt — reine Form wäre Rauschen, der
 * reine Schnitt wäre schon die Tabelle.
 */
export function powerRankings(players: PlayerInput[], formRounds = 3): PowerRow[] {
  const rows = players
    .filter((p) => p.status === 'active' && p.results.length > 0)
    .map((player) => {
      const points = [...player.results]
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((r) => r.points)

      const last = points.slice(-formRounds)
      const previous = points.slice(-formRounds * 2, -formRounds)
      const form = mean(last)
      const previousForm = previous.length ? mean(previous) : null
      const average = mean(points)

      return {
        userId: player.userId,
        name: player.name,
        avatarUrl: player.avatarUrl,
        form,
        previousForm,
        trend: previousForm === null ? null : round1(form - previousForm),
        average,
        spread: standardDeviation(points),
        score: round1(form * 0.75 + average * 0.25),
        rank: 0,
      } satisfies PowerRow
    })

  rows.sort((a, b) => b.score - a.score || b.average - a.average)
  rows.forEach((row, i) => {
    row.rank = i + 1
  })
  return rows
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - average) ** 2, 0) / (values.length - 1)
  return round1(Math.sqrt(variance))
}
