import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, normaliseEmail } from '../_lib/http.js'
import { createSession, publicUser, sweepSessions, verifyPassword } from '../_lib/auth.js'

/**
 * Anmelden.
 *
 * Ein falsches Passwort und eine unbekannte Adresse geben dieselbe Antwort und
 * kosten dieselbe Zeit — sonst liesse sich über diese Adresse herausfinden, wer
 * ein Konto hat.
 */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const input = body(req)
  const email = normaliseEmail(input.email)
  const password = String(input.password ?? '')

  const rows = (await sql`
    SELECT id, email, name, role, outdoor_handicap, avatar_url, color_index, club_distances,
           password_hash
    FROM users WHERE lower(email) = ${email}
  `) as any[]
  const row = rows[0]

  // Auch ohne Treffer wird gerechnet, damit die Antwortzeit nichts verrät.
  const placeholder = 'scrypt$00$00'
  const ok = await verifyPassword(password, row?.password_hash ?? placeholder)
  if (!row || !ok) throw new HttpError(401, 'E-Mail oder Passwort stimmt nicht.')

  await createSession(res, row.id)
  await sweepSessions()

  json(res, 200, { user: publicUser(row) })
})
