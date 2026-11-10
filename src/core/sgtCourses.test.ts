import { describe, expect, it } from 'vitest'
import { parseCourseList, rankCourses, scorecardUrl, SgtError, type SgtCourse } from './sgtCourses'

/* Die Zeilen sind so aufgebaut, wie die Seite sie wirklich ausliefert. */
function page(rows: unknown[], extra: Record<string, unknown> = {}): string {
  const data = {
    v: 1,
    updated: '2026-11-10T02:30:05-07:00',
    cardUrl: '/public/assets/courseImages/scorecards/scorecard_{COURSEID}.jpg?v=1.1',
    courses: rows,
    ...extra,
  }
  return `<html><body><script id='courses-data' type='application/json'>${JSON.stringify(data)}</script></body></html>`
}

const GOLDENBERG = [
  2778, 'GC Schloss Goldenberg', 'Dorf, Zurich, Switzerland', 70, 5.3, 384, 1, '',
  '2025-11-11', 'The Hassle Line', 1, 47.5761, 8.65505,
]
const WELS = [
  1778, 'GC Wels', 'Wels, Upper Austria, Austria', 72, 4.2, 256, 0, '',
  '2024-05-25', 'schurlette', 0, 48.1372, 14.0245,
]

describe('Die Kursliste lesen', () => {
  it('holt Kurse samt Ort, Par und Erbauer heraus', () => {
    const list = parseCourseList(page([GOLDENBERG, WELS]))
    expect(list.courses).toHaveLength(2)
    expect(list.courses[0]).toEqual({
      id: 2778,
      name: 'GC Schloss Goldenberg',
      location: 'Dorf, Zurich, Switzerland',
      par: 70,
      designer: 'The Hassle Line',
      addedOn: '2025-11-11',
    })
    expect(list.updated).toBe('2026-11-10T02:30:05-07:00')
  })

  it('merkt es, wenn die Seite anders aussieht als erwartet', () => {
    expect(() => parseCourseList('<html><body>Wartungsarbeiten</body></html>')).toThrow(SgtError)
    expect(() => parseCourseList(page([]))).toThrow(/leer/)
  })

  it('überspringt Zeilen ohne Nummer oder Namen, statt aufzugeben', () => {
    const list = parseCourseList(page([['x', 'Kaputt'], [999], GOLDENBERG]))
    expect(list.courses.map((c) => c.id)).toEqual([2778])
  })

  it('kommt ohne Adressvorlage aus', () => {
    const list = parseCourseList(page([GOLDENBERG], { cardUrl: undefined }))
    expect(scorecardUrl(list.cardUrl, 2778)).toBe(
      'https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_2778.jpg',
    )
  })
})

describe('Die Adresse der Scorecard', () => {
  it('setzt die Kursnummer ein und ergänzt den Host', () => {
    const list = parseCourseList(page([GOLDENBERG]))
    expect(scorecardUrl(list.cardUrl, 2778)).toBe(
      'https://simulatorgolftour.com/public/assets/courseImages/scorecards/scorecard_2778.jpg?v=1.1',
    )
  })

  it('lässt eine vollständige Adresse stehen', () => {
    expect(scorecardUrl('https://cdn.example.com/card_{COURSEID}.jpg', 7)).toBe(
      'https://cdn.example.com/card_7.jpg',
    )
  })
})

describe('Kurse suchen', () => {
  const courses: SgtCourse[] = [
    { id: 1, name: 'GC Schloss Goldenberg', location: 'Dorf, Zurich, Switzerland', par: 70, designer: '', addedOn: null },
    { id: 2, name: 'Goldenberg Pitch', location: 'Nowhere', par: 54, designer: '', addedOn: null },
    { id: 3, name: 'Winterthur Links', location: 'Winterthur, Switzerland', par: 72, designer: '', addedOn: null },
    { id: 4, name: 'Münsterland', location: 'Münster, Germany', par: 71, designer: '', addedOn: null },
  ]

  /* Niemand tippt «GC Schloss Goldenberg» — er tippt «goldenberg». */
  it('findet einen Kurs über ein Wort mitten im Namen', () => {
    expect(rankCourses(courses, 'goldenberg').map((c) => c.id)).toEqual([2, 1])
  })

  it('stellt den Namenstreffer vor den Ortstreffer', () => {
    expect(rankCourses(courses, 'winterthur').map((c) => c.id)).toEqual([3])
  })

  it('findet über den Ort, wenn der Name nichts hergibt', () => {
    expect(rankCourses(courses, 'switzerland').map((c) => c.id)).toEqual([1, 3])
  })

  it('ist Umlauten gegenüber nachsichtig', () => {
    expect(rankCourses(courses, 'munster').map((c) => c.id)).toEqual([4])
    expect(rankCourses(courses, 'MÜNSTER').map((c) => c.id)).toEqual([4])
  })

  it('findet auch, wenn die Wörter verteilt stehen', () => {
    expect(rankCourses(courses, 'goldenberg dorf').map((c) => c.id)).toEqual([1])
  })

  it('gibt bei leerer Suche nichts zurück, statt alles', () => {
    expect(rankCourses(courses, '   ')).toEqual([])
  })

  it('hält sich an die Obergrenze', () => {
    expect(rankCourses(courses, 'e', 2)).toHaveLength(2)
  })
})
