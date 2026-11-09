import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, requireString } from '../_lib/http.js'
import { createSession, hashPassword } from '../_lib/auth.js'

/** Neues Passwort setzen, mit dem Token aus der Mail. */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const input = body(req)
  const token = requireString(input.token, 'Der Link', 200)
  const passwordHash = await hashPassword(String(input.password ?? ''))

  const rows = (await sql`
    SELECT user_id FROM password_resets
    WHERE token = ${token} AND used_at IS NULL AND expires_at > now()
  `) as any[]
  if (!rows[0]) throw new HttpError(400, 'Dieser Link ist abgelaufen. Fordere einen neuen an.')

  await sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${rows[0].user_id}`
  await sql`UPDATE password_resets SET used_at = now() WHERE token = ${token}`
  // Alle offenen Sitzungen beenden: wer das Passwort zurücksetzt, will nicht,
  // dass irgendwo noch jemand angemeldet bleibt.
  await sql`DELETE FROM sessions WHERE user_id = ${rows[0].user_id}`

  await createSession(res, rows[0].user_id)
  json(res, 200, { ok: true })
})
