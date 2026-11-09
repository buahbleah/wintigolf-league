/**
 * Netto-Stableford.
 *
 * Die Formeln sind nicht erfunden, sie folgen dem World Handicap System:
 *
 *   Course Handicap  = Handicap Index × (Slope / 113) + (Course Rating − Par)
 *   Playing Handicap = Course Handicap × Allowance
 *
 * Die Schläge werden nach Stroke-Index vergeben: bei 18 Schlägen bekommt jedes
 * Loch einen, bei 20 bekommen die beiden schwersten zwei. Punkte gibt es nach
 * dem Netto-Ergebnis gegen Par — wer genau auf sein Handicap spielt, kommt auf
 * 36, unabhängig vom Par des Kurses. Genau deshalb ist 36 die Bezugsgrösse für
 * die Handicap-Anpassung.
 *
 * Hier steht nur Rechnung, kein Zustand und keine Datenbank: eine Runde ist
 * Karte plus Lochliste, alles andere wird daraus abgeleitet. Darum lässt sich
 * jede Zahl in dieser Datei einzeln prüfen.
 */

export interface CourseCard {
  par: number
  courseRating: number
  slopeRating: number
  holes: { number: number; par: number; strokeIndex: number }[]
}

/** Course Handicap, auf ganze Schläge gerundet (WHS). */
export function courseHandicap(handicapIndex: number, course: CourseCard): number {
  const slope = course.slopeRating || 113
  const rating = course.courseRating || course.par
  return Math.round(handicapIndex * (slope / 113) + (rating - course.par))
}

/** Playing Handicap: Course Handicap nach Allowance. */
export function playingHandicap(
  handicapIndex: number,
  course: CourseCard,
  allowancePct = 100,
): number {
  return Math.round((courseHandicap(handicapIndex, course) * allowancePct) / 100)
}

/**
 * Schläge, die ein Spieler auf einem Loch bekommt.
 *
 * Plus-Handicaps geben Schläge zurück, und zwar auf den leichtesten Löchern —
 * darum der umgekehrte Rang.
 */
export function strokesOnHole(playing: number, strokeIndex: number, holeCount = 18): number {
  if (holeCount <= 0) return 0
  if (playing >= 0) {
    const base = Math.floor(playing / holeCount)
    const extra = playing % holeCount
    return base + (strokeIndex <= extra ? 1 : 0)
  }
  const amount = -playing
  const base = Math.floor(amount / holeCount)
  const extra = amount % holeCount
  const reverseRank = holeCount - strokeIndex + 1
  return -(base + (reverseRank <= extra ? 1 : 0)) || 0
}

/**
 * Stableford-Punkte für ein Loch.
 *
 * Kein Ergebnis — nicht eingetragen oder abgebrochen — gibt null Punkte. Das
 * ist dieselbe Null wie bei einem Doppelbogey, und genau so ist es abgemacht.
 */
export function stablefordPoints(
  grossStrokes: number | null,
  par: number,
  strokesReceived: number,
): number {
  if (grossStrokes === null || !Number.isFinite(grossStrokes)) return 0
  const net = grossStrokes - strokesReceived
  return Math.max(0, par - net + 2)
}

/**
 * Netto-Doppelbogey als Obergrenze — das korrigierte Brutto des WHS.
 *
 * Für die Handicap-Rechnung zählt nicht, wie schlimm ein Loch wirklich war: ein
 * Totalschaden auf Loch 7 soll ein Handicap nicht verzerren. Ein Loch ohne
 * Ergebnis zählt ebenfalls als Netto-Doppelbogey, weil es für die Punkte schon
 * als Null gewertet wurde.
 */
export function adjustedHoleScore(
  grossStrokes: number | null,
  par: number,
  strokesReceived: number,
): number {
  const cap = par + 2 + strokesReceived
  if (grossStrokes === null || !Number.isFinite(grossStrokes)) return cap
  return Math.min(grossStrokes, cap)
}

export interface HoleResult {
  number: number
  par: number
  strokeIndex: number
  strokes: number | null
  received: number
  net: number | null
  points: number
  /** Für die Karte: −2 Eagle, −1 Birdie, 0 Par, 1 Bogey … brutto gegen Par. */
  toPar: number | null
}

export interface RoundResult {
  holes: HoleResult[]
  playingHandicap: number
  /** Summe der eingetragenen Schläge; nicht eingetragene Löcher fehlen darin. */
  gross: number
  /** Wie viele Löcher ein Ergebnis haben. */
  played: number
  points: number
  /** Korrigiertes Brutto nach Netto-Doppelbogey, Grundlage des Differentials. */
  adjustedGross: number
  /** Brutto gegen Par über die eingetragenen Löcher. */
  toPar: number
}

/** Eine ganze Runde auswerten. */
export function scoreRound(
  course: CourseCard,
  strokesByHole: Record<number, number | null>,
  handicapIndex: number,
  allowancePct = 100,
): RoundResult {
  const playing = playingHandicap(handicapIndex, course, allowancePct)
  const count = course.holes.length

  const holes: HoleResult[] = course.holes.map((hole) => {
    const strokes = strokesByHole[hole.number] ?? null
    const received = strokesOnHole(playing, hole.strokeIndex, count)
    return {
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      strokes,
      received,
      net: strokes === null ? null : strokes - received,
      points: stablefordPoints(strokes, hole.par, received),
      toPar: strokes === null ? null : strokes - hole.par,
    }
  })

  const played = holes.filter((h) => h.strokes !== null).length
  const gross = holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0)
  const points = holes.reduce((sum, h) => sum + h.points, 0)
  const adjustedGross = course.holes.reduce(
    (sum, hole, i) => sum + adjustedHoleScore(holes[i].strokes, hole.par, holes[i].received),
    0,
  )
  const toPar = holes.reduce((sum, h) => sum + (h.strokes === null ? 0 : h.strokes - h.par), 0)

  return { holes, playingHandicap: playing, gross, played, points, adjustedGross, toPar }
}

/**
 * Score Differential nach WHS — die Zahl, aus der das Handicap entsteht.
 *
 *   Differential = (113 / Slope) × (korrigiertes Brutto − Course Rating)
 */
export function scoreDifferential(adjustedGross: number, course: CourseCard): number {
  const slope = course.slopeRating || 113
  const rating = course.courseRating || course.par
  return Math.round(((113 / slope) * (adjustedGross - rating)) * 10) / 10
}

/** Wie ein Loch heisst, wenn man darüber spricht. */
export function holeLabel(toPar: number | null): string | null {
  if (toPar === null) return null
  if (toPar <= -3) return 'Albatros'
  if (toPar === -2) return 'Eagle'
  if (toPar === -1) return 'Birdie'
  if (toPar === 0) return 'Par'
  if (toPar === 1) return 'Bogey'
  if (toPar === 2) return 'Doppelbogey'
  return `${toPar} über Par`
}
