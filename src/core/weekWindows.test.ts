import { describe, expect, it } from 'vitest'
import { checkWeekWindow, WeekWindowError } from './weekWindows'
import { daysBetween, fromZurich, fromZurichDateTime, shiftZurichBy, zurichTime } from './dates'

/* Eine ganz gewöhnliche Woche: Montag 00:00 bis Sonntag 23:59. */
function week(number: number, from: string, to: string) {
  return {
    number,
    startsAt: fromZurichDateTime(from, '00:00'),
    endsAt: fromZurichDateTime(to, '23:59'),
  }
}

describe('Ein verschobenes Wochenfenster', () => {
  it('nimmt eine gewöhnliche Woche an', () => {
    expect(() => checkWeekWindow(week(2, '2026-11-23', '2026-11-29'))).not.toThrow()
  })

  it('nimmt auch einen einzelnen Abend an', () => {
    expect(() =>
      checkWeekWindow({
        number: 3,
        startsAt: fromZurichDateTime('2026-12-02', '18:00'),
        endsAt: fromZurichDateTime('2026-12-02', '22:30'),
      }),
    ).not.toThrow()
  })

  it('weist ein Ende vor dem Beginn ab', () => {
    expect(() =>
      checkWeekWindow({
        number: 4,
        startsAt: fromZurichDateTime('2026-12-07', '20:00'),
        endsAt: fromZurichDateTime('2026-12-07', '19:00'),
      }),
    ).toThrow(/liegt vor dem Beginn/)
  })

  it('weist ein Fenster von wenigen Minuten ab', () => {
    expect(() =>
      checkWeekWindow({
        number: 4,
        startsAt: fromZurichDateTime('2026-12-07', '20:00'),
        endsAt: fromZurichDateTime('2026-12-07', '20:20'),
      }),
    ).toThrow(/Stunde/)
  })

  /* Zwei Wochen, die sich überlappen, machen unentscheidbar, zu welcher eine
     Runde gehört — und daran hängt die ganze Tabelle. */
  it('lässt eine Woche nicht in die vorige hineinragen', () => {
    expect(() =>
      checkWeekWindow({
        ...week(3, '2026-11-29', '2026-12-06'),
        previous: week(2, '2026-11-23', '2026-11-29'),
      }),
    ).toThrow(/bevor Woche 2 eingereicht ist/)
  })

  it('lässt eine Woche nicht in die nächste hineinragen', () => {
    expect(() =>
      checkWeekWindow({
        ...week(2, '2026-11-23', '2026-11-30'),
        next: week(3, '2026-11-30', '2026-12-06'),
      }),
    ).toThrow(/Woche 3 schon begonnen/)
  })

  it('lässt die Wochen lückenlos aneinander anschliessen', () => {
    expect(() =>
      checkWeekWindow({
        ...week(2, '2026-11-23', '2026-11-29'),
        previous: week(1, '2026-11-16', '2026-11-22'),
        next: week(3, '2026-11-30', '2026-12-06'),
      }),
    ).not.toThrow()
  })

  /* Der Fall, der eine gültige Karte nachträglich ungültig machen würde. */
  it('schliesst keine Karte aus, die schon abgegeben wurde', () => {
    const abgegeben = fromZurich(2026, 11, 25, 20, 14)
    expect(() =>
      checkWeekWindow({ ...week(2, '2026-11-23', '2026-11-29'), cardTimes: [abgegeben] }),
    ).not.toThrow()
    expect(() =>
      checkWeekWindow({ ...week(2, '2026-11-26', '2026-11-29'), cardTimes: [abgegeben] }),
    ).toThrow(/bereits eine Karte vom 25. November, 20:14/)
  })

  it('stört sich nicht an Wochen ohne Karten', () => {
    expect(() =>
      checkWeekWindow({ ...week(5, '2026-12-14', '2026-12-20'), cardTimes: [null, undefined] }),
    ).not.toThrow()
  })

  it('wirft einen Fehler, den die API als solchen erkennt', () => {
    expect(() => checkWeekWindow(week(1, '2026-11-22', '2026-11-16'))).toThrow(WeekWindowError)
  })
})

describe('Termine verschieben', () => {
  it('behält die Uhrzeit über die Zeitumstellung hinweg', () => {
    /* Letzter Sonntag im März 2027: in dieser Nacht springt die Uhr vor. */
    const davor = fromZurich(2027, 3, 25, 19, 30)
    const danach = shiftZurichBy(davor, 7)
    expect(zurichTime(danach)).toBe('19:30')
    // Nach der Uhr sieben Tage, nach der Dauer eine Stunde weniger.
    expect(danach.getTime() - davor.getTime()).toBe(7 * 24 * 3_600_000 - 3_600_000)
  })

  it('verschiebt Tage und Minuten zusammen', () => {
    const start = fromZurich(2026, 11, 16, 0, 0)
    const moved = shiftZurichBy(start, 7, 19 * 60 + 30)
    expect(zurichTime(moved)).toBe('19:30')
    expect(moved.getTime()).toBe(fromZurich(2026, 11, 23, 19, 30).getTime())
  })

  it('rechnet einen Minutensprung über Mitternacht in den Tag um', () => {
    const start = fromZurich(2026, 11, 16, 23, 0)
    expect(shiftZurichBy(start, 0, 120).getTime()).toBe(fromZurich(2026, 11, 17, 1, 0).getTime())
    expect(shiftZurichBy(start, 0, -1440).getTime()).toBe(fromZurich(2026, 11, 15, 23, 0).getTime())
  })

  it('zählt Tage zwischen zwei Daten', () => {
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7)
    expect(daysBetween('2026-11-23', '2026-11-16')).toBe(-7)
    expect(daysBetween('2026-11-16', '2026-11-16')).toBe(0)
    // Über die Zeitumstellung hinweg bleibt ein Tag ein Tag.
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2)
  })

  it('liest eine Uhrzeit in Ortszeit und gibt sie wieder her', () => {
    expect(zurichTime(fromZurichDateTime('2026-11-16', '19:30'))).toBe('19:30')
    expect(zurichTime(fromZurichDateTime('2026-07-01', '19:30'))).toBe('19:30')
  })
})
