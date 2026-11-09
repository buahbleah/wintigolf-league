import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../../_lib/db.js'
import { body, handler, HttpError, json, param } from '../../_lib/http.js'
import { requireUser } from '../../_lib/auth.js'
import { loadRound, roundPayload } from '../../_lib/rounds.js'
import { notify } from '../../_lib/notify.js'
import { recomputeHandicap } from '../../_lib/handicap.js'
import { seasonById } from '../../_lib/season.js'

/**
 * Eine Karte bestätigen oder ablehnen — das, was im echten Golf das Austauschen
 * der Scorecards ist.
 *
 * Bestätigen darf der gewählte Zähler und der Admin. Eine Ablehnung putzt die
 * Lochliste und macht aus der Karte wieder einen Entwurf: sie wird neu
 * eingetragen, nicht nachgebessert.
 */
export default handler(['POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const roundId = param(req, 'id')
  const loaded = await loadRound(roundId)
  const input = body(req)

  const isMarker = loaded.row.marker_id === user.id
  const isAdmin = user.role === 'admin'
  if (!isMarker && !isAdmin) throw new HttpError(403, 'Diese Karte liegt nicht bei dir.')
  if (loaded.row.status === 'confirmed' && !isAdmin) {
    throw new HttpError(409, 'Diese Karte ist schon bestätigt.')
  }

  /* ----------------------------------------------------------- Ablehnen */
  if (input.reject === true) {
    const reason =
      typeof input.reason === 'string' && input.reason.trim()
        ? input.reason.trim().slice(0, 300)
        : 'Ohne Begründung'

    await sql`UPDATE round_holes SET strokes = NULL WHERE round_id = ${roundId}`
    await sql`
      UPDATE rounds SET status = 'draft', rejected_reason = ${reason}, confirmed_by = NULL,
                        confirmed_at = NULL, updated_at = now()
      WHERE id = ${roundId}
    `

    // War die Karte schon einmal bestätigt, fällt sie jetzt aus dem Handicap
    // wieder heraus — also neu rechnen.
    await recomputeHandicap(await seasonById(loaded.row.season_id), loaded.row.user_id)

    await notify({
      userId: loaded.row.user_id,
      kind: 'card-rejected',
      title: `${user.name} hat deine Karte abgelehnt`,
      body: reason,
      link: `#/runde/${loaded.row.week_id}`,
      mail: {
        subject: 'Deine Karte wurde abgelehnt',
        paragraphs: [
          `${user.name} hat die Karte aus Woche ${loaded.row.week_number} abgelehnt.`,
          `Begründung: ${reason}`,
          'Trag die Runde bitte neu ein — die Lochliste ist zurückgesetzt, das Foto bleibt.',
        ],
        action: { label: 'Karte neu eintragen', path: `#/runde/${loaded.row.week_id}` },
      },
      dedupeKey: `reject:${roundId}:${Date.now()}`,
    })

    json(res, 200, { round: roundPayload(await loadRound(roundId)) })
    return
  }

  /* --------------------------------------------------------- Bestätigen */
  if (loaded.row.status === 'draft' && !isAdmin) {
    throw new HttpError(409, 'Diese Karte ist noch nicht abgegeben.')
  }

  await sql`
    UPDATE rounds SET status = 'confirmed', confirmed_by = ${user.id}, confirmed_at = now(),
                      rejected_reason = NULL, updated_at = now()
    WHERE id = ${roundId}
  `

  // Jetzt, und erst jetzt, bewegt sich das Handicap.
  const season = await seasonById(loaded.row.season_id)
  const moved = await recomputeHandicap(season, loaded.row.user_id)

  const movement =
    moved.before !== null && moved.after !== null && moved.before !== moved.after
      ? ` · Handicap ${moved.before.toFixed(1)} → ${moved.after.toFixed(1)}`
      : ''

  await notify({
    userId: loaded.row.user_id,
    kind: 'card-confirmed',
    title: `${user.name} hat deine Karte bestätigt`,
    body: `Woche ${loaded.row.week_number} · ${loaded.result.points} Punkte${movement}`,
    link: `#/karte/${roundId}`,
  })

  json(res, 200, { round: roundPayload(await loadRound(roundId)) })
})
