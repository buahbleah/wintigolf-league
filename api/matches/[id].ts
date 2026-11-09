import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, seasonById } from '../_lib/season.js'
import { advanceBracket, bracketState } from '../_lib/playoffs.js'
import { notify } from '../_lib/notify.js'
import { SUDDEN_DEATH_LABEL } from '../../src/core/matchplay.js'

/**
 * Ein Match entscheiden, wenn es sich nicht aus achtzehn Löchern ergibt.
 *
 * Zwei Fälle, und nur zwei:
 *
 * **Stechen** — nach einem geteilten Match. Eintragen darf einer der beiden
 * Spieler; sie stehen zu diesem Zeitpunkt nebeneinander am Simulator, und wer
 * dort etwas Falsches einträgt, bekommt es sofort zu hören.
 *
 * **Kampflos** — wenn ein Match nicht zustande kommt. Dann kommt der höher
 * gesetzte Spieler weiter; der Admin kann das überschreiben.
 */
export default handler(['PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
  const matchId = param(req, 'id')

  const matches = (await sql`
    SELECT id, home_id, away_id, home_seed, away_seed, winner_id, round_name
    FROM matches WHERE id = ${matchId} AND season_id = ${season.id}
  `) as any[]
  if (!matches[0]) throw new HttpError(404, 'Dieses Match gibt es nicht.')
  const match = matches[0]

  const isPlayer = user.id === match.home_id || user.id === match.away_id
  const isAdmin = user.role === 'admin'
  if (!isPlayer && !isAdmin) throw new HttpError(403, 'Da spielst du nicht mit.')

  const input = body(req)

  /* -------------------------------------------------------- Stechen */
  if (input.suddenDeathWinnerId) {
    const winnerId = String(input.suddenDeathWinnerId)
    if (winnerId !== match.home_id && winnerId !== match.away_id) {
      throw new HttpError(400, 'Diese Person spielt in diesem Match nicht mit.')
    }

    const state = (await bracketState(season)).find((m) => m.id === matchId)
    if (!isAdmin && !state?.live?.allSquare) {
      throw new HttpError(
        409,
        'Ein Stechen gibt es erst, wenn beide Karten bestätigt sind und es geteilt steht.',
      )
    }

    await sql`
      UPDATE matches SET winner_id = ${winnerId}, result = ${SUDDEN_DEATH_LABEL},
                         decided_by = 'play'
      WHERE id = ${matchId}
    `
    await tell(match, winnerId, `${SUDDEN_DEATH_LABEL} entschieden`)
    await advanceBracket(await seasonById(season.id))
    json(res, 200, { ok: true })
    return
  }

  /* ------------------------------------------------------- Kampflos */
  if (input.walkover === true) {
    if (!isAdmin) throw new HttpError(403, 'Kampflos setzt nur der Admin.')
    if (!match.home_id || !match.away_id) throw new HttpError(400, 'Dieses Match ist noch leer.')

    const better =
      match.home_seed !== null && match.away_seed !== null && match.away_seed < match.home_seed
        ? match.away_id
        : match.home_id
    const winnerId = input.winnerId ? String(input.winnerId) : better

    await sql`
      UPDATE matches SET winner_id = ${winnerId}, result = 'kampflos', decided_by = 'walkover'
      WHERE id = ${matchId}
    `
    await tell(match, winnerId, 'kampflos')
    await advanceBracket(await seasonById(season.id))
    json(res, 200, { ok: true })
    return
  }

  /* --------------------------------------------- Admin überschreibt */
  if (input.winnerId) {
    if (!isAdmin) throw new HttpError(403, 'Das darf nur der Admin.')
    const winnerId = String(input.winnerId)
    if (winnerId !== match.home_id && winnerId !== match.away_id) {
      throw new HttpError(400, 'Diese Person spielt in diesem Match nicht mit.')
    }
    const result = input.result ? String(input.result).slice(0, 40) : 'vom Admin entschieden'
    await sql`
      UPDATE matches SET winner_id = ${winnerId}, result = ${result}, decided_by = 'admin'
      WHERE id = ${matchId}
    `
    await advanceBracket(await seasonById(season.id))
    json(res, 200, { ok: true })
    return
  }

  throw new HttpError(400, 'Es ist nicht klar, was hier entschieden werden soll.')
})

async function tell(match: any, winnerId: string, how: string): Promise<void> {
  for (const userId of [match.home_id, match.away_id]) {
    if (!userId) continue
    await notify({
      userId,
      kind: 'match-decided',
      title: userId === winnerId ? `Du bist weiter — ${how}` : `Ausgeschieden — ${how}`,
      link: '#/playoffs',
      dedupeKey: `match:${match.id}:${userId}:${winnerId}`,
    })
  }
}
