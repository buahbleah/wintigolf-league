import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, json } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, settingsOf } from '../_lib/season.js'
import { courseCard } from '../_lib/rounds.js'
import { scoreRound } from '../../src/core/scoring.js'
import { powerRankings, standings, type PlayerInput } from '../../src/core/standings.js'

/**
 * Tabelle und Power Rankings.
 *
 * Gerechnet wird auf dem Server, damit alle dieselben Zahlen sehen — und aus den
 * Karten, nicht aus einer mitgeführten Summe. Es gibt keine zweite Wahrheit, die
 * nach einer Korrektur hinterherhinkt.
 */
export default handler(['GET'], async (req: VercelRequest, res: VercelResponse) => {
  await requireUser(req)
  const season = await currentSeason()
  if (!season) {
    json(res, 200, { season: null, table: [], power: [] })
    return
  }
  const settings = settingsOf(season)

  const players = (await sql`
    SELECT u.id, u.name, u.avatar_url, sp.indoor_handicap, sp.starting_handicap,
           sp.joined_week, sp.status
    FROM season_players sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.season_id = ${season.id}
    ORDER BY u.name
  `) as any[]

  const weeks = (await sql`
    SELECT id, number, ends_at, status, course_id FROM weeks
    WHERE season_id = ${season.id} AND kind = 'regular'
    ORDER BY number
  `) as any[]

  const now = Date.now()
  const closedWeeks = weeks
    .filter((w) => w.status === 'closed' || new Date(w.ends_at).getTime() < now)
    .map((w) => w.number)

  /* Alle Karten der Saison, einmal geholt und hier ausgewertet. Bei zwölf
     Spielern und zehn Wochen sind das keine hundertzwanzig Zeilen. */
  const rounds = (await sql`
    SELECT r.id, r.user_id, r.course_id, r.handicap_index, r.status, w.number AS week_number
    FROM rounds r
    JOIN weeks w ON w.id = r.week_id
    WHERE r.season_id = ${season.id} AND w.kind = 'regular' AND r.status IN ('submitted','confirmed')
    ORDER BY w.number
  `) as any[]

  const holeRows = (await sql`
    SELECT rh.round_id, rh.number, rh.strokes
    FROM round_holes rh
    JOIN rounds r ON r.id = rh.round_id
    WHERE r.season_id = ${season.id} AND r.status IN ('submitted','confirmed')
  `) as any[]

  const byRound = new Map<string, Record<number, number | null>>()
  for (const row of holeRows) {
    const existing = byRound.get(row.round_id) ?? {}
    existing[row.number] = row.strokes
    byRound.set(row.round_id, existing)
  }

  const cards = new Map<string, Awaited<ReturnType<typeof courseCard>>>()
  for (const courseId of new Set(rounds.map((r) => r.course_id))) {
    cards.set(courseId, await courseCard(courseId))
  }

  const input: PlayerInput[] = players.map((player) => ({
    userId: player.id,
    name: player.name,
    avatarUrl: player.avatar_url,
    indoorHandicap:
      player.indoor_handicap === null ? null : Number(player.indoor_handicap),
    joinedWeek: player.joined_week,
    status: player.status,
    results: rounds
      .filter((r) => r.user_id === player.id)
      .map((r) => {
        const card = cards.get(r.course_id)!
        const result = scoreRound(
          card,
          byRound.get(r.id) ?? {},
          Number(r.handicap_index),
          settings.allowancePct,
        )
        return {
          weekNumber: r.week_number,
          points: result.points,
          confirmed: r.status === 'confirmed',
        }
      }),
  }))

  json(res, 200, {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      weeks: settings.weeks,
      droppedWeeks: settings.droppedWeeks,
      countingWeeks: Math.max(1, settings.weeks - settings.droppedWeeks),
      closedWeeks,
      engine: settings.engine,
    },
    table: standings(input, {
      weeks: settings.weeks,
      droppedWeeks: settings.droppedWeeks,
      closedWeeks,
    }),
    power: powerRankings(input),
  })
})
