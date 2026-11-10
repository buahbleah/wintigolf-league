import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { imageFromWeb, readScorecard, type ReadCard } from '../_lib/readScorecard.js'
import {
  parseCourseList,
  rankCourses,
  scorecardUrl,
  SGT_HOST,
  SgtError,
  type SgtCourse,
  type SgtList,
} from '../../src/core/sgtCourses.js'

/**
 * Die GSPro-Kurse des Simulator Golf Tour.
 *
 *   GET /api/courses/sgt?q=goldenberg   suchen
 *   GET /api/courses/sgt?id=2778        Kurs samt ausgelesener Scorecard
 *
 * Dort steht, was keine Kursdatenbank hergibt: die Plätze, die es in GSPro
 * wirklich gibt — und zu jedem die Scorecard mit der Spalte INDEX. Die Liste
 * holen wir einmal am Tag, die Karte einmal pro Kurs. Beides liegt danach bei
 * uns: die Liga fragt nicht bei jedem Tastendruck bei einem fremden Server an,
 * und zweimal denselben Kurs auszulesen kostet nichts mehr.
 */

const LIST_KEY = 'sgt:list'
const LIST_TTL_DAYS = 1
const CARD_TTL_DAYS = 365

export default handler(['GET'], async (req: VercelRequest, res: VercelResponse) => {
  await requireUser(req)

  const id = typeof req.query.id === 'string' ? Number(req.query.id) : NaN
  if (Number.isInteger(id) && id > 0) {
    const list = await courseList()
    const course = list.courses.find((entry) => entry.id === id)
    if (!course) throw new HttpError(404, 'Diesen Kurs gibt es in der GSPro-Liste nicht.')
    json(res, 200, { course, card: await card(course, list) })
    return
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 3) throw new HttpError(400, 'Such mit mindestens drei Buchstaben.')

  const list = await courseList()
  json(res, 200, { results: rankCourses(list.courses, q), updated: list.updated })
})

/** Die Kursliste, höchstens einen Tag alt. */
async function courseList(): Promise<SgtList> {
  const cached = (await sql`
    SELECT payload FROM course_api_cache
    WHERE key = ${LIST_KEY} AND fetched_at > now() - make_interval(days => ${LIST_TTL_DAYS})
  `) as any[]
  if (cached[0]) return cached[0].payload as SgtList

  let html: string
  try {
    const response = await fetch(`${SGT_HOST}/courses`, {
      headers: { 'User-Agent': 'WintigolfLeague/1.0' },
    })
    if (!response.ok) throw new Error(String(response.status))
    html = await response.text()
  } catch {
    // Lieber eine alte Liste als gar keine: ein Kurs von gestern ist immer noch
    // derselbe Kurs.
    const stale = (await sql`SELECT payload FROM course_api_cache WHERE key = ${LIST_KEY}`) as any[]
    if (stale[0]) return stale[0].payload as SgtList
    throw new HttpError(502, 'Die Kursliste war gerade nicht erreichbar.')
  }

  let list: SgtList
  try {
    list = parseCourseList(html)
  } catch (err) {
    if (err instanceof SgtError) {
      const stale = (await sql`SELECT payload FROM course_api_cache WHERE key = ${LIST_KEY}`) as any[]
      if (stale[0]) return stale[0].payload as SgtList
      throw new HttpError(502, err.message)
    }
    throw err
  }

  await sql`
    INSERT INTO course_api_cache (key, payload, fetched_at)
    VALUES (${LIST_KEY}, ${JSON.stringify(list)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
  `
  return list
}

/**
 * Die Scorecard eines Kurses, ausgelesen und geprüft.
 *
 * Gespeichert wird das Ergebnis, nicht das Bild: eine Karte ändert sich nicht
 * mehr, und wer in Woche sieben denselben Kurs wählt, wartet keine zehn
 * Sekunden und kostet nichts.
 */
async function card(course: SgtCourse, list: SgtList): Promise<ReadCard> {
  const key = `sgt:card:${course.id}`
  const cached = (await sql`
    SELECT payload FROM course_api_cache
    WHERE key = ${key} AND fetched_at > now() - make_interval(days => ${CARD_TTL_DAYS})
  `) as any[]
  if (cached[0]) return cached[0].payload as ReadCard

  const read = await readScorecard(await imageFromWeb(scorecardUrl(list.cardUrl, course.id)))

  await sql`
    INSERT INTO course_api_cache (key, payload, fetched_at)
    VALUES (${key}, ${JSON.stringify(read)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
  `
  return read
}
