import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param } from '../_lib/http.js'
import { requireAdmin } from '../_lib/auth.js'

/**
 * Eine Woche verwalten: wer den Kurs bestimmt, und ob sie geschlossen ist.
 *
 * Das Datum einer einzelnen Woche wird nicht hier verschoben, sondern über die
 * Saison — sonst entstünden Lücken oder Überlappungen zwischen den Wochen.
 */
export default handler(['PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  await requireAdmin(req)
  const weekId = param(req, 'id')
  const input = body(req)

  const weeks = (await sql`SELECT id, season_id, number FROM weeks WHERE id = ${weekId}`) as any[]
  if (!weeks[0]) throw new HttpError(404, 'Diese Woche gibt es nicht.')
  const week = weeks[0]

  if (input.pickerId !== undefined) {
    const pickerId = input.pickerId === null ? null : String(input.pickerId)
    if (pickerId) {
      const member = (await sql`
        SELECT 1 FROM season_players
        WHERE season_id = ${week.season_id} AND user_id = ${pickerId} AND status = 'active'
      `) as any[]
      if (!member.length) throw new HttpError(400, 'Diese Person spielt in der Saison nicht mit.')
    }
    await sql`UPDATE weeks SET picker_id = ${pickerId} WHERE id = ${weekId}`
  }

  if (input.status !== undefined) {
    const status = String(input.status)
    if (!['upcoming', 'open', 'closed'].includes(status)) {
      throw new HttpError(400, 'Diesen Zustand gibt es für eine Woche nicht.')
    }
    await sql`UPDATE weeks SET status = ${status} WHERE id = ${weekId}`
  }

  json(res, 200, { ok: true })
})
