import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, normaliseEmail, optionalNumber, requireString } from '../_lib/http.js'
import { createSession, hashPassword } from '../_lib/auth.js'

/**
 * Registrierung.
 *
 * Der Zugang läuft über den Liga-Code: ohne gültigen Code kommt niemand in die
 * App. Die einzige Ausnahme ist das allererste Konto — es gibt zu diesem
 * Zeitpunkt noch keine Saison, die einen Code ausgeben könnte, also wird daraus
 * der Admin, der danach alles andere anlegt.
 *
 * Das Indoor-Handicap startet bei 50 % des Outdoor-Handicaps und bleibt bis zum
 * Saisonstart änderbar.
 */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const input = body(req)
  const name = requireString(input.name, 'Der Name', 60)
  const email = normaliseEmail(input.email)
  const outdoorHandicap = optionalNumber(input.outdoorHandicap, 'Das Handicap', -10, 54)
  const passwordHash = await hashPassword(String(input.password ?? ''))

  const counted = (await sql`SELECT count(*)::int AS n FROM users`) as any[]
  const isFirstAccount = counted[0].n === 0

  let season: { id: string; status: string } | null = null
  if (!isFirstAccount) {
    const code = requireString(input.joinCode, 'Der Liga-Code', 20).toUpperCase()
    const found = (await sql`
      SELECT id, status FROM seasons WHERE upper(join_code) = ${code}
    `) as any[]
    if (!found[0]) throw new HttpError(400, 'Diesen Liga-Code kennen wir nicht.')
    if (found[0].status === 'archived' || found[0].status === 'finished') {
      throw new HttpError(400, 'Diese Saison ist vorbei.')
    }
    season = found[0]
  }

  const taken = (await sql`SELECT 1 FROM users WHERE lower(email) = ${email}`) as any[]
  if (taken.length) throw new HttpError(409, 'Mit dieser Adresse ist schon ein Konto angelegt.')

  const role = isFirstAccount ? 'admin' : 'member'
  const inserted = (await sql`
    INSERT INTO users (email, name, password_hash, role, outdoor_handicap, color_index)
    VALUES (${email}, ${name}, ${passwordHash}, ${role}, ${outdoorHandicap}, ${counted[0].n % 8})
    RETURNING id
  `) as any[]
  const userId = inserted[0].id as string

  if (season) {
    // Nachzügler steigen in der Woche ein, die gerade läuft.
    const week = (await sql`
      SELECT number FROM weeks
      WHERE season_id = ${season.id} AND kind = 'regular' AND ends_at > now()
      ORDER BY number LIMIT 1
    `) as any[]
    const starting = outdoorHandicap === null ? null : Math.round((outdoorHandicap / 2) * 10) / 10
    await sql`
      INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap, joined_week)
      VALUES (${season.id}, ${userId}, ${starting}, ${starting}, ${week[0]?.number ?? 1})
      ON CONFLICT (season_id, user_id) DO NOTHING
    `
  }

  await createSession(res, userId)
  json(res, 201, {
    user: {
      id: userId,
      email,
      name,
      role,
      outdoorHandicap,
      avatarUrl: null,
      colorIndex: counted[0].n % 8,
      clubDistances: {},
    },
  })
})
