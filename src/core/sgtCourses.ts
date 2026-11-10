/**
 * Die Kursliste des Simulator Golf Tour.
 *
 * Dort liegt genau das, was unsere Liga braucht und was keine Kursdatenbank
 * hergibt: die Plätze, die es in GSPro wirklich gibt — mit der Scorecard, auf
 * der auch der Stroke-Index steht. Die Seite trägt die ganze Liste als ein
 * JSON-Feld in sich; wir lesen es einmal am Tag und suchen danach bei uns.
 *
 * Hier steht nur das Lesen und das Suchen. Kein Netz, keine Datenbank — damit
 * sich beides prüfen lässt, ohne irgendwo anzuklopfen.
 */

export interface SgtCourse {
  id: number
  name: string
  location: string
  /** Par der ganzen Runde, wie es die Liste angibt. */
  par: number | null
  designer: string
  /** Wann der Kurs dort eingestellt wurde. */
  addedOn: string | null
}

export interface SgtList {
  /** Stand der Liste, wie die Seite ihn angibt. */
  updated: string | null
  /** Adressvorlage der Scorecard, mit {COURSEID} als Platzhalter. */
  cardUrl: string
  courses: SgtCourse[]
}

export const SGT_HOST = 'https://simulatorgolftour.com'

const FALLBACK_CARD = '/public/assets/courseImages/scorecards/scorecard_{COURSEID}.jpg'

/*
 * Eine Zeile der Liste ist ein Feld ohne Namen. Wir übernehmen nur die
 * Stellen, deren Bedeutung sich an den Daten selbst ablesen lässt — Zeile 2778
 * ist «GC Schloss Goldenberg», Par 70, aus Dorf, von The Hassle Line. Was wir
 * nicht sicher benennen können, lassen wir liegen, statt es zu raten.
 */
const ID = 0
const NAME = 1
const LOCATION = 2
const PAR = 3
const ADDED = 8
const DESIGNER = 9

export class SgtError extends Error {}

export function parseCourseList(html: string): SgtList {
  const block = /<script[^>]*id=['"]courses-data['"][^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!block) throw new SgtError('Die Kursliste war auf der Seite nicht zu finden.')

  let data: any
  try {
    data = JSON.parse(block[1])
  } catch {
    throw new SgtError('Die Kursliste war nicht lesbar.')
  }

  const rows = Array.isArray(data?.courses) ? data.courses : null
  if (!rows || rows.length === 0) throw new SgtError('Die Kursliste war leer.')

  const courses: SgtCourse[] = []
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    const id = row[ID]
    const name = row[NAME]
    if (!Number.isInteger(id) || typeof name !== 'string' || name.trim() === '') continue
    courses.push({
      id,
      name: name.trim(),
      location: typeof row[LOCATION] === 'string' ? row[LOCATION].trim() : '',
      par: Number.isFinite(row[PAR]) ? Math.round(row[PAR]) : null,
      designer: typeof row[DESIGNER] === 'string' ? row[DESIGNER].trim() : '',
      addedOn: typeof row[ADDED] === 'string' && row[ADDED] ? row[ADDED] : null,
    })
  }

  if (courses.length === 0) throw new SgtError('In der Kursliste stand kein einziger Kurs.')

  return {
    updated: typeof data.updated === 'string' ? data.updated : null,
    cardUrl: typeof data.cardUrl === 'string' && data.cardUrl ? data.cardUrl : FALLBACK_CARD,
    courses,
  }
}

/** Die Adresse der Scorecard eines Kurses. */
export function scorecardUrl(cardUrl: string, id: number): string {
  const path = cardUrl.replace('{COURSEID}', String(id))
  return /^https?:\/\//i.test(path) ? path : `${SGT_HOST}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Suchen, wie man einen Kurs sucht: ein Stichwort reicht, Gross- und
 * Kleinschreibung ist egal, Umlaute auch. «goldenberg» muss «GC Schloss
 * Goldenberg» finden, sonst nützt die Suche niemandem.
 *
 * Sortiert wird nach Nähe zum Gesuchten — Name vor Ort, Anfang vor Mitte —,
 * bei Gleichstand alphabetisch, damit dieselbe Suche immer dasselbe zeigt.
 */
export function rankCourses(courses: SgtCourse[], query: string, limit = 12): SgtCourse[] {
  const q = fold(query)
  if (q === '') return []
  const words = q.split(/\s+/).filter(Boolean)

  const scored: { course: SgtCourse; score: number }[] = []
  for (const course of courses) {
    const name = fold(course.name)
    const place = fold(course.location)
    let score: number

    if (name === q) score = 0
    else if (name.startsWith(q)) score = 1
    else if (name.includes(q)) score = 2
    else if (place.includes(q)) score = 3
    else if (words.length > 1 && words.every((w) => name.includes(w) || place.includes(w))) score = 4
    else continue

    scored.push({ course, score })
  }

  scored.sort((a, b) => a.score - b.score || a.course.name.localeCompare(b.course.name))
  return scored.slice(0, limit).map((hit) => hit.course)
}

/** Kleinschreibung ohne Akzente — «Münster» und «Munster» sollen sich finden. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
