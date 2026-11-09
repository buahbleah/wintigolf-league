import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, optionalNumber, requireString } from '../_lib/http.js'
import { publicUser, requireUser } from '../_lib/auth.js'

/**
 * Das eigene Profil ändern.
 *
 * Das Outdoor-Handicap darf jeder selber setzen — bis die Saison gestartet ist.
 * Danach ist der Startwert eingefroren; wer sich vertan hat, meldet sich beim
 * Admin. Das Indoor-Handicap kann hier grundsätzlich niemand anfassen, das
 * rechnet nach jeder Runde das System.
 */
export default handler(['PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const input = body(req)

  const name = input.name === undefined ? user.name : requireString(input.name, 'Der Name', 60)
  const avatarUrl =
    input.avatarUrl === undefined ? user.avatarUrl : normaliseAvatar(input.avatarUrl)

  let outdoor = user.outdoorHandicap
  if (input.outdoorHandicap !== undefined) {
    const started = (await sql`
      SELECT 1 FROM seasons
      WHERE started_at IS NOT NULL AND status IN ('active','playoffs')
      LIMIT 1
    `) as any[]
    if (started.length && user.role !== 'admin') {
      throw new HttpError(
        403,
        'Die Saison läuft — das Handicap kann jetzt nur noch der Admin ändern.',
      )
    }
    outdoor = optionalNumber(input.outdoorHandicap, 'Das Handicap', -10, 54)
  }

  const distances =
    input.clubDistances === undefined ? user.clubDistances : normaliseDistances(input.clubDistances)

  const rows = (await sql`
    UPDATE users SET
      name = ${name},
      avatar_url = ${avatarUrl},
      outdoor_handicap = ${outdoor},
      club_distances = ${JSON.stringify(distances)}::jsonb,
      updated_at = now()
    WHERE id = ${user.id}
    RETURNING id, email, name, role, outdoor_handicap, avatar_url, color_index, club_distances
  `) as any[]

  // Solange die Saison noch nicht gestartet ist, zieht der Startwert mit:
  // 50 % des Outdoor-Handicaps.
  if (outdoor !== null) {
    await sql`
      UPDATE season_players sp SET
        starting_handicap = ${Math.round((outdoor / 2) * 10) / 10},
        indoor_handicap = ${Math.round((outdoor / 2) * 10) / 10}
      FROM seasons s
      WHERE sp.season_id = s.id AND sp.user_id = ${user.id} AND s.started_at IS NULL
    `
  }

  json(res, 200, { user: publicUser(rows[0]) })
})

/** Ein Profilbild ist eine kleine Data-URL, auf dem Gerät verkleinert. */
function normaliseAvatar(value: unknown): string | null {
  if (value === null || value === '') return null
  const url = requireString(value, 'Das Bild', 400_000)
  if (!url.startsWith('data:image/')) throw new HttpError(400, 'Das Bild konnte nicht gelesen werden.')
  return url
}

/** Schlägerdistanzen: Schläger auf Meter, nichts Exotisches. */
function normaliseDistances(value: unknown): Record<string, number> {
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object') throw new HttpError(400, 'Die Schlägerdistanzen waren nicht lesbar.')
  const out: Record<string, number> = {}
  for (const [club, metres] of Object.entries(value as Record<string, unknown>)) {
    if (metres === null || metres === '') continue
    const num = Number(metres)
    if (!Number.isFinite(num) || num <= 0 || num > 400) {
      throw new HttpError(400, `Die Distanz für ${club} ergibt keinen Sinn.`)
    }
    out[club.slice(0, 20)] = Math.round(num)
  }
  return out
}
