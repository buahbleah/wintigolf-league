import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, requireString } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, requireMember, settingsOf } from '../_lib/season.js'
import { courseCard, loadRound, roundPayload } from '../_lib/rounds.js'
import { playingHandicap } from '../../src/core/scoring.js'

/**
 * GET  /api/rounds?weekId=…  — alle Karten einer Woche.
 * POST /api/rounds           — die eigene Karte für eine Woche anfangen.
 *
 * Beim Anfangen wird das Handicap eingefroren: mit welchem Wert gespielt wurde,
 * steht ab diesem Moment in der Runde selbst. Eine spätere Anpassung — und nach
 * jeder Runde wird angepasst — rechnet diese Karte nie um.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') return list(req, res)
  return start(req, res)
})

async function list(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) {
    json(res, 200, { rounds: [] })
    return
  }
  await requireMember(season.id, user.id)

  const weekId = typeof req.query.weekId === 'string' ? req.query.weekId : null
  const rows = (await sql`
    SELECT r.id FROM rounds r
    WHERE r.season_id = ${season.id}
      AND (${weekId}::uuid IS NULL OR r.week_id = ${weekId}::uuid)
    ORDER BY r.created_at
  `) as any[]

  const rounds = []
  for (const row of rows) rounds.push(roundPayload(await loadRound(row.id)))

  json(res, 200, { rounds })
}

async function start(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
  await requireMember(season.id, user.id)
  const settings = settingsOf(season)

  const weekId = requireString(body(req).weekId, 'Die Woche', 40)
  const weeks = (await sql`
    SELECT id, number, kind, course_id, starts_at, ends_at, status FROM weeks
    WHERE id = ${weekId} AND season_id = ${season.id}
  `) as any[]
  if (!weeks[0]) throw new HttpError(404, 'Diese Woche gibt es nicht.')
  const week = weeks[0]

  /**
   * In einer Playoff-Woche gilt der Kurs des eigenen Matches, nicht der der
   * Woche: zwei Paarungen können auf verschiedenen Plätzen spielen.
   */
  if (week.kind === 'playoff') {
    const matches = (await sql`
      SELECT course_id FROM matches
      WHERE week_id = ${weekId} AND (home_id = ${user.id} OR away_id = ${user.id})
      LIMIT 1
    `) as any[]
    if (!matches[0]) throw new HttpError(403, 'In dieser Playoff-Runde spielst du nicht mit.')
    if (!matches[0].course_id) {
      throw new HttpError(400, 'Für dein Match steht der Kurs noch nicht fest.')
    }
    week.course_id = matches[0].course_id
  }

  if (!week.course_id) throw new HttpError(400, 'Für diese Woche steht der Kurs noch nicht fest.')

  const isAdmin = user.role === 'admin'
  const now = Date.now()
  if (!isAdmin) {
    if (now < new Date(week.starts_at).getTime()) {
      throw new HttpError(400, 'Diese Woche hat noch nicht angefangen.')
    }
    if (now > new Date(week.ends_at).getTime() || week.status === 'closed') {
      throw new HttpError(400, 'Diese Woche ist vorbei.')
    }
  }

  // Ein Versuch pro Woche: gibt es die Karte schon, kommt sie zurück.
  const existing = (await sql`
    SELECT id FROM rounds WHERE week_id = ${weekId} AND user_id = ${user.id}
  `) as any[]
  if (existing[0]) {
    json(res, 200, { round: roundPayload(await loadRound(existing[0].id)) })
    return
  }

  const player = (await sql`
    SELECT indoor_handicap, starting_handicap FROM season_players
    WHERE season_id = ${season.id} AND user_id = ${user.id}
  `) as any[]
  const index =
    player[0]?.indoor_handicap ?? player[0]?.starting_handicap ?? null
  if (index === null) {
    throw new HttpError(
      400,
      'Für dich ist noch kein Handicap hinterlegt. Trag im Profil dein Handicap draussen ein.',
    )
  }

  const card = await courseCard(week.course_id)
  const playing = playingHandicap(Number(index), card, settings.allowancePct)

  /**
   * Zweimal anfangen ist kein Fehler, sondern der Normalfall: zwei Tipper
   * hintereinander, zwei Geräte, ein Reiter, den jemand neu lädt. Darum legt
   * diese Anweisung die Karte an oder lässt sie stehen — und gibt in beiden
   * Fällen dieselbe zurück.
   */
  const created = (await sql`
    WITH neu AS (
      INSERT INTO rounds (season_id, week_id, user_id, course_id, handicap_index, playing_handicap,
                          status, played_at)
      VALUES (${season.id}, ${weekId}, ${user.id}, ${week.course_id}, ${Number(index)}, ${playing},
              'draft', now())
      ON CONFLICT (week_id, user_id) DO NOTHING
      RETURNING id
    )
    SELECT id FROM neu
    UNION ALL
    SELECT id FROM rounds WHERE week_id = ${weekId} AND user_id = ${user.id}
    LIMIT 1
  `) as any[]
  const roundId = created[0].id as string

  // Die achtzehn leeren Zeilen gleich mit anlegen, damit die Karte eine Form hat.
  await sql`
    INSERT INTO round_holes (round_id, number, strokes)
    SELECT ${roundId}, n, NULL FROM generate_series(1, ${card.holes.length}) AS n
    ON CONFLICT (round_id, number) DO NOTHING
  `

  json(res, 201, { round: roundPayload(await loadRound(roundId)) })
}
