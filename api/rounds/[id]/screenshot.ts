import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../../_lib/db.js'
import { body, handler, HttpError, json, param } from '../../_lib/http.js'
import { requireUser } from '../../_lib/auth.js'
import { loadRound } from '../../_lib/rounds.js'

/**
 * Der Beleg zu einer Runde: das abfotografierte Abschlussbild aus GSPro.
 *
 * POST lädt hoch, GET gibt es zurück. Das Bild wird auf dem Gerät verkleinert,
 * bevor es hier ankommt — ein Handyfoto hat gerne vier Megabyte, und dreissig
 * davon sind für eine Liga nichts als Ballast.
 *
 * Belege liegen in der Datenbank und nicht in einem öffentlichen Speicher: so
 * sieht sie nur, wer angemeldet ist, statt jeder, der die Adresse kennt.
 */

const MAX_BYTES = 3_000_000

export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const roundId = param(req, 'id')

  if (req.method === 'GET') {
    const rows = (await sql`
      SELECT mime, bytes FROM screenshots WHERE round_id = ${roundId}
      ORDER BY created_at DESC LIMIT 1
    `) as any[]
    if (!rows[0]) throw new HttpError(404, 'Zu dieser Runde gibt es kein Foto.')

    const buffer = toBuffer(rows[0].bytes)
    res.setHeader('Content-Type', rows[0].mime)
    res.setHeader('Content-Length', String(buffer.byteLength))
    // Privat zwischenspeichern: der Beleg ändert sich nicht mehr, gehört aber
    // nicht in einen geteilten Cache.
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.status(200).send(buffer)
    return
  }

  const loaded = await loadRound(roundId)
  if (loaded.row.user_id !== user.id && user.role !== 'admin') {
    throw new HttpError(403, 'Das ist nicht deine Karte.')
  }
  if (loaded.row.status === 'confirmed' && user.role !== 'admin') {
    throw new HttpError(409, 'Diese Karte ist bestätigt — das Foto steht fest.')
  }

  const dataUrl = String(body(req).image ?? '')
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new HttpError(400, 'Das war kein lesbares Bild.')

  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, 'Das Bild ist zu gross.')

  // Ein Beleg pro Runde: ein neuer ersetzt den alten.
  await sql`DELETE FROM screenshots WHERE round_id = ${roundId}`
  const created = (await sql`
    INSERT INTO screenshots (round_id, mime, bytes, byte_size, uploaded_by)
    VALUES (${roundId}, ${match[1]}, decode(${match[2]}, 'base64'), ${bytes.byteLength}, ${user.id})
    RETURNING id
  `) as any[]

  json(res, 201, { id: created[0].id, bytes: bytes.byteLength })
})

/** Postgres liefert bytea über HTTP als '\x…'-Hexstring. */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  const text = String(value)
  if (text.startsWith('\\x')) return Buffer.from(text.slice(2), 'hex')
  return Buffer.from(text, 'base64')
}
