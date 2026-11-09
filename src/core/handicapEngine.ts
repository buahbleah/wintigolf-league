import type { LeagueSettings } from './settings'

/**
 * Der Handicap-Motor.
 *
 * Zwei Verfahren, umschaltbar, beide aus denselben Daten:
 *
 * **WHS** rechnet aus jeder Runde ein Score Differential — was die Schlagzahl
 * gegen Rating und Slope wert war — und nimmt den Schnitt der tiefsten. Das ist
 * das Verfahren, mit dem die USGA einen Golfer von null auf ein Handicap bringt,
 * und genau das ist die Lage indoor: niemand weiss am Anfang, was er auf der
 * Matte wirklich spielt. Es korrigiert in beide Richtungen gleich schnell.
 *
 * **CONGU** schaut nur auf die Stableford-Punkte gegen eine Pufferzone. Leichter
 * zu erklären, aber ungenauer, weil es den Kurs nur über die Punkte sieht.
 *
 * Beide rechnen immer die *ganze* Geschichte neu durch, Runde für Runde. Das
 * macht das Ergebnis unabhängig davon, in welcher Reihenfolge Bestätigungen
 * eintreffen, und eine nachträgliche Korrektur rechnet sauber durch — ohne dass
 * eine gespielte Runde ihr eigenes Handicap verlöre, denn das steht in der Runde.
 */

/** Was eine Runde für den Motor beisteuert. */
export interface HandicapRound {
  /** Spielwoche, für die Eichphase. */
  weekNumber: number
  /** Netto-Stableford-Punkte der Runde. */
  points: number
  /** Score Differential nach WHS. */
  differential: number
}

export interface HandicapStep {
  weekNumber: number
  before: number
  after: number
  differential: number
  /** Was den Ausschlag gab — für die Anzeige im Verlauf. */
  reason: string
}

/**
 * Die WHS-Tabelle für kurze Historien (Rule 5.2a): wie viele der tiefsten
 * Differentials zählen und was danach noch abgezogen wird.
 */
const WHS_TABLE: Record<number, { take: number; adjust: number }> = {
  3: { take: 1, adjust: -2 },
  4: { take: 1, adjust: -1 },
  5: { take: 1, adjust: 0 },
  6: { take: 2, adjust: -1 },
  7: { take: 2, adjust: 0 },
  8: { take: 2, adjust: 0 },
  9: { take: 3, adjust: 0 },
  10: { take: 3, adjust: 0 },
  11: { take: 3, adjust: 0 },
  12: { take: 4, adjust: 0 },
  13: { take: 4, adjust: 0 },
  14: { take: 4, adjust: 0 },
  15: { take: 5, adjust: 0 },
  16: { take: 5, adjust: 0 },
  17: { take: 6, adjust: 0 },
  18: { take: 6, adjust: 0 },
  19: { take: 7, adjust: 0 },
  20: { take: 8, adjust: 0 },
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Der Index aus einer Reihe von Differentials, nach WHS. */
export function indexFromDifferentials(differentials: number[]): number | null {
  if (differentials.length < 3) return null
  const recent = differentials.slice(-20)
  const rule = WHS_TABLE[Math.min(recent.length, 20)]
  const lowest = [...recent].sort((a, b) => a - b).slice(0, rule.take)
  const average = lowest.reduce((sum, d) => sum + d, 0) / lowest.length
  return round1(average + rule.adjust)
}

/**
 * Die ganze Saison eines Spielers durchrechnen.
 *
 * Gibt für jede Runde einen Schritt zurück: Handicap davor, danach, und warum.
 * Der letzte Schritt ist das aktuelle Handicap.
 */
export function replaySeason(
  startingIndex: number,
  rounds: HandicapRound[],
  settings: LeagueSettings,
): HandicapStep[] {
  const steps: HandicapStep[] = []
  let current = startingIndex
  const differentials: number[] = []

  /**
   * Der Tiefstwert, gegen den der Soft Cap misst: das tiefste *gemessene*
   * Handicap, also der tiefste Zielwert, den die Runden je ergeben haben — nicht
   * der geschätzte Startwert und nicht ein Zwischenstand auf dem Weg dorthin.
   *
   * Das ist der Unterschied zwischen einem Netz und einer Fessel. Wer zu tief
   * geschätzt startet, klettert mit jeder Runde weiter nach oben, bis das
   * Handicap dort ist, wo wirklich gespielt wird. Wer dagegen nachweislich gut
   * gespielt hat und dann einen Totalabend hinlegt, wird davon nicht aufgebläht.
   */
  let lowTarget: number | null = null

  for (const round of rounds) {
    const before = current
    differentials.push(round.differential)

    // In der Eichphase darf sich das Handicap schneller bewegen: ein zu tief
    // geratener Startwert soll nicht die halbe Saison nachwirken.
    const inCalibration = round.weekNumber <= settings.calibrationWeeks
    const maxMove = settings.maxMovePerRound * (inCalibration ? settings.calibrationFactor : 1)

    let target: number
    let reason: string

    if (settings.engine === 'congu') {
      const delta = conguDelta(round.points, settings)
      target = before + delta
      reason =
        delta === 0
          ? `${round.points} Punkte, in der Pufferzone`
          : delta < 0
            ? `${round.points} Punkte, über der Pufferzone`
            : `${round.points} Punkte, unter der Pufferzone`
    } else {
      const measured = indexFromDifferentials(differentials)
      if (measured === null) {
        // Unter drei Runden gibt es nach WHS noch kein Handicap: es bleibt stehen.
        steps.push({
          weekNumber: round.weekNumber,
          before,
          after: before,
          differential: round.differential,
          reason: `Differential ${round.differential.toFixed(1)} — noch zu wenige Runden`,
        })
        continue
      }
      target = measured
      reason = `Differential ${round.differential.toFixed(1)} · Schnitt der besten`

      // Aussergewöhnlich gute Runde: zusätzlich nach unten. Das ist die
      // eingebaute Antwort des WHS auf ein geschontes Handicap.
      const better = before - round.differential
      if (better >= settings.exceptionalMajor) {
        target -= 2
        reason += ` · ${better.toFixed(1)} besser als das Handicap, −2.0`
      } else if (better >= settings.exceptionalMinor) {
        target -= 1
        reason += ` · ${better.toFixed(1)} besser als das Handicap, −1.0`
      }
    }

    // Soft Cap gegen den Tiefstwert aus den Runden davor.
    const capped = lowTarget === null ? target : Math.min(target, lowTarget + settings.softCap)
    if (capped < target) reason += ' · Soft Cap'
    lowTarget = lowTarget === null ? target : Math.min(lowTarget, target)

    // Und nie mehr als die erlaubte Bewegung in einer Runde.
    let next = capped
    if (next - before > maxMove) {
      next = before + maxMove
      reason += ` · auf +${maxMove.toFixed(1)} gedeckelt`
    } else if (before - next > maxMove) {
      next = before - maxMove
      reason += ` · auf −${maxMove.toFixed(1)} gedeckelt`
    }

    next = round1(Math.min(settings.maxIndex, Math.max(settings.minIndex, next)))
    current = next


    steps.push({
      weekNumber: round.weekNumber,
      before: round1(before),
      after: current,
      differential: round.differential,
      reason,
    })
  }

  return steps
}

/** Die Bewegung nach CONGU: Punkte gegen die Pufferzone. */
export function conguDelta(points: number, settings: LeagueSettings): number {
  if (points > settings.bufferHigh) {
    return -round1((points - settings.bufferHigh) * settings.conguCutPerPoint)
  }
  if (points < settings.bufferLow) {
    return round1((settings.bufferLow - points) * settings.conguRisePerPoint)
  }
  return 0
}

/**
 * Das Handicap, auf das in einer Woche gespielt wird.
 *
 * In der Eichphase ist das der Startwert — erst danach zählt das Gemessene.
 * Deshalb kann eine Runde aus Woche 2 das Handicap für Woche 4 beeinflussen,
 * ohne dass sich an Woche 2 selbst etwas ändert.
 */
export function indexForWeek(
  startingIndex: number,
  steps: HandicapStep[],
  weekNumber: number,
  settings: LeagueSettings,
): number {
  if (weekNumber <= settings.calibrationWeeks) return startingIndex
  const before = steps.filter((s) => s.weekNumber < weekNumber)
  return before.length ? before[before.length - 1].after : startingIndex
}
