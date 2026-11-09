import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../../_lib/db.js'
import { body, handler, HttpError, json, param } from '../../_lib/http.js'
import { requireUser } from '../../_lib/auth.js'
import { loadRound, roundPayload } from '../../_lib/rounds.js'
import { notify } from '../../_lib/notify.js'
import { recomputeHandicap } from '../../_lib/handicap.js'
import { seasonById } from '../../_lib/season.js'

/**
 * GET   — eine Karte ansehen. Jedes Mitglied darf jede Karte sehen.
 * PATCH — die eigene Karte ändern: Löcher eintragen, Zähler wählen, abgeben.
 *
 * Geändert werden darf nur, solange die Karte Entwurf ist. Sobald sie abgegeben
 * ist, liegt sie beim Zähler, und nach einer Ablehnung wird sie neu eingetragen
 * — nicht nachgebessert. Genau das ist der Sinn der Abmachung.
 */
export default handler(['GET', 'PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const roundId = param(req, 'id')
  const loaded = await loadRound(roundId)

  if (req.method === 'GET') {
    json(res, 200, { round: roundPayload(loaded) })
    return
  }

  const isOwner = loaded.row.user_id === user.id
  const isAdmin = user.role === 'admin'
  if (!isOwner && !isAdmin) throw new HttpError(403, 'Das ist nicht deine Karte.')
  if (loaded.row.status !== 'draft' && !isAdmin) {
    throw new HttpError(409, 'Diese Karte ist schon abgegeben.')
  }

  const input = body(req)

  /* ------------------------------------------------------------- Löcher */
  if (input.holes !== undefined) {
    const entries = normaliseHoles(input.holes, loaded.card.holes.length)
    await sql`
      INSERT INTO round_holes (round_id, number, strokes)
      SELECT ${roundId}, n, s
      FROM unnest(${entries.map((e) => e.number)}::int[], ${entries.map((e) => e.strokes)}::int[])
        AS t(n, s)
      ON CONFLICT (round_id, number) DO UPDATE SET strokes = EXCLUDED.strokes
    `
    // Greift der Admin in eine fremde oder schon bestätigte Karte ein, steht das
    // von da an sichtbar daran. Stillschweigende Korrekturen gibt es nicht.
    if (isAdmin && (!isOwner || loaded.row.status !== 'draft')) {
      await sql`
        UPDATE rounds SET admin_note = ${`Vom Admin korrigiert am ${new Date().toLocaleDateString('de-CH')}`},
                          corrected_by = ${user.id}, updated_at = now()
        WHERE id = ${roundId}
      `
      // Eine Korrektur an einer bestätigten Karte verschiebt auch das Handicap.
      if (loaded.row.status === 'confirmed') {
        await recomputeHandicap(await seasonById(loaded.row.season_id), loaded.row.user_id)
      }
    } else {
      await sql`UPDATE rounds SET updated_at = now() WHERE id = ${roundId}`
    }
  }

  /* -------------------------------------------------------------- Zähler */
  if (input.markerId !== undefined) {
    const markerId = input.markerId === null ? null : String(input.markerId)
    if (markerId) {
      if (markerId === loaded.row.user_id) {
        throw new HttpError(400, 'Du kannst nicht dein eigener Zähler sein.')
      }
      const member = (await sql`
        SELECT 1 FROM season_players
        WHERE season_id = ${loaded.row.season_id} AND user_id = ${markerId} AND status = 'active'
      `) as any[]
      if (!member.length) throw new HttpError(400, 'Diese Person spielt in der Saison nicht mit.')
    }
    await sql`UPDATE rounds SET marker_id = ${markerId} WHERE id = ${roundId}`
  }

  /* -------------------------------------------------------------- Abgeben */
  if (input.submit === true) {
    const fresh = await loadRound(roundId)
    const hasScreenshot = fresh.row.screenshot_id !== null
    const marker = input.markerId !== undefined ? input.markerId : fresh.row.marker_id

    if (!hasScreenshot && !isAdmin) {
      throw new HttpError(400, 'Ohne Foto des Abschlussbildschirms geht es nicht.')
    }
    if (!marker && !fresh.row.solo_approved_by && !isAdmin) {
      throw new HttpError(400, 'Wähl einen Mitspieler als Zähler.')
    }
    if (fresh.result.played === 0) {
      throw new HttpError(400, 'Auf der Karte steht noch kein einziges Ergebnis.')
    }

    await sql`
      UPDATE rounds SET status = 'submitted', rejected_reason = NULL, updated_at = now()
      WHERE id = ${roundId}
    `

    if (marker) {
      await notify({
        userId: String(marker),
        kind: 'confirm-request',
        title: `${fresh.row.player_name} wartet auf deine Bestätigung`,
        body: `Woche ${fresh.row.week_number} · ${fresh.result.points} Punkte · ${fresh.row.course_name}`,
        link: `#/karte/${roundId}`,
        mail: {
          subject: `Eine Karte wartet auf deine Bestätigung`,
          paragraphs: [
            `${fresh.row.player_name} hat die Runde aus Woche ${fresh.row.week_number} eingetragen: ${fresh.result.points} Netto-Stableford-Punkte auf ${fresh.row.course_name}.`,
            'Schau dir die Karte und das Foto an und bestätige sie — oder lehn sie ab, wenn etwas nicht stimmt.',
          ],
          action: { label: 'Karte ansehen', path: `#/karte/${roundId}` },
        },
        dedupeKey: `confirm:${roundId}:${Date.now()}`,
      })
    }
  }

  json(res, 200, { round: roundPayload(await loadRound(roundId)) })
})

/** Nur Zahlen, die auf einer Golfkarte vorkommen können. */
function normaliseHoles(value: unknown, holeCount: number) {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Die Karte war nicht lesbar.')
  const out: { number: number; strokes: number | null }[] = []

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < 1 || number > holeCount) {
      throw new HttpError(400, `Loch ${key} gibt es auf diesem Kurs nicht.`)
    }
    if (raw === null || raw === '' || raw === undefined) {
      out.push({ number, strokes: null })
      continue
    }
    const strokes = Math.round(Number(raw))
    if (!Number.isFinite(strokes) || strokes < 1 || strokes > 20) {
      throw new HttpError(400, `Loch ${number}: ${raw} ist keine Schlagzahl.`)
    }
    out.push({ number, strokes })
  }

  if (!out.length) throw new HttpError(400, 'Es wurde nichts eingetragen.')
  return out
}
