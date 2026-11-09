import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, requireString } from '../_lib/http.js'
import { currentUser, requireAdmin } from '../_lib/auth.js'
import { cleanSettings, currentSeason, settingsOf, uniqueJoinCode } from '../_lib/season.js'
import { buildWeeks, weekdayOf } from '../../src/core/dates.js'
import { withDefaults } from '../../src/core/settings.js'

/**
 * GET  — die laufende Saison mit allem, was die Liga-Ansicht braucht.
 * POST — eine neue Saison anlegen (nur Admin).
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') return show(req, res)
  return create(req, res)
})

async function show(req: VercelRequest, res: VercelResponse) {
  const user = await currentUser(req)
  const season = await currentSeason()
  if (!season) {
    json(res, 200, { season: null })
    return
  }

  const settings = settingsOf(season)

  const weeks = (await sql`
    SELECT w.id, w.number, w.kind, w.playoff_round, w.starts_at, w.ends_at, w.status,
           w.picker_id, p.name AS picker_name,
           w.course_id, c.name AS course_name, c.tee, c.par, c.course_rating, c.slope_rating,
           c.length_m, c.rating_source,
           (SELECT count(*)::int FROM rounds r WHERE r.week_id = w.id) AS submitted
    FROM weeks w
    LEFT JOIN users p ON p.id = w.picker_id
    LEFT JOIN courses c ON c.id = w.course_id
    WHERE w.season_id = ${season.id}
    ORDER BY w.number
  `) as any[]

  const players = (await sql`
    SELECT u.id, u.name, u.avatar_url, u.color_index, u.role,
           sp.indoor_handicap, sp.starting_handicap, sp.joined_week, sp.status
    FROM season_players sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.season_id = ${season.id}
    ORDER BY u.name
  `) as any[]

  json(res, 200, {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      joinCode: user?.role === 'admin' ? season.join_code : null,
      startedAt: season.started_at,
      pausedAt: season.paused_at,
      settings,
    },
    weeks: weeks.map((w) => ({
      id: w.id,
      number: w.number,
      kind: w.kind,
      playoffRound: w.playoff_round,
      startsAt: w.starts_at,
      endsAt: w.ends_at,
      status: w.status,
      submitted: w.submitted,
      picker: w.picker_id ? { id: w.picker_id, name: w.picker_name } : null,
      course: w.course_id
        ? {
            id: w.course_id,
            name: w.course_name,
            tee: w.tee,
            par: w.par,
            courseRating: Number(w.course_rating),
            slopeRating: w.slope_rating,
            lengthM: w.length_m,
            ratingSource: w.rating_source,
          }
        : null,
    })),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatar_url,
      colorIndex: p.color_index,
      role: p.role,
      indoorHandicap: p.indoor_handicap === null ? null : Number(p.indoor_handicap),
      startingHandicap: p.starting_handicap === null ? null : Number(p.starting_handicap),
      joinedWeek: p.joined_week,
      status: p.status,
    })),
  })
}

async function create(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req)
  const input = body(req)

  const running = await currentSeason()
  if (running) {
    throw new HttpError(409, 'Es läuft schon eine Saison. Schliess sie ab, bevor eine neue beginnt.')
  }

  const name = requireString(input.name, 'Der Name der Saison', 80)
  const startDate = requireString(input.startDate, 'Das Startdatum', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new HttpError(400, 'Das Startdatum ist kein Datum.')

  const overrides = cleanSettings(input.settings)
  const settings = withDefaults(overrides)

  if (weekdayOf(startDate) !== settings.weekStartsOn) {
    throw new HttpError(
      400,
      'Die Saison muss an einem Montag beginnen, sonst laufen die Wochen schief.',
    )
  }

  const code = await uniqueJoinCode()
  const created = (await sql`
    INSERT INTO seasons (name, join_code, status, settings)
    VALUES (${name}, ${code}, 'draft', ${JSON.stringify(overrides)}::jsonb)
    RETURNING id
  `) as any[]
  const seasonId = created[0].id as string

  const windows = buildWeeks({
    startDate,
    weeks: settings.weeks,
    deadlineHour: settings.deadlineHour,
  })
  // Alle Wochen in einer Anweisung statt in zehn Rundreisen.
  await sql`
    INSERT INTO weeks (season_id, number, starts_at, ends_at, status)
    SELECT ${seasonId}, n, s::timestamptz, e::timestamptz, 'upcoming'
    FROM unnest(
      ${windows.map((w) => w.number)}::int[],
      ${windows.map((w) => w.startsAt.toISOString())}::text[],
      ${windows.map((w) => w.endsAt.toISOString())}::text[]
    ) AS t(n, s, e)
  `

  /**
   * Wer in der letzten Saison dabei war, startet mit dem Indoor-Handicap, das
   * er sich dort erspielt hat — nicht wieder mit der halbierten Schätzung. Nach
   * zehn Runden weiss die Liga besser, wie jemand indoor spielt, als es jedes
   * Platzhandicap sagen könnte.
   */
  const previous = (await sql`
    SELECT sp.user_id, sp.indoor_handicap
    FROM season_players sp
    JOIN seasons s ON s.id = sp.season_id
    WHERE s.status IN ('finished','archived') AND sp.indoor_handicap IS NOT NULL
      AND sp.status = 'active'
    ORDER BY s.updated_at DESC
  `) as any[]

  const carried = new Map<string, number>()
  for (const row of previous) {
    if (!carried.has(row.user_id)) carried.set(row.user_id, Number(row.indoor_handicap))
  }

  if (carried.size) {
    const ids = [...carried.keys()]
    await sql`
      INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
      SELECT ${seasonId}, uid::uuid, hcp, hcp
      FROM unnest(${ids}::text[], ${ids.map((id) => carried.get(id)!)}::numeric[]) AS t(uid, hcp)
      ON CONFLICT (season_id, user_id) DO NOTHING
    `
  }

  // Der Admin spielt mit, sonst stünde er als Einziger nicht in der Tabelle.
  const starting =
    admin.outdoorHandicap === null
      ? null
      : Math.round(admin.outdoorHandicap * settings.startFactor * 10) / 10
  await sql`
    INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
    VALUES (${seasonId}, ${admin.id}, ${starting}, ${starting})
    ON CONFLICT (season_id, user_id) DO NOTHING
  `

  json(res, 201, { id: seasonId, joinCode: code })
}
