import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, settingsOf } from '../_lib/season.js'
import { gapAfter } from './index.js'
import { notify } from '../_lib/notify.js'

/**
 * Zu- und absagen, Dauer ändern, Termin absagen.
 *
 * POST   { join: true }   — zusagen
 * POST   { leave: true }  — absagen
 * PATCH  { durationMin }  — Dauer von Hand setzen (danach wächst sie nicht mehr)
 * DELETE                  — Termin absagen (nur wer ausgeschrieben hat, oder Admin)
 */
export default handler(['POST', 'PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
  const settings = settingsOf(season)
  const slotId = param(req, 'id')

  const slots = (await sql`
    SELECT id, created_by, starts_at, duration_min, duration_manual, cancelled_at
    FROM slots WHERE id = ${slotId} AND season_id = ${season.id}
  `) as any[]
  if (!slots[0]) throw new HttpError(404, 'Diesen Termin gibt es nicht.')
  const slot = slots[0]
  if (slot.cancelled_at) throw new HttpError(409, 'Dieser Termin ist abgesagt.')

  if (req.method === 'DELETE') {
    if (slot.created_by !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Absagen darf nur, wer ausgeschrieben hat.')
    }
    await sql`UPDATE slots SET cancelled_at = now() WHERE id = ${slotId}`

    const players = (await sql`
      SELECT user_id FROM slot_signups WHERE slot_id = ${slotId} AND user_id <> ${user.id}
    `) as any[]
    for (const player of players) {
      await notify({
        userId: player.user_id,
        kind: 'slot-cancelled',
        title: `${user.name} hat den Termin abgesagt`,
        link: '#/termine',
      })
    }

    json(res, 200, { ok: true })
    return
  }

  if (req.method === 'PATCH') {
    const minutes = Math.round(Number(body(req).durationMin))
    if (!Number.isFinite(minutes) || minutes < 30 || minutes > 600) {
      throw new HttpError(400, 'Die Dauer muss zwischen 30 Minuten und zehn Stunden liegen.')
    }
    const gap = await gapAfter(season.id, slotId, new Date(slot.starts_at))
    if (minutes > gap) {
      throw new HttpError(409, 'So lange ist der Simulator danach nicht mehr frei.')
    }
    await sql`
      UPDATE slots SET duration_min = ${minutes}, duration_manual = true WHERE id = ${slotId}
    `
    json(res, 200, { durationMin: minutes })
    return
  }

  const input = body(req)

  if (input.leave === true) {
    await sql`DELETE FROM slot_signups WHERE slot_id = ${slotId} AND user_id = ${user.id}`
    await resize(season.id, slot, settings.hoursPerPlayer, settings.minSlotHours)
    json(res, 200, { ok: true })
    return
  }

  const count = (await sql`
    SELECT count(*)::int AS n FROM slot_signups WHERE slot_id = ${slotId}
  `) as any[]
  if (count[0].n >= settings.maxPlayersPerSlot) {
    throw new HttpError(409, `Der Termin ist voll — mehr als ${settings.maxPlayersPerSlot} gehen am Simulator nicht.`)
  }

  await sql`
    INSERT INTO slot_signups (slot_id, user_id) VALUES (${slotId}, ${user.id})
    ON CONFLICT DO NOTHING
  `
  await resize(season.id, slot, settings.hoursPerPlayer, settings.minSlotHours)

  if (slot.created_by !== user.id) {
    await notify({
      userId: slot.created_by,
      kind: 'slot-joined',
      title: `${user.name} ist dabei`,
      link: '#/termine',
    })
  }

  json(res, 200, { ok: true })
})

/**
 * Die Dauer an die Zahl der Zusagen anpassen — aber nie über den nächsten
 * Termin hinaus und nie, wenn sie von Hand gesetzt wurde.
 */
async function resize(
  seasonId: string,
  slot: { id: string; starts_at: string; duration_manual: boolean },
  hoursPerPlayer: number,
  minHours: number,
): Promise<void> {
  if (slot.duration_manual) return
  const count = (await sql`
    SELECT count(*)::int AS n FROM slot_signups WHERE slot_id = ${slot.id}
  `) as any[]
  const needed = Math.round(Math.max(minHours, hoursPerPlayer * Math.max(1, count[0].n)) * 60)
  const gap = await gapAfter(seasonId, slot.id, new Date(slot.starts_at))
  await sql`UPDATE slots SET duration_min = ${Math.min(needed, gap)} WHERE id = ${slot.id}`
}
