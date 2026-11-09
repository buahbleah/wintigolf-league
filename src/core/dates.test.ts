import { describe, expect, it } from 'vitest'
import {
  addDays,
  buildWeeks,
  formatRange,
  fromZurichDate,
  nextWeekday,
  timeLeft,
  weekdayOf,
  zurichIsoDate,
} from './dates'

/**
 * Die Saison startet im Dezember und läuft in den Frühling — mitten durch die
 * Zeitumstellung Ende März. Genau dort geht eine naive Rechnung schief, und
 * genau dort muss eine Deadline trotzdem um 23:59 Ortszeit liegen.
 */

describe('Ortszeit', () => {
  it('rechnet Winterzeit mit einer Stunde Verschiebung', () => {
    // 8. Dezember 2026, 00:00 in Zürich ist 7. Dezember 23:00 UTC.
    expect(fromZurichDate('2026-12-08').toISOString()).toBe('2026-12-07T23:00:00.000Z')
  })

  it('rechnet Sommerzeit mit zwei Stunden Verschiebung', () => {
    // Nach der Umstellung am 29. März 2026.
    expect(fromZurichDate('2026-04-06').toISOString()).toBe('2026-04-05T22:00:00.000Z')
  })

  it('legt die Deadline auf 23:59 Ortszeit, auch über die Umstellung hinweg', () => {
    expect(fromZurichDate('2026-03-22', 23, 59).toISOString()).toBe('2026-03-22T22:59:00.000Z')
    expect(fromZurichDate('2026-04-05', 23, 59).toISOString()).toBe('2026-04-05T21:59:00.000Z')
  })

  it('findet zu einem Moment das Ortsdatum zurück', () => {
    // 22:30 UTC im Dezember ist in Zürich schon der nächste Tag.
    expect(zurichIsoDate(new Date('2026-12-07T23:30:00Z'))).toBe('2026-12-08')
  })
})

describe('Kalender', () => {
  it('kennt den Wochentag', () => {
    expect(weekdayOf('2026-12-07')).toBe(1) // Montag
    expect(weekdayOf('2026-12-13')).toBe(7) // Sonntag
  })

  it('springt über Monatsgrenzen', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
  })

  it('findet den nächsten Montag, den Tag selbst eingeschlossen', () => {
    expect(nextWeekday('2026-12-07', 1)).toBe('2026-12-07')
    expect(nextWeekday('2026-12-08', 1)).toBe('2026-12-14')
  })
})

describe('Spielwochen', () => {
  const weeks = buildWeeks({ startDate: '2026-12-07', weeks: 10 })

  it('legt zehn Wochen von Montag bis Sonntag an', () => {
    expect(weeks).toHaveLength(10)
    expect(weeks[0].startDate).toBe('2026-12-07')
    expect(weeks[0].endDate).toBe('2026-12-13')
    expect(weeks[9].startDate).toBe('2027-02-08')
  })

  it('lässt keine Lücke zwischen den Wochen', () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].startDate).toBe(addDays(weeks[i - 1].endDate, 1))
    }
  })

  it('setzt jede Deadline auf Sonntag 23:59 Ortszeit', () => {
    for (const week of weeks) {
      expect(weekdayOf(week.endDate)).toBe(7)
      expect(week.endsAt.getTime()).toBe(fromZurichDate(week.endDate, 23, 59).getTime())
    }
  })

  it('schiebt eine Pausenwoche ein, ohne die Nummerierung zu stören', () => {
    const withBreak = buildWeeks({ startDate: '2026-12-07', weeks: 4, pauseAfter: [2] })
    expect(withBreak[2].startDate).toBe(addDays(withBreak[1].endDate, 8))
    expect(withBreak[3].number).toBe(4)
  })
})

describe('Anzeige', () => {
  it('fasst einen Zeitraum im selben Monat zusammen', () => {
    expect(formatRange('2026-12-07', '2026-12-13')).toBe('7.–13. Dezember')
  })

  it('nennt beide Monate, wenn die Woche hinüberreicht', () => {
    expect(formatRange('2026-12-28', '2027-01-03')).toBe('28. Dezember – 3. Januar')
  })

  it('sagt, wie lange noch Zeit ist', () => {
    const now = new Date('2026-12-10T12:00:00Z')
    expect(timeLeft(new Date('2026-12-13T22:59:00Z'), now)).toBe('noch 3 Tage')
    expect(timeLeft(new Date('2026-12-10T18:00:00Z'), now)).toBe('noch 6 Stunden')
    expect(timeLeft(new Date('2026-12-09T18:00:00Z'), now)).toBe('abgelaufen')
  })
})
