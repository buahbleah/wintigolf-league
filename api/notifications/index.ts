import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, json } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'

/**
 * Das Benachrichtigungs-Center.
 *
 * GET  — die letzten Mitteilungen.
 * POST — als gelesen markieren, einzeln oder alle.
 *
 * Alte Mitteilungen werden beim Lesen aufgeräumt: nach vier Wochen interessiert
 * niemanden mehr, wer wann zugesagt hat.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)

  if (req.method === 'POST') {
    const id = body(req).id
    if (id) {
      await sql`
        UPDATE notifications SET read_at = now()
        WHERE id = ${String(id)} AND user_id = ${user.id} AND read_at IS NULL
      `
    } else {
      await sql`
        UPDATE notifications SET read_at = now()
        WHERE user_id = ${user.id} AND read_at IS NULL
      `
    }
    json(res, 200, { ok: true })
    return
  }

  await sql`
    DELETE FROM notifications
    WHERE user_id = ${user.id} AND read_at IS NOT NULL AND created_at < now() - interval '28 days'
  `

  const rows = (await sql`
    SELECT id, kind, title, body, link, read_at, created_at
    FROM notifications WHERE user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 60
  `) as any[]

  json(res, 200, {
    notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      read: row.read_at !== null,
      createdAt: row.created_at,
    })),
  })
})
