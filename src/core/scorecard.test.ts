import { describe, expect, it } from 'vitest'
import { ScorecardError, toMetres, validateScorecard } from './scorecard'
import { defaultHoles } from './externalCourse'

/** Eine saubere Karte, wie sie aus einem gut gelesenen Bild käme. */
function card(): any[] {
  return defaultHoles().map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    length: 350,
  }))
}

describe('Eine ausgelesene Scorecard', () => {
  it('nimmt eine vollständige Karte an', () => {
    const clean = validateScorecard(card())
    expect(clean).toHaveLength(18)
    expect(clean[0].number).toBe(1)
    expect(new Set(clean.map((h) => h.strokeIndex)).size).toBe(18)
  })

  it('sortiert die Löcher, auch wenn sie durcheinander kommen', () => {
    const shuffled = [...card()].reverse()
    expect(validateScorecard(shuffled).map((h) => h.number)).toEqual(
      [...Array(18)].map((_, i) => i + 1),
    )
  })

  it('weist eine Karte ab, auf der nicht achtzehn Löcher stehen', () => {
    expect(() => validateScorecard(card().slice(0, 17))).toThrow(ScorecardError)
    expect(() => validateScorecard([])).toThrow(/achtzehn/)
  })

  /** Der Fehler, der sonst erst in Woche sieben auffällt. */
  it('weist einen doppelten Stroke-Index ab, statt ihn durchzulassen', () => {
    const broken = card()
    broken[5].strokeIndex = broken[4].strokeIndex
    expect(() => validateScorecard(broken)).toThrow(/zweimal/)
  })

  it('weist ein unlesbares Par ab', () => {
    const broken = card()
    broken[3].par = 9
    expect(() => validateScorecard(broken)).toThrow(/Par 9/)
  })

  it('weist einen Stroke-Index ausserhalb von 1 bis 18 ab', () => {
    const broken = card()
    broken[2].strokeIndex = 23
    expect(() => validateScorecard(broken)).toThrow(/Stroke-Index/)
  })

  it('weist eine doppelte Lochnummer ab', () => {
    const broken = card()
    broken[7].number = broken[6].number
    expect(() => validateScorecard(broken)).toThrow(/zweimal/)
  })

  it('lässt eine fehlende Länge zu — die braucht es nicht', () => {
    const ohne = card().map((h) => ({ ...h, length: undefined }))
    expect(validateScorecard(ohne)[0].length).toBeNull()
  })
})

describe('Einheiten', () => {
  it('rechnet Yards in Meter', () => {
    // Goldenberg, Tee White: 6194 Yards sind 5664 Meter.
    expect(toMetres(6194, 'yards')).toBe(5664)
  })

  it('lässt Meter stehen', () => {
    expect(toMetres(5800, 'metres')).toBe(5800)
  })

  it('kommt mit fehlenden Werten zurecht', () => {
    expect(toMetres(null, 'yards')).toBeNull()
    expect(toMetres(undefined, 'metres')).toBeNull()
  })
})
