import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { toExternalCourse, toSearchHits } from '../../src/core/externalCourse.js'

/**
 * Kurssuche, weitergereicht an die GolfCourseAPI.
 *
 *   GET /api/courses/lookup?q=winterthur   suchen
 *   GET /api/courses/lookup?id=4711        ein Kurs mit allen Tees und der Karte
 *
 * Zwei Gründe, warum das nicht direkt aus dem Browser geht: der Schlüssel läge
 * im Bundle, und das Gratiskontingent sind ein paar Dutzend Abfragen pro Tag —
 * für die ganze App zusammen. Darum liegt jede Antwort in Postgres, wird von
 * dort beantwortet, und die Zahl der Aufrufe, die wirklich hinausgehen, ist
 * gezählt und gedeckelt.
 *
 * Gespeichert wird die rohe Antwort, nicht das Ergebnis der Auswertung — so muss
 * der Cache nie geleert werden, wenn sich die Auswertung ändert.
 */

const API = 'https://api.golfcourseapi.com/v1'
const DAILY_BUDGET = Number(process.env.GOLF_COURSE_API_DAILY_BUDGET ?? 40)
const SEARCH_TTL_DAYS = 30
const COURSE_TTL_DAYS = 365

export default handler(['GET'], async (req: VercelRequest, res: VercelResponse) => {
  await requireUser(req)

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : ''

  if (id) {
    const payload = await fetchCached(`course:${id}`, COURSE_TTL_DAYS, `/courses/${encodeURIComponent(id)}`)
    const course = toExternalCourse(payload)
    if (!course) throw new HttpError(404, 'Diesen Kurs gibt es dort nicht.')
    json(res, 200, { course })
    return
  }

  if (q.length < 3) throw new HttpError(400, 'Such mit mindestens drei Buchstaben.')
  const payload = await fetchCached(
    `search:${q.toLowerCase()}`,
    SEARCH_TTL_DAYS,
    `/search?search_query=${encodeURIComponent(q)}`,
  )
  json(res, 200, { results: toSearchHits(payload) })
})

async function fetchCached(key: string, ttlDays: number, path: string): Promise<any> {
  const cached = (await sql`
    SELECT payload FROM course_api_cache
    WHERE key = ${key} AND fetched_at > now() - make_interval(days => ${ttlDays})
  `) as any[]
  if (cached[0]) return cached[0].payload

  const payload = await fromApi(path)
  await sql`
    INSERT INTO course_api_cache (key, payload, fetched_at)
    VALUES (${key}, ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
  `
  return payload
}

/**
 * Holt einen Aufruf aus dem Tagesbudget. Erhöhen und Prüfen stecken in derselben
 * Anweisung, damit nicht zwei gleichzeitige Anfragen beide den letzten Aufruf
 * zugesprochen bekommen.
 */
async function claimCall(): Promise<boolean> {
  const rows = (await sql`
    INSERT INTO course_api_budget (day, calls) VALUES (current_date, 1)
    ON CONFLICT (day) DO UPDATE
      SET calls = course_api_budget.calls + 1
      WHERE course_api_budget.calls < ${DAILY_BUDGET}
    RETURNING calls
  `) as any[]
  return rows.length > 0
}

async function fromApi(path: string): Promise<any> {
  const apiKey = process.env.GOLF_COURSE_API_KEY
  if (!apiKey) {
    throw new HttpError(
      503,
      'Die Kurssuche ist hier nicht eingerichtet. Trag Rating und Slope aus GSPro von Hand ein.',
    )
  }
  if (!(await claimCall())) {
    throw new HttpError(
      429,
      'Die Kursabfragen für heute sind aufgebraucht. Schon einmal gesuchte Kurse gehen weiterhin, und von Hand eintragen geht immer.',
    )
  }

  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Key ${apiKey}` } })
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(503, 'Der Schlüssel für die Kurssuche wird nicht akzeptiert.')
  }
  if (response.status === 404) throw new HttpError(404, 'Dort ist dieser Kurs nicht verzeichnet.')
  if (!response.ok) throw new HttpError(502, 'Die Kursdatenbank antwortet gerade nicht.')

  return response.json()
}
