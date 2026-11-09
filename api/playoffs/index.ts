import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, json } from '../_lib/http.js'
import { currentUser, requireAdmin } from '../_lib/auth.js'
import { currentSeason, seasonById, settingsOf } from '../_lib/season.js'
import { advanceBracket, bracketState, startPlayoffs } from '../_lib/playoffs.js'
import { courseCard } from '../_lib/rounds.js'
import { scoreRound } from '../../src/core/scoring.js'
import { standings, type PlayerInput } from '../../src/core/standings.js'

/**
 * GET  — das Bracket, plus wer Grundsaison-Sieger und wer Champion ist.
 * POST — die Playoffs starten (nur Admin).
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const season = (await currentSeason()) ?? (await latestFinished())
  if (!season) {
    json(res, 200, { season: null, matches: [] })
    return
  }

  if (req.method === 'POST') {
    await requireAdmin(req)
    const fresh = await seasonById(season.id)
    const table = await seasonTable(fresh)
    const started = await startPlayoffs(fresh, table)
    await advanceBracket(await seasonById(season.id))
    json(res, 201, started)
    return
  }

  await currentUser(req)
  const matches = await bracketState(season)
  const table = await seasonTable(season)
  const final = matches.find((m) => m.roundName === 'final')

  json(res, 200, {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      playoffSize: settingsOf(season).playoffSize,
      thirdPlace: settingsOf(season).thirdPlace,
    },
    matches,
    /** Erster der Grundsaison — eine eigene Ehre, unabhängig vom Playoff. */
    seasonWinner: table[0]
      ? { userId: table[0].userId, name: table[0].name, total: table[0].total }
      : null,
    champion:
      final?.winnerId
        ? {
            userId: final.winnerId,
            name: final.winnerId === final.home?.id ? final.home?.name : final.away?.name,
            result: final.result,
          }
        : null,
  })
})

async function latestFinished() {
  const rows = (await sql`
    SELECT id, name, status, join_code, settings, started_at, paused_at
    FROM seasons WHERE status IN ('finished','archived')
    ORDER BY updated_at DESC LIMIT 1
  `) as any[]
  return rows[0] ?? null
}

/** Dieselbe Tabelle wie unter /api/standings — hier gebraucht fürs Seeding. */
async function seasonTable(season: any) {
  const settings = settingsOf(season)

  const players = (await sql`
    SELECT u.id, u.name, u.avatar_url, sp.indoor_handicap, sp.joined_week, sp.status
    FROM season_players sp JOIN users u ON u.id = sp.user_id
    WHERE sp.season_id = ${season.id}
  `) as any[]

  const weeks = (await sql`
    SELECT number, ends_at, status FROM weeks
    WHERE season_id = ${season.id} AND kind = 'regular'
  `) as any[]
  const now = Date.now()
  const closedWeeks = weeks
    .filter((w) => w.status === 'closed' || new Date(w.ends_at).getTime() < now)
    .map((w) => w.number)

  const rounds = (await sql`
    SELECT r.id, r.user_id, r.course_id, r.handicap_index, r.status, w.number AS week_number
    FROM rounds r JOIN weeks w ON w.id = r.week_id
    WHERE r.season_id = ${season.id} AND w.kind = 'regular'
      AND r.status IN ('submitted','confirmed')
  `) as any[]

  const holes = (await sql`
    SELECT rh.round_id, rh.number, rh.strokes FROM round_holes rh
    JOIN rounds r ON r.id = rh.round_id
    WHERE r.season_id = ${season.id} AND r.status IN ('submitted','confirmed')
  `) as any[]

  const byRound = new Map<string, Record<number, number | null>>()
  for (const row of holes) {
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
    indoorHandicap: player.indoor_handicap === null ? null : Number(player.indoor_handicap),
    joinedWeek: player.joined_week,
    status: player.status,
    results: rounds
      .filter((r) => r.user_id === player.id)
      .map((r) => ({
        weekNumber: r.week_number,
        points: scoreRound(
          cards.get(r.course_id)!,
          byRound.get(r.id) ?? {},
          Number(r.handicap_index),
          settings.allowancePct,
        ).points,
        confirmed: r.status === 'confirmed',
      })),
  }))

  return standings(input, {
    weeks: settings.weeks,
    droppedWeeks: settings.droppedWeeks,
    closedWeeks,
  }).filter((row) => row.status === 'active' && row.played > 0)
}

export { seasonTable }

