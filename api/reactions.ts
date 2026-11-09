import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { body, handler, HttpError, json, requireString } from './_lib/http.js'
import { requireUser } from './_lib/auth.js'

/**
 * Eine Reaktion an- oder abschalten.
 *
 * Nur eine Handvoll Emoji, und bewusst keine freie Auswahl: eine Liste, auf die
 * sich alle verlassen können, liest sich schneller als eine, in der jeder sein
 * eigenes Zeichen erfindet.
 */
const ALLOWED = ['👏', '😂', '🔥', '😱', '🫡', '⛳']

export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const input = body(req)
  const targetType = requireString(input.targetType, 'Das Ziel', 10)
  const targetId = requireString(input.targetId, 'Das Ziel', 40)
  const emoji = requireString(input.emoji, 'Das Emoji', 8)

  if (targetType !== 'post' && targetType !== 'round') {
    throw new HttpError(400, 'Darauf kann man nicht reagieren.')
  }
  if (!ALLOWED.includes(emoji)) throw new HttpError(400, 'Dieses Zeichen gibt es hier nicht.')

  const existing = (await sql`
    SELECT 1 FROM reactions
    WHERE target_type = ${targetType} AND target_id = ${targetId}
      AND user_id = ${user.id} AND emoji = ${emoji}
  `) as any[]

  if (existing.length) {
    await sql`
      DELETE FROM reactions
      WHERE target_type = ${targetType} AND target_id = ${targetId}
        AND user_id = ${user.id} AND emoji = ${emoji}
    `
    json(res, 200, { on: false })
    return
  }

  await sql`
    INSERT INTO reactions (target_type, target_id, user_id, emoji)
    VALUES (${targetType}, ${targetId}, ${user.id}, ${emoji})
  `
  json(res, 201, { on: true })
})

export { ALLOWED as REACTIONS }
