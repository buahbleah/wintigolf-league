import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handler, json } from '../_lib/http.js'
import { currentUser } from '../_lib/auth.js'
import { sql } from '../_lib/db.js'

/**
 * Wer bin ich, und was läuft gerade.
 *
 * Die App fragt das beim Start einmal: daraus ergibt sich, ob der Login-Screen
 * oder die Liga erscheint, ob es überhaupt schon eine Saison gibt und ob noch
 * eine Karte auf eine Bestätigung wartet.
 */
export default handler(['GET'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await currentUser(req)
  if (!user) {
    const any = (await sql`SELECT count(*)::int AS n FROM users`) as any[]
    json(res, 200, { user: null, needsFirstAccount: any[0].n === 0 })
    return
  }

  const seasons = (await sql`
    SELECT s.id, s.name, s.status, s.join_code, sp.indoor_handicap, sp.joined_week
    FROM seasons s
    JOIN season_players sp ON sp.season_id = s.id AND sp.user_id = ${user.id}
    WHERE s.status IN ('draft','active','playoffs')
    ORDER BY s.created_at DESC
    LIMIT 1
  `) as any[]

  const waiting = (await sql`
    SELECT count(*)::int AS n FROM rounds
    WHERE marker_id = ${user.id} AND status = 'submitted'
  `) as any[]

  const unread = (await sql`
    SELECT count(*)::int AS n FROM notifications
    WHERE user_id = ${user.id} AND read_at IS NULL
  `) as any[]

  json(res, 200, {
    user,
    season: seasons[0]
      ? {
          id: seasons[0].id,
          name: seasons[0].name,
          status: seasons[0].status,
          joinCode: user.role === 'admin' ? seasons[0].join_code : null,
          indoorHandicap:
            seasons[0].indoor_handicap === null ? null : Number(seasons[0].indoor_handicap),
          joinedWeek: seasons[0].joined_week,
        }
      : null,
    awaitingConfirmation: waiting[0].n,
    unreadNotifications: unread[0].n,
  })
})
