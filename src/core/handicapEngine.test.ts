import { describe, expect, it } from 'vitest'
import { conguDelta, indexForWeek, indexFromDifferentials, replaySeason } from './handicapEngine'
import { DEFAULT_SETTINGS, type LeagueSettings } from './settings'

const whs: LeagueSettings = { ...DEFAULT_SETTINGS, engine: 'whs' }
const congu: LeagueSettings = { ...DEFAULT_SETTINGS, engine: 'congu' }

function rounds(values: { week: number; points: number; diff: number }[]) {
  return values.map((v) => ({ weekNumber: v.week, points: v.points, differential: v.diff }))
}

describe('WHS-Tabelle für kurze Historien', () => {
  it('gibt unter drei Runden noch kein Handicap', () => {
    expect(indexFromDifferentials([12.0])).toBeNull()
    expect(indexFromDifferentials([12.0, 14.0])).toBeNull()
  })

  it('nimmt bei drei Runden das tiefste minus 2.0', () => {
    expect(indexFromDifferentials([18.0, 14.0, 16.0])).toBe(12)
  })

  it('nimmt bei vier Runden das tiefste minus 1.0', () => {
    expect(indexFromDifferentials([18.0, 14.0, 16.0, 20.0])).toBe(13)
  })

  it('nimmt bei fünf Runden das tiefste ohne Abzug', () => {
    expect(indexFromDifferentials([18, 14, 16, 20, 22])).toBe(14)
  })

  it('nimmt bei sechs Runden den Schnitt der zwei tiefsten minus 1.0', () => {
    // tiefste zwei: 14 und 15 → 14.5 − 1.0
    expect(indexFromDifferentials([18, 14, 16, 20, 22, 15])).toBe(13.5)
  })

  it('nimmt bei acht Runden den Schnitt der zwei tiefsten ohne Abzug', () => {
    expect(indexFromDifferentials([18, 14, 16, 20, 22, 15, 19, 21])).toBe(14.5)
  })

  it('nimmt bei zehn Runden den Schnitt der drei tiefsten', () => {
    // tiefste drei: 14, 15, 16 → 15.0
    expect(indexFromDifferentials([18, 14, 16, 20, 22, 15, 19, 21, 23, 17])).toBe(15)
  })

  it('schaut nie weiter zurück als zwanzig Runden', () => {
    const many = [...Array(25)].map((_, i) => (i < 5 ? 2 : 20))
    // Die fünf sehr guten Runden sind aus dem Fenster gefallen.
    expect(indexFromDifferentials(many)).toBe(20)
  })
})

describe('Eine Saison durchrechnen, WHS', () => {
  it('lässt das Handicap stehen, bis drei Runden da sind', () => {
    const steps = replaySeason(
      12.3,
      rounds([
        { week: 1, points: 34, diff: 15 },
        { week: 2, points: 36, diff: 13 },
      ]),
      whs,
    )
    expect(steps.map((s) => s.after)).toEqual([12.3, 12.3])
    expect(steps[0].reason).toContain('zu wenige Runden')
  })

  it('bewegt sich ab der dritten Runde, aber höchstens um die erlaubte Spanne', () => {
    const steps = replaySeason(
      12.3,
      rounds([
        { week: 1, points: 30, diff: 20 },
        { week: 2, points: 30, diff: 21 },
        { week: 3, points: 28, diff: 22 },
      ]),
      whs,
    )
    // Gemessen wären 20 − 2 = 18.0, das sind 5.7 mehr: in der Eichphase gilt
    // die doppelte Spanne, also 4.0.
    expect(steps[2].after).toBe(16.3)
    expect(steps[2].reason).toContain('gedeckelt')
  })

  it('zieht bei einer aussergewöhnlichen Runde zusätzlich ab', () => {
    const steps = replaySeason(
      20,
      rounds([
        { week: 4, points: 36, diff: 20 },
        { week: 5, points: 36, diff: 20 },
        { week: 6, points: 50, diff: 8 },
      ]),
      { ...whs, maxMovePerRound: 20, calibrationWeeks: 0 },
    )
    // Tiefstes 8 minus 2 (drei Runden) = 6.0, und weil die Runde 12 besser war
    // als das Handicap davor, nochmals 2.0 weniger.
    expect(steps[2].after).toBe(4)
    expect(steps[2].reason).toContain('−2.0')
  })

  it('lässt das Handicap nie weit über den Tiefstwert der Saison steigen', () => {
    const steps = replaySeason(
      10,
      rounds([
        { week: 4, points: 40, diff: 8 },
        { week: 5, points: 40, diff: 8 },
        { week: 6, points: 40, diff: 8 },
        { week: 7, points: 10, diff: 30 },
        { week: 8, points: 10, diff: 30 },
        { week: 9, points: 10, diff: 30 },
      ]),
      { ...whs, calibrationWeeks: 0, maxMovePerRound: 10 },
    )
    const low = Math.min(...steps.map((s) => s.after))
    const last = steps[steps.length - 1].after
    expect(last).toBeLessThanOrEqual(low + whs.softCap)
  })

  /**
   * Der Fall, für den das Verfahren überhaupt gewählt wurde: Startwert zu tief
   * geschätzt. Nach ein paar Runden muss das Handicap dort sein, wo gespielt
   * wird — der Soft Cap darf eine Fehlschätzung nicht festschreiben.
   */
  it('holt einen zu tief geschätzten Startwert wieder ein', () => {
    const steps = replaySeason(
      8,
      rounds([
        { week: 1, points: 24, diff: 26 },
        { week: 2, points: 23, diff: 27 },
        { week: 3, points: 25, diff: 25 },
        { week: 4, points: 24, diff: 26 },
        { week: 5, points: 26, diff: 24 },
        { week: 6, points: 25, diff: 25 },
      ]),
      whs,
    )
    // Es klettert jede Runde weiter nach oben, statt vom Soft Cap bei einem
    // falschen Startwert festgehalten zu werden.
    expect(steps[steps.length - 1].after).toBe(18)
    expect(steps.map((s) => s.after)).toEqual([8, 8, 12, 14, 16, 18])

    // Und nach ein paar Runden mehr steht es dort, wo gespielt wird.
    const longer = replaySeason(
      8,
      rounds(
        [...Array(10)].map((_, i) => ({ week: i + 1, points: 25, diff: 25 })),
      ),
      whs,
    )
    expect(longer[longer.length - 1].after).toBeGreaterThanOrEqual(22)
  })

  it('bleibt in den Grenzen', () => {
    const steps = replaySeason(
      54,
      rounds([
        { week: 4, points: 0, diff: 60 },
        { week: 5, points: 0, diff: 60 },
        { week: 6, points: 0, diff: 60 },
      ]),
      { ...whs, calibrationWeeks: 0, maxMovePerRound: 50 },
    )
    expect(steps[2].after).toBeLessThanOrEqual(54)
  })
})

describe('CONGU', () => {
  it('ändert innerhalb der Pufferzone nichts', () => {
    expect(conguDelta(35, congu)).toBe(0)
    expect(conguDelta(36, congu)).toBe(0)
    expect(conguDelta(37, congu)).toBe(0)
  })

  it('kürzt über der Pufferzone je Punkt', () => {
    expect(conguDelta(40, congu)).toBe(-0.6)
  })

  it('erhöht unter der Pufferzone je Punkt', () => {
    expect(conguDelta(30, congu)).toBe(1)
  })

  it('rechnet eine Saison Schritt für Schritt durch', () => {
    const steps = replaySeason(
      12.3,
      rounds([
        { week: 4, points: 42, diff: 10 },
        { week: 5, points: 33, diff: 18 },
        { week: 6, points: 36, diff: 14 },
      ]),
      congu,
    )
    expect(steps[0].after).toBe(11.3) // −1.0
    expect(steps[1].after).toBe(11.7) // +0.4
    expect(steps[2].after).toBe(11.7) // Pufferzone
  })

  it('bewegt sich in der Eichphase doppelt so weit', () => {
    const steps = replaySeason(
      12.3,
      rounds([{ week: 1, points: 60, diff: 2 }]),
      { ...congu, maxMovePerRound: 1 },
    )
    // −4.6 wären es, gedeckelt auf 1.0 × Faktor 2.
    expect(steps[0].after).toBe(10.3)
  })
})

describe('Welches Handicap in welcher Woche gilt', () => {
  const steps = replaySeason(
    12.3,
    rounds([
      { week: 1, points: 30, diff: 20 },
      { week: 2, points: 30, diff: 21 },
      { week: 3, points: 28, diff: 22 },
      { week: 4, points: 34, diff: 17 },
    ]),
    whs,
  )

  it('spielt in der Eichphase auf dem Startwert', () => {
    expect(indexForWeek(12.3, steps, 1, whs)).toBe(12.3)
    expect(indexForWeek(12.3, steps, 3, whs)).toBe(12.3)
  })

  it('spielt danach auf dem gemessenen Wert', () => {
    expect(indexForWeek(12.3, steps, 4, whs)).toBe(steps[2].after)
    expect(indexForWeek(12.3, steps, 5, whs)).toBe(steps[3].after)
  })
})
