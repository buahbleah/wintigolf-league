import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { requireAdmin } from '../_lib/auth.js'
import { currentSeason } from '../_lib/season.js'
import { recomputeHandicap } from '../_lib/handicap.js'

/**
 * Alle Handicaps neu rechnen.
 *
 * Braucht man selten, aber dann sofort: nachdem am Verfahren oder an einer
 * Stellschraube gedreht wurde, oder nachdem mehrere Karten korrigiert worden
 * sind. Da der Motor ohnehin immer die ganze Geschichte durchrechnet, ist das
 * hier nur der Knopf dafür — und zweimal gedrückt ändert er nichts.
 *
 * Gespielte Runden bleiben unberührt: jede hält ihr eigenes Handicap fest.
 */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  await requireAdmin(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')

  const players = (await sql`
    SELECT user_id FROM season_players WHERE season_id = ${season.id}
  `) as any[]

  const changed: { userId: string; before: number | null; after: number | null }[] = []
  for (const player of players) {
    const moved = await recomputeHandicap(season, player.user_id)
    if (moved.before !== moved.after) changed.push({ userId: player.user_id, ...moved })
  }

  json(res, 200, { players: players.length, changed })
})
