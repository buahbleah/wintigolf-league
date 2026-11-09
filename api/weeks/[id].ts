import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param } from '../_lib/http.js'
import { requireAdmin, requireUser } from '../_lib/auth.js'

/**
 * Eine Woche verwalten: wer den Kurs bestimmt, und ob sie geschlossen ist.
 *
 * Das Datum einer einzelnen Woche wird nicht hier verschoben, sondern über die
 * Saison — sonst entstünden Lücken oder Überlappungen zwischen den Wochen.
 */
export default handler(['GET', 'PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  const weekId = param(req, 'id')

  /* Loch für Loch, über alle eingereichten Karten dieser Woche: welches Loch
     die Liga gefressen hat und wo Punkte zu holen waren. */
  if (req.method === 'GET') {
    await requireUser(req)
    const holes = (await sql`
      SELECT ch.number, ch.par, ch.stroke_index,
             avg(rh.strokes)::numeric(5,2) AS avg_strokes,
             count(rh.strokes)::int AS entries,
             min(rh.strokes)::int AS best
      FROM weeks w
      JOIN course_holes ch ON ch.course_id = w.course_id
      LEFT JOIN rounds r ON r.week_id = w.id AND r.status IN ('submitted','confirmed')
      LEFT JOIN round_holes rh ON rh.round_id = r.id AND rh.number = ch.number
      WHERE w.id = ${weekId}
      GROUP BY ch.number, ch.par, ch.stroke_index
      ORDER BY ch.number
    `) as any[]

    json(res, 200, {
      holes: holes.map((h) => ({
        number: h.number,
        par: h.par,
        strokeIndex: h.stroke_index,
        entries: h.entries,
        best: h.best,
        averageStrokes: h.avg_strokes === null ? null : Number(h.avg_strokes),
        toPar: h.avg_strokes === null ? null : Math.round((Number(h.avg_strokes) - h.par) * 10) / 10,
      })),
    })
    return
  }

  await requireAdmin(req)
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
