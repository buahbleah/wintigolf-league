import { strokesOnHole, type CourseCard } from './scoring.js'

/**
 * Matchplay.
 *
 * Im Playoff zählt nicht die Summe, sondern das einzelne Loch: wer es netto
 * gewinnt, geht ein Loch in Führung, und wer weiter vorne liegt, als noch Löcher
 * übrig sind, hat gewonnen. Daher «3&2» — drei Löcher vorne, zwei noch zu
 * spielen, Ende.
 *
 * Die Schläge werden nach dem **vollen Unterschied** vergeben: der Spieler mit
 * dem tieferen Handicap spielt ohne Vorgabe, der andere bekommt die Differenz
 * nach Stroke-Index. So steht es in der Abmachung und so macht es der Rest der
 * Golfwelt auch.
 *
 * Gerechnet wird aus den beiden Karten, die ohnehin eingetragen werden — niemand
 * muss «wer hat gewonnen» von Hand eintippen, und der Beleg liegt daneben.
 */

export interface MatchSide {
  userId: string
  name: string
  /** Playing Handicap aus der eigenen Karte. */
  playingHandicap: number
  strokes: Record<number, number | null>
}

export interface MatchHole {
  number: number
  par: number
  strokeIndex: number
  /** Schläge, die auf diesem Loch vergeben werden, und an wen. */
  given: { userId: string; strokes: number } | null
  grossHome: number | null
  grossAway: number | null
  netHome: number | null
  netAway: number | null
  /** 'home', 'away' oder null für geteilt. */
  winner: 'home' | 'away' | null
  /** Stand aus Sicht von home, nach diesem Loch. */
  standing: number
}

export interface MatchResult {
  holes: MatchHole[]
  /** Positiv heisst: home liegt vorne. */
  standing: number
  /** Gespielte Löcher mit Ergebnis auf mindestens einer Karte. */
  played: number
  /** Nach welchem Loch das Match entschieden war, null wenn offen oder geteilt. */
  decidedOnHole: number | null
  /** 'home', 'away', null = noch offen oder geteilt. */
  winner: 'home' | 'away' | null
  /** 'geteilt', wenn nach allen Löchern Gleichstand herrscht. */
  allSquare: boolean
  /** Wie man es aufschreibt: «3&2», «1 auf», «geteilt». */
  label: string
}

/**
 * Ein Match aus zwei Karten.
 *
 * `home` ist der höher gesetzte Spieler — nur für die Vorzeichen, auf das
 * Ergebnis hat das keinen Einfluss.
 */
export function playMatch(course: CourseCard, home: MatchSide, away: MatchSide): MatchResult {
  const difference = Math.abs(home.playingHandicap - away.playingHandicap)
  const receiver = home.playingHandicap > away.playingHandicap ? home : away
  const count = course.holes.length

  const holes: MatchHole[] = []
  let standing = 0
  let decidedOnHole: number | null = null
  let standingAtDecision = 0
  let played = 0

  course.holes.forEach((hole, index) => {
    const given = difference > 0 ? strokesOnHole(difference, hole.strokeIndex, count) : 0
    const homeGiven = receiver === home ? given : 0
    const awayGiven = receiver === away ? given : 0

    const grossHome = home.strokes[hole.number] ?? null
    const grossAway = away.strokes[hole.number] ?? null
    const netHome = grossHome === null ? null : grossHome - homeGiven
    const netAway = grossAway === null ? null : grossAway - awayGiven

    /* Ein Loch ohne Ergebnis auf einer Karte ist ein aufgenommenes Loch: wer
       eine Zahl hat, gewinnt es. Steht auf beiden Karten nichts, wurde es noch
       gar nicht gespielt — so ein Loch bewegt weder den Stand noch entscheidet
       es das Match. */
    let winner: 'home' | 'away' | null = null
    const touched = netHome !== null || netAway !== null

    if (touched) {
      played++
      if (netHome === null) winner = 'away'
      else if (netAway === null) winner = 'home'
      else if (netHome < netAway) winner = 'home'
      else if (netAway < netHome) winner = 'away'

      if (winner === 'home') standing++
      if (winner === 'away') standing--

      const remaining = count - (index + 1)
      if (decidedOnHole === null && Math.abs(standing) > remaining && Math.abs(standing) > 0) {
        decidedOnHole = hole.number
        standingAtDecision = standing
      }
    }

    holes.push({
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      given: given > 0 ? { userId: receiver.userId, strokes: given } : null,
      grossHome,
      grossAway,
      netHome,
      netAway,
      winner,
      standing,
    })
  })

  const complete = played === count
  const winner = decidedOnHole !== null ? (standingAtDecision > 0 ? 'home' : 'away') : null
  const allSquare = complete && standing === 0

  return {
    holes,
    standing,
    played,
    decidedOnHole,
    winner,
    allSquare,
    /* Nach der Entscheidung zählt der Stand von damals: ein Match endet auf dem
       Loch, auf dem es entschieden ist, auch wenn beide die Runde zu Ende
       spielen, weil sie ohnehin am Simulator stehen. */
    label: label(decidedOnHole !== null ? standingAtDecision : standing, decidedOnHole, count, complete),
  }
}

/** «3&2», «1 auf», «geteilt» — oder der Zwischenstand, solange es läuft. */
function label(
  standing: number,
  decidedOnHole: number | null,
  count: number,
  complete: boolean,
): string {
  const lead = Math.abs(standing)

  if (decidedOnHole !== null) {
    const remaining = count - decidedOnHole
    return remaining > 0 ? `${lead}&${remaining}` : `${lead} auf`
  }
  if (complete) return standing === 0 ? 'geteilt' : `${lead} auf`
  if (lead === 0) return 'alles gleich'
  return `${lead} auf`
}

/** Wer nach dem Stechen gewonnen hat, wird eingetragen, nicht gerechnet. */
export const SUDDEN_DEATH_LABEL = 'im Stechen'

/**
 * Das Bracket einer Playoff-Runde.
 *
 * Gesetzt wird so, dass sich 1 und 2 frühestens im Final treffen: 1 gegen den
 * Letzten, 2 gegen den Zweitletzten, und die Paare liegen in den Hälften über
 * Kreuz.
 */
export function bracketPairs(size: number): [number, number][] {
  if (size === 2) return [[1, 2]]
  if (size === 4) {
    return [
      [1, 4],
      [2, 3],
    ]
  }
  // Acht: 1–8 und 4–5 in der oberen Hälfte, 2–7 und 3–6 in der unteren.
  return [
    [1, 8],
    [4, 5],
    [3, 6],
    [2, 7],
  ]
}

/** Die Runden einer Playoff-Serie, von der ersten bis zum Final. */
export function bracketRounds(size: number): { name: string; matches: number }[] {
  const rounds: { name: string; matches: number }[] = []
  if (size >= 8) rounds.push({ name: 'quarter', matches: 4 })
  if (size >= 4) rounds.push({ name: 'semi', matches: 2 })
  rounds.push({ name: 'final', matches: 1 })
  return rounds
}
