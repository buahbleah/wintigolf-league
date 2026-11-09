import { describe, expect, it } from 'vitest'
import { powerRankings, standings, type PlayerInput } from './standings'

function player(
  name: string,
  results: [number, number][],
  extra: Partial<PlayerInput> = {},
): PlayerInput {
  return {
    userId: name.toLowerCase(),
    name,
    avatarUrl: null,
    indoorHandicap: 12,
    joinedWeek: 1,
    status: 'active',
    results: results.map(([weekNumber, points]) => ({ weekNumber, points, confirmed: true })),
    ...extra,
  }
}

describe('Tabelle', () => {
  it('zählt alle Wochen, solange weniger gespielt sind als gewertet werden', () => {
    const table = standings(
      [player('Anna', [[1, 34], [2, 38]]), player('Beat', [[1, 40], [2, 30]])],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1, 2] },
    )
    expect(table[0].name).toBe('Anna')
    expect(table[0].total).toBe(72)
    expect(table[1].total).toBe(70)
    expect(table[0].droppedWeeks).toEqual([])
  })

  it('streicht am Ende die schlechtesten Wochen', () => {
    const results: [number, number][] = [
      [1, 30], [2, 40], [3, 38], [4, 20], [5, 36],
      [6, 35], [7, 39], [8, 41], [9, 33], [10, 37],
    ]
    const table = standings([player('Anna', results)], {
      weeks: 10,
      droppedWeeks: 2,
      closedWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
    // Gestrichen werden die 20 aus Woche 4 und die 30 aus Woche 1.
    expect(table[0].droppedWeeks).toEqual([1, 4])
    expect(table[0].total).toBe(299)
    expect(table[0].countedWeeks).toHaveLength(8)
  })

  it('wertet eine verpasste Woche als null Punkte, sobald sie vorbei ist', () => {
    const table = standings([player('Anna', [[1, 34]])], {
      weeks: 10,
      droppedWeeks: 2,
      closedWeeks: [1, 2],
    })
    expect(table[0].byWeek[2]).toBe(0)
    expect(table[0].total).toBe(34)
    expect(table[0].played).toBe(1)
  })

  it('lässt eine laufende Woche offen statt sie als null zu werten', () => {
    const table = standings([player('Anna', [[1, 34]])], {
      weeks: 10,
      droppedWeeks: 2,
      closedWeeks: [1],
    })
    expect(table[0].byWeek[2]).toBeNull()
    expect(table[0].total).toBe(34)
  })

  it('rechnet einem Nachzügler die Wochen vor seinem Einstieg nicht an', () => {
    const table = standings(
      [player('Spät', [[3, 38]], { joinedWeek: 3 })],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1, 2, 3] },
    )
    expect(table[0].byWeek[1]).toBeNull()
    expect(table[0].byWeek[2]).toBeNull()
    expect(table[0].total).toBe(38)
  })

  it('zählt Wochensiege, auch geteilte', () => {
    const table = standings(
      [
        player('Anna', [[1, 40], [2, 30]]),
        player('Beat', [[1, 40], [2, 35]]),
        player('Carla', [[1, 30], [2, 35]]),
      ],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1, 2] },
    )
    const wins = Object.fromEntries(table.map((r) => [r.name, r.weekWins]))
    expect(wins).toEqual({ Anna: 1, Beat: 2, Carla: 1 })
  })

  it('entscheidet bei Gleichstand nach der besseren Einzelrunde', () => {
    const table = standings(
      [player('Anna', [[1, 30], [2, 40]]), player('Beat', [[1, 35], [2, 35]])],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1, 2] },
    )
    expect(table[0].name).toBe('Anna')
    expect(table[0].rank).toBe(1)
    expect(table[1].rank).toBe(2)
  })

  it('entscheidet danach nach Wochensiegen und dann nach dem Handicap', () => {
    const table = standings(
      [
        player('Anna', [[1, 35], [2, 35]], { indoorHandicap: 14 }),
        player('Beat', [[1, 35], [2, 35]], { indoorHandicap: 8 }),
      ],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1, 2] },
    )
    // Gleiche Punkte, gleiche beste Runde, gleiche Wochensiege → tieferes Handicap.
    expect(table[0].name).toBe('Beat')
    // Und der gleiche Rang, weil sich die Kriterien nicht unterscheiden.
    expect(table[0].rank).toBe(1)
    expect(table[1].rank).toBe(1)
  })

  it('stellt Ausgeschiedene ans Ende', () => {
    const table = standings(
      [
        player('Weg', [[1, 44]], { status: 'withdrawn' }),
        player('Da', [[1, 20]]),
      ],
      { weeks: 10, droppedWeeks: 2, closedWeeks: [1] },
    )
    expect(table[0].name).toBe('Da')
  })

  it('weist unbestätigte Karten aus', () => {
    const anna = player('Anna', [[1, 34]])
    anna.results[0].confirmed = false
    const table = standings([anna], { weeks: 10, droppedWeeks: 2, closedWeeks: [1] })
    expect(table[0].unconfirmed).toBe(1)
  })
})

describe('Power Rankings', () => {
  it('gewichtet die Form höher als den Schnitt', () => {
    const steigend = player('Steigend', [[1, 20], [2, 24], [3, 40], [4, 42], [5, 44]])
    const fallend = player('Fallend', [[1, 44], [2, 42], [3, 30], [4, 26], [5, 24]])
    const power = powerRankings([steigend, fallend])
    expect(power[0].name).toBe('Steigend')
    expect(power[0].trend).toBeGreaterThan(0)
    expect(power[1].trend).toBeLessThan(0)
  })

  it('rechnet Form aus den letzten drei Runden', () => {
    const power = powerRankings([player('Anna', [[1, 10], [2, 10], [3, 30], [4, 30], [5, 30]])])
    expect(power[0].form).toBe(30)
    expect(power[0].previousForm).toBe(10) // Runde 1 und 2, es gibt nur zwei
    expect(power[0].average).toBe(22)
  })

  it('lässt den Trend offen, wenn es noch keine Vorgeschichte gibt', () => {
    const power = powerRankings([player('Neu', [[1, 30]])])
    expect(power[0].trend).toBeNull()
    expect(power[0].spread).toBe(0)
  })

  it('misst die Verlässlichkeit über die Streuung', () => {
    const ruhig = powerRankings([player('Ruhig', [[1, 34], [2, 35], [3, 36]])])[0]
    const wild = powerRankings([player('Wild', [[1, 20], [2, 50], [3, 35]])])[0]
    expect(ruhig.spread).toBeLessThan(wild.spread)
  })

  it('lässt Ausgeschiedene und Spieler ohne Runde weg', () => {
    const power = powerRankings([
      player('Weg', [[1, 40]], { status: 'withdrawn' }),
      player('Leer', []),
      player('Da', [[1, 30]]),
    ])
    expect(power.map((p) => p.name)).toEqual(['Da'])
  })
})
