import { describe, expect, it } from 'vitest'
import { bracketPairs, bracketRounds, playMatch, type MatchSide } from './matchplay'
import { defaultHoles } from './externalCourse'
import type { CourseCard } from './scoring'

const card: CourseCard = { par: 72, courseRating: 71.4, slopeRating: 128, holes: defaultHoles() }

function side(name: string, playingHandicap: number, strokes: Record<number, number | null>): MatchSide {
  return { userId: name.toLowerCase(), name, playingHandicap, strokes }
}

/** Alle achtzehn Löcher mit derselben Schlagzahl über Par. */
function flat(over: number): Record<number, number> {
  const out: Record<number, number> = {}
  for (const hole of card.holes) out[hole.number] = hole.par + over
  return out
}

describe('Matchplay', () => {
  it('teilt ein Match, in dem beide gleich spielen', () => {
    const result = playMatch(card, side('A', 10, flat(1)), side('B', 10, flat(1)))
    expect(result.standing).toBe(0)
    expect(result.allSquare).toBe(true)
    expect(result.winner).toBeNull()
    expect(result.label).toBe('geteilt')
  })

  it('gibt dem höheren Handicap die Differenz nach Stroke-Index', () => {
    const result = playMatch(card, side('A', 10, flat(1)), side('B', 13, flat(1)))
    // B bekommt drei Schläge, auf den Löchern mit Stroke-Index 1 bis 3.
    const given = result.holes.filter((h) => h.given !== null)
    expect(given).toHaveLength(3)
    expect(given.map((h) => h.strokeIndex).sort((x, y) => x - y)).toEqual([1, 2, 3])
    expect(given.every((h) => h.given?.userId === 'b')).toBe(true)
    // Und gewinnt damit genau diese drei Löcher.
    expect(result.standing).toBe(-3)
  })

  it('schreibt ein entschiedenes Match als «3&2»', () => {
    const a = flat(1)
    const b = flat(1)
    // A gewinnt die Löcher 1, 2 und 3.
    b[1] = card.holes[0].par + 2
    b[2] = card.holes[1].par + 2
    b[3] = card.holes[2].par + 2
    // Danach teilen sie alles bis Loch 16.
    const result = playMatch(card, side('A', 10, a), side('B', 10, b))
    expect(result.decidedOnHole).toBe(16)
    expect(result.winner).toBe('home')
    expect(result.label).toBe('3&2')
  })

  it('schreibt einen Sieg auf dem letzten Loch als «1 auf»', () => {
    const a = flat(1)
    const b = flat(1)
    b[18] = card.holes[17].par + 2
    const result = playMatch(card, side('A', 10, a), side('B', 10, b))
    expect(result.decidedOnHole).toBe(18)
    expect(result.label).toBe('1 auf')
    expect(result.winner).toBe('home')
  })

  it('gibt ein Loch ohne Ergebnis an den, der eine Zahl hat', () => {
    const a = flat(1)
    const b: Record<number, number | null> = { ...flat(1) }
    b[7] = null
    const result = playMatch(card, side('A', 10, a), side('B', 10, b))
    expect(result.holes[6].winner).toBe('home')
    expect(result.standing).toBe(1)
  })

  it('zeigt den Zwischenstand, solange noch nicht alles gespielt ist', () => {
    const a: Record<number, number | null> = {}
    const b: Record<number, number | null> = {}
    for (let i = 1; i <= 5; i++) {
      a[i] = card.holes[i - 1].par
      b[i] = card.holes[i - 1].par + 1
    }
    const result = playMatch(card, side('A', 10, a), side('B', 10, b))
    expect(result.played).toBe(5)
    expect(result.standing).toBe(5)
    expect(result.winner).toBeNull() // 5 vorne, aber 13 noch zu spielen
    expect(result.label).toBe('5 auf')
  })

  it('beendet das Match, sobald der Vorsprung grösser ist als die Restlöcher', () => {
    const a = flat(0)
    const b = flat(2)
    const result = playMatch(card, side('A', 10, a), side('B', 10, b))
    // A gewinnt jedes Loch: nach Loch 10 steht es 10 zu 0 bei 8 Restlöchern.
    expect(result.decidedOnHole).toBe(10)
    expect(result.label).toBe('10&8')
  })
})

describe('Bracket', () => {
  it('setzt zu zweit nur den Final', () => {
    expect(bracketPairs(2)).toEqual([[1, 2]])
    expect(bracketRounds(2).map((r) => r.name)).toEqual(['final'])
  })

  it('setzt zu viert 1–4 und 2–3', () => {
    expect(bracketPairs(4)).toEqual([
      [1, 4],
      [2, 3],
    ])
    expect(bracketRounds(4).map((r) => r.name)).toEqual(['semi', 'final'])
  })

  it('setzt zu acht so, dass 1 und 2 sich erst im Final treffen', () => {
    const pairs = bracketPairs(8)
    expect(pairs).toEqual([
      [1, 8],
      [4, 5],
      [3, 6],
      [2, 7],
    ])
    // Erste zwei Paare bilden die obere Hälfte, die anderen die untere.
    const upper = pairs.slice(0, 2).flat()
    const lower = pairs.slice(2).flat()
    expect(upper).toContain(1)
    expect(lower).toContain(2)
    expect(bracketRounds(8).map((r) => r.name)).toEqual(['quarter', 'semi', 'final'])
  })
})
