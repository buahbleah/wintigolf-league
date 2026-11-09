import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, HttpError, json, param } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, settingsOf } from '../_lib/season.js'
import { courseCard } from '../_lib/rounds.js'
import { scoreRound } from '../../src/core/scoring.js'

/**
 * Das Profil eines Mitspielers: Runden, Statistik, Handicap-Verlauf.
 *
 * Die Statistik wird aus den Karten gerechnet, nicht mitgezählt — Eagles und
 * Birdies ergeben sich aus Schlägen gegen Par, und wenn der Admin eine Karte
 * korrigiert, stimmt die Zahl sofort wieder.
 */
export default handler(['GET'], async (req: VercelRequest, res: VercelResponse) => {
  await requireUser(req)
  const playerId = param(req, 'id')

  const users = (await sql`
    SELECT id, name, avatar_url, outdoor_handicap, club_distances, role
    FROM users WHERE id = ${playerId}
  `) as any[]
  if (!users[0]) throw new HttpError(404, 'Diesen Spieler gibt es nicht.')
  const user = users[0]

  const season = await currentSeason()
  if (!season) {
    json(res, 200, { player: basics(user), season: null, rounds: [], stats: null, history: [] })
    return
  }
  const settings = settingsOf(season)

  const member = (await sql`
    SELECT starting_handicap, indoor_handicap, joined_week, status
    FROM season_players WHERE season_id = ${season.id} AND user_id = ${playerId}
  `) as any[]

  const roundRows = (await sql`
    SELECT r.id, r.course_id, r.handicap_index, r.playing_handicap, r.status, r.admin_note,
           r.confirmed_at, w.number AS week_number, c.name AS course_name, c.tee,
           m.name AS marker_name
    FROM rounds r
    JOIN weeks w ON w.id = r.week_id
    JOIN courses c ON c.id = r.course_id
    LEFT JOIN users m ON m.id = r.marker_id
    WHERE r.season_id = ${season.id} AND r.user_id = ${playerId}
      AND r.status IN ('submitted','confirmed')
    ORDER BY w.number
  `) as any[]

  const holeRows = (await sql`
    SELECT rh.round_id, rh.number, rh.strokes
    FROM round_holes rh
    JOIN rounds r ON r.id = rh.round_id
    WHERE r.season_id = ${season.id} AND r.user_id = ${playerId}
      AND r.status IN ('submitted','confirmed')
  `) as any[]

  const byRound = new Map<string, Record<number, number | null>>()
  for (const row of holeRows) {
    const existing = byRound.get(row.round_id) ?? {}
    existing[row.number] = row.strokes
    byRound.set(row.round_id, existing)
  }

  const cards = new Map<string, Awaited<ReturnType<typeof courseCard>>>()
  for (const courseId of new Set(roundRows.map((r) => r.course_id))) {
    cards.set(courseId, await courseCard(courseId))
  }

  let eagles = 0
  let birdies = 0
  let pars = 0
  let bogeys = 0
  let worse = 0
  let holesPlayed = 0

  const rounds = roundRows.map((row) => {
    const card = cards.get(row.course_id)!
    const result = scoreRound(
      card,
      byRound.get(row.id) ?? {},
      Number(row.handicap_index),
      settings.allowancePct,
    )
    for (const hole of result.holes) {
      if (hole.toPar === null) continue
      holesPlayed++
      if (hole.toPar <= -2) eagles++
      else if (hole.toPar === -1) birdies++
      else if (hole.toPar === 0) pars++
      else if (hole.toPar === 1) bogeys++
      else worse++
    }
    return {
      id: row.id,
      weekNumber: row.week_number,
      courseName: row.course_name,
      tee: row.tee,
      status: row.status,
      markerName: row.marker_name,
      adminNote: row.admin_note,
      handicapIndex: Number(row.handicap_index),
      playingHandicap: row.playing_handicap,
      points: result.points,
      gross: result.gross,
      toPar: result.toPar,
      played: result.played,
    }
  })

  const history = (await sql`
    SELECT before_value, after_value, differential, reason, engine, created_at
    FROM handicap_events
    WHERE season_id = ${season.id} AND user_id = ${playerId}
    ORDER BY created_at, ordinal
  `) as any[]

  const points = rounds.map((r) => r.points)

  json(res, 200, {
    player: basics(user),
    season: member[0]
      ? {
          startingHandicap:
            member[0].starting_handicap === null ? null : Number(member[0].starting_handicap),
          indoorHandicap:
            member[0].indoor_handicap === null ? null : Number(member[0].indoor_handicap),
          joinedWeek: member[0].joined_week,
          status: member[0].status,
        }
      : null,
    rounds,
    stats: {
      roundsPlayed: rounds.length,
      totalPoints: points.reduce((sum, p) => sum + p, 0),
      average: points.length
        ? Math.round((points.reduce((sum, p) => sum + p, 0) / points.length) * 10) / 10
        : 0,
      best: points.length ? Math.max(...points) : 0,
      worst: points.length ? Math.min(...points) : 0,
      eagles,
      birdies,
      pars,
      bogeys,
      worse,
      holesPlayed,
    },
    history: history.map((h) => ({
      before: h.before_value === null ? null : Number(h.before_value),
      after: Number(h.after_value),
      differential: h.differential === null ? null : Number(h.differential),
      reason: h.reason,
      engine: h.engine,
      createdAt: h.created_at,
    })),
  })
})

function basics(user: any) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    outdoorHandicap: user.outdoor_handicap === null ? null : Number(user.outdoor_handicap),
    clubDistances: user.club_distances ?? {},
    role: user.role,
  }
}
