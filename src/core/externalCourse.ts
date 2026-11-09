/**
 * Was die GolfCourseAPI liefert, in das, was die Kurs-Eingabe braucht.
 *
 * Reine Funktionen, kein fetch in Sicht — so lässt sich das gegen gespeicherte
 * Antworten testen statt gegen ein Tageskontingent.
 *
 * GSPro-Kurse sind fast immer Nachbauten echter Plätze. Wer in der Liga einen
 * Kurs einträgt, sucht ihn hier, bekommt Par und Stroke-Index für alle Löcher
 * vorausgefüllt und korrigiert nur noch, was GSPro anders anzeigt. Die Werte aus
 * GSPro gewinnen immer: diese Datei füllt nur vor.
 */

export const YARDS_TO_METRES = 0.9144

export interface ExternalTee {
  /** Stabil innerhalb einer Antwort — 'male:0', 'female:2'. */
  id: string
  name: string
  gender: 'male' | 'female'
  courseRating: number | null
  slopeRating: number | null
  parTotal: number | null
  lengthM: number | null
  holes: { number: number; par: number; strokeIndex: number; lengthM: number | null }[]
}

export interface ExternalCourse {
  id: string
  name: string
  location: string | null
  tees: ExternalTee[]
}

export interface SearchHit {
  id: string
  name: string
  location: string | null
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function locationLabel(location: any): string | null {
  if (!location || typeof location !== 'object') return null
  const parts = [text(location.city), text(location.state), text(location.country)].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Viele Clubs tragen den Kurs unter dem eigenen Namen nochmals ein. */
export function courseLabel(club: string, course: string): string {
  const a = text(club)
  const b = text(course)
  if (!b || a.toLowerCase() === b.toLowerCase()) return a || b || 'Unbenannt'
  if (!a) return b
  return `${a} · ${b}`
}

export function toSearchHits(payload: any): SearchHit[] {
  const list = Array.isArray(payload?.courses) ? payload.courses : []
  return list
    .map((c: any) => ({
      id: String(c?.id ?? ''),
      name: courseLabel(c?.club_name, c?.course_name),
      location: locationLabel(c?.location),
    }))
    .filter((c: SearchHit) => c.id)
}

/**
 * Stroke-Indizes entscheiden, wo Schläge vergeben werden — sie zählen mehr als
 * Par. Brauchbar ist eine Reihe nur, wenn jeder Wert vorhanden ist und keiner
 * doppelt vorkommt; sonst wird lieber nichts vorausgefüllt, als etwas Falsches.
 */
function strokeIndexesFrom(holes: any[]): number[] | null {
  const raw = holes.map((h) => Number(h?.handicap))
  if (raw.some((v) => !Number.isInteger(v) || v < 1 || v > holes.length)) return null
  if (new Set(raw).size !== holes.length) return null
  return raw
}

export function toExternalCourse(payload: any): ExternalCourse | null {
  const course = payload?.course ?? payload
  const id = String(course?.id ?? '')
  if (!id) return null

  const tees: ExternalTee[] = []
  for (const [gender, list] of [
    ['male', course?.tees?.male],
    ['female', course?.tees?.female],
  ] as const) {
    if (!Array.isArray(list)) continue
    list.forEach((t: any, i: number) => {
      const apiHoles = Array.isArray(t?.holes) ? t.holes : []
      const indexes = strokeIndexesFrom(apiHoles)
      const yards = num(t?.total_yards)
      tees.push({
        id: `${gender}:${i}`,
        name: text(t?.tee_name) || `Tee ${i + 1}`,
        gender,
        courseRating: num(t?.course_rating),
        slopeRating: num(t?.slope_rating),
        parTotal: num(t?.par_total),
        lengthM: yards === null ? null : Math.round(yards * YARDS_TO_METRES),
        holes:
          apiHoles.length === 18 && indexes
            ? apiHoles.map((h: any, n: number) => {
                const holeYards = num(h?.yardage)
                return {
                  number: n + 1,
                  par: num(h?.par) ?? 4,
                  strokeIndex: indexes[n],
                  lengthM: holeYards === null ? null : Math.round(holeYards * YARDS_TO_METRES),
                }
              })
            : [],
      })
    })
  }

  return {
    id,
    name: courseLabel(course?.club_name, course?.course_name),
    location: locationLabel(course?.location),
    tees,
  }
}

/** Die Standardkarte: Par 72, Stroke-Index abwechselnd über beide Neunen. */
export function defaultHoles(): { number: number; par: number; strokeIndex: number }[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
  const indexes = [5, 11, 17, 1, 7, 13, 15, 3, 9, 6, 12, 18, 2, 8, 14, 16, 4, 10]
  return pars.map((par, i) => ({ number: i + 1, par, strokeIndex: indexes[i] }))
}
