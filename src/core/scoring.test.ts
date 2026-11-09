import { describe, expect, it } from 'vitest'
import {
  adjustedHoleScore,
  courseHandicap,
  playingHandicap,
  scoreDifferential,
  scoreRound,
  stablefordPoints,
  strokesOnHole,
  type CourseCard,
} from './scoring'
import { defaultHoles } from './externalCourse'

const card: CourseCard = {
  par: 72,
  courseRating: 71.4,
  slopeRating: 128,
  holes: defaultHoles(),
}

describe('Course Handicap', () => {
  it('rechnet Slope und Rating ein', () => {
    // 12.3 × (128/113) + (71.4 − 72) = 13.93 − 0.6 = 13.33 → 13
    expect(courseHandicap(12.3, card)).toBe(13)
  })

  it('kommt mit Plus-Handicaps zurecht', () => {
    expect(courseHandicap(-2.4, card)).toBe(-3)
  })

  it('nimmt Par, wenn kein Rating da ist', () => {
    expect(courseHandicap(18, { ...card, courseRating: 0, slopeRating: 0 })).toBe(18)
  })

  it('wendet die Allowance an', () => {
    expect(playingHandicap(12.3, card, 100)).toBe(13)
    expect(playingHandicap(12.3, card, 95)).toBe(12)
  })
})

describe('Schlagvergabe', () => {
  it('gibt die Schläge auf den schwersten Löchern', () => {
    expect(strokesOnHole(3, 1)).toBe(1)
    expect(strokesOnHole(3, 3)).toBe(1)
    expect(strokesOnHole(3, 4)).toBe(0)
  })

  it('gibt bei 18 jedem Loch genau einen', () => {
    const all = defaultHoles().map((h) => strokesOnHole(18, h.strokeIndex))
    expect(all.every((s) => s === 1)).toBe(true)
  })

  it('gibt über 18 hinaus den schwersten Löchern zwei', () => {
    expect(strokesOnHole(20, 1)).toBe(2)
    expect(strokesOnHole(20, 2)).toBe(2)
    expect(strokesOnHole(20, 3)).toBe(1)
  })

  it('nimmt dem Plus-Spieler Schläge auf den leichtesten Löchern', () => {
    expect(strokesOnHole(-2, 18)).toBe(-1)
    expect(strokesOnHole(-2, 17)).toBe(-1)
    expect(strokesOnHole(-2, 16)).toBe(0)
  })

  it('verteilt die Schläge vollständig und ohne Rest', () => {
    for (const playing of [0, 1, 7, 13, 18, 25, 36, 54]) {
      const total = defaultHoles().reduce((sum, h) => sum + strokesOnHole(playing, h.strokeIndex), 0)
      expect(total).toBe(playing)
    }
  })
})

describe('Punkte', () => {
  it('zählt gegen das Netto-Ergebnis', () => {
    expect(stablefordPoints(4, 4, 0)).toBe(2) // Par
    expect(stablefordPoints(3, 4, 0)).toBe(3) // Birdie
    expect(stablefordPoints(2, 4, 0)).toBe(4) // Eagle
    expect(stablefordPoints(5, 4, 0)).toBe(1) // Bogey
    expect(stablefordPoints(6, 4, 0)).toBe(0) // Doppelbogey
    expect(stablefordPoints(9, 4, 0)).toBe(0) // und alles darunter
  })

  it('rechnet den erhaltenen Schlag mit', () => {
    expect(stablefordPoints(5, 4, 1)).toBe(2) // Bogey brutto, Par netto
    expect(stablefordPoints(6, 4, 2)).toBe(2)
  })

  it('gibt für ein Loch ohne Ergebnis null Punkte', () => {
    expect(stablefordPoints(null, 4, 1)).toBe(0)
  })
})

describe('Korrigiertes Brutto', () => {
  it('deckelt bei Netto-Doppelbogey', () => {
    expect(adjustedHoleScore(9, 4, 0)).toBe(6)
    expect(adjustedHoleScore(9, 4, 1)).toBe(7)
    expect(adjustedHoleScore(5, 4, 0)).toBe(5)
  })

  it('wertet ein Loch ohne Ergebnis als Netto-Doppelbogey', () => {
    expect(adjustedHoleScore(null, 5, 1)).toBe(8)
  })
})

describe('Eine ganze Runde', () => {
  /** Wer auf jedem Loch netto Par spielt, kommt auf 36 Punkte. */
  it('ergibt 36 Punkte, wenn jemand genau auf sein Handicap spielt', () => {
    const index = 12.3
    const playing = playingHandicap(index, card)
    const strokes: Record<number, number> = {}
    for (const hole of card.holes) {
      strokes[hole.number] = hole.par + strokesOnHole(playing, hole.strokeIndex)
    }
    const result = scoreRound(card, strokes, index)
    expect(result.playingHandicap).toBe(13)
    expect(result.points).toBe(36)
    expect(result.played).toBe(18)
    expect(result.gross).toBe(72 + 13)
  })

  it('gilt auch auf einem Kurs mit anderem Par', () => {
    const par71: CourseCard = {
      par: 71,
      courseRating: 70.2,
      slopeRating: 121,
      holes: defaultHoles().map((h, i) => (i === 17 ? { ...h, par: 4 } : h)),
    }
    const index = 20
    const playing = playingHandicap(index, par71)
    const strokes: Record<number, number> = {}
    for (const hole of par71.holes) {
      strokes[hole.number] = hole.par + strokesOnHole(playing, hole.strokeIndex)
    }
    expect(scoreRound(par71, strokes, index).points).toBe(36)
  })

  it('zählt ein nicht eingetragenes Loch als null Punkte, die Runde bleibt gültig', () => {
    const index = 12.3
    const playing = playingHandicap(index, card)
    const strokes: Record<number, number | null> = {}
    for (const hole of card.holes) {
      strokes[hole.number] = hole.par + strokesOnHole(playing, hole.strokeIndex)
    }
    strokes[7] = null

    const result = scoreRound(card, strokes, index)
    expect(result.played).toBe(17)
    expect(result.holes[6].points).toBe(0)
    // Loch 7 ist ein Par 3 ohne erhaltenen Schlag bei 13: zwei Punkte weniger.
    expect(result.points).toBe(34)
  })

  it('lässt ein Katastrophenloch das Handicap nicht verzerren', () => {
    const index = 12.3
    const strokes: Record<number, number> = {}
    for (const hole of card.holes) strokes[hole.number] = hole.par + 1
    strokes[4] = 14 // Par 5, Totalschaden

    const result = scoreRound(card, strokes, index)
    // Brutto: 18 × (Par + 1) ist 90, und Loch 4 kostet statt 6 Schlägen 14.
    expect(result.gross).toBe(90 + 8)
    // Im korrigierten Brutto zählt Loch 4 nur als Netto-Doppelbogey: Par 5,
    // ein erhaltener Schlag, also höchstens 8 statt 14.
    expect(result.adjustedGross).toBe(90 - 6 + 8)
  })

  it('rechnet das Differential aus dem korrigierten Brutto', () => {
    // (113/128) × (85 − 71.4) = 0.8828 × 13.6 = 12.0
    expect(scoreDifferential(85, card)).toBe(12)
  })
})
