import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, json, normaliseEmail } from '../_lib/http.js'
import { appUrl, sendMail } from '../_lib/mail.js'

/**
 * Passwort zurücksetzen anfordern.
 *
 * Die Antwort ist immer dieselbe, ob es das Konto gibt oder nicht — sonst wäre
 * das hier eine Auskunftsstelle darüber, wer in der Liga ist.
 */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const email = normaliseEmail(body(req).email)

  const rows = (await sql`SELECT id, name FROM users WHERE lower(email) = ${email}`) as any[]
  if (rows[0]) {
    const token = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + 2 * 3600_000) // zwei Stunden
    await sql`
      INSERT INTO password_resets (token, user_id, expires_at)
      VALUES (${token}, ${rows[0].id}, ${expires.toISOString()})
    `
    await sendMail({
      to: email,
      toName: rows[0].name,
      userId: rows[0].id,
      kind: 'password-reset',
      subject: 'Neues Passwort für die Wintigolf League',
      paragraphs: [
        `Hallo ${rows[0].name}`,
        'Du hast ein neues Passwort angefordert. Der Link gilt zwei Stunden.',
        'Warst du das nicht, kannst du diese Mail ignorieren — dein Passwort bleibt, wie es ist.',
      ],
      action: { label: 'Passwort neu setzen', url: appUrl(`/#/passwort/${token}`) },
    })
  }

  json(res, 200, { ok: true })
})
