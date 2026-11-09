import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, requireString } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, requireMember, settingsOf } from '../_lib/season.js'
import { notify } from '../_lib/notify.js'

/**
 * Termine am Simulator.
 *
 * GET  — was ansteht, mit Zusagen.
 * POST — einen Termin ausschreiben.
 *
 * Es gibt genau einen Simulator, also darf sich nichts überlappen. Die Dauer
 * wächst mit den Zusagen — eine Stunde pro Person, mindestens zwei — bis an den
 * nächsten Termin heran; weiter nicht, sonst schiebt eine späte Zusage den
 * nächsten Flight aus dem Kalender.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) {
    if (req.method === 'GET') {
      json(res, 200, { slots: [] })
      return
    }
    throw new HttpError(400, 'Es läuft keine Saison.')
  }
  await requireMember(season.id, user.id)

  if (req.method === 'GET') return list(season.id, res)

  const settings = settingsOf(season)
  const input = body(req)
  const startsAt = new Date(requireString(input.startsAt, 'Der Zeitpunkt', 40))
  if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Das ist kein Zeitpunkt.')
  if (startsAt.getTime() < Date.now() - 3600_000) {
    throw new HttpError(400, 'Dieser Zeitpunkt liegt in der Vergangenheit.')
  }
  const note = input.note ? requireString(input.note, 'Die Notiz', 200) : null

  // Zur laufenden Woche gehören, wenn der Termin in sie hineinfällt.
  const weeks = (await sql`
    SELECT id FROM weeks
    WHERE season_id = ${season.id} AND ${startsAt.toISOString()}::timestamptz BETWEEN starts_at AND ends_at
    ORDER BY number LIMIT 1
  `) as any[]

  const minutes = Math.round(Math.max(settings.minSlotHours, settings.hoursPerPlayer) * 60)
  await ensureFree(season.id, startsAt, minutes, null)

  const created = (await sql`
    INSERT INTO slots (season_id, week_id, created_by, starts_at, duration_min, note)
    VALUES (${season.id}, ${weeks[0]?.id ?? null}, ${user.id}, ${startsAt.toISOString()},
            ${minutes}, ${note})
    RETURNING id
  `) as any[]

  // Wer ausschreibt, ist dabei.
  await sql`
    INSERT INTO slot_signups (slot_id, user_id) VALUES (${created[0].id}, ${user.id})
    ON CONFLICT DO NOTHING
  `

  // Die anderen erfahren davon in der App, nicht per Mail.
  const others = (await sql`
    SELECT user_id FROM season_players
    WHERE season_id = ${season.id} AND status = 'active' AND user_id <> ${user.id}
  `) as any[]
  for (const other of others) {
    await notify({
      userId: other.user_id,
      kind: 'slot-created',
      title: `${user.name} hat einen Termin ausgeschrieben`,
      body: note ?? undefined,
      link: '#/termine',
    })
  }

  json(res, 201, { id: created[0].id })
})

async function list(seasonId: string, res: VercelResponse) {
  const slots = (await sql`
    SELECT s.id, s.starts_at, s.duration_min, s.note, s.created_by, s.week_id,
           u.name AS created_by_name, w.number AS week_number
    FROM slots s
    JOIN users u ON u.id = s.created_by
    LEFT JOIN weeks w ON w.id = s.week_id
    WHERE s.season_id = ${seasonId} AND s.cancelled_at IS NULL
      AND s.starts_at > now() - interval '12 hours'
    ORDER BY s.starts_at
  `) as any[]

  const signups = (await sql`
    SELECT ss.slot_id, ss.user_id, u.name, u.avatar_url
    FROM slot_signups ss
    JOIN users u ON u.id = ss.user_id
    JOIN slots s ON s.id = ss.slot_id
    WHERE s.season_id = ${seasonId}
    ORDER BY ss.created_at
  `) as any[]

  json(res, 200, {
    slots: slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.starts_at,
      durationMin: slot.duration_min,
      note: slot.note,
      createdBy: slot.created_by,
      createdByName: slot.created_by_name,
      weekNumber: slot.week_number,
      players: signups
        .filter((s) => s.slot_id === slot.id)
        .map((s) => ({ id: s.user_id, name: s.name, avatarUrl: s.avatar_url })),
    })),
  })
}

/**
 * Prüft, dass das Zeitfenster frei ist. `exclude` lässt den eigenen Termin
 * aus — beim Verlängern vergleicht man sich sonst mit sich selbst.
 */
export async function ensureFree(
  seasonId: string,
  startsAt: Date,
  minutes: number,
  exclude: string | null,
): Promise<void> {
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000)
  const clash = (await sql`
    SELECT starts_at, duration_min FROM slots
    WHERE season_id = ${seasonId} AND cancelled_at IS NULL
      AND (${exclude}::uuid IS NULL OR id <> ${exclude}::uuid)
      AND starts_at < ${endsAt.toISOString()}::timestamptz
      AND starts_at + make_interval(mins => duration_min) > ${startsAt.toISOString()}::timestamptz
    LIMIT 1
  `) as any[]
  if (clash.length) {
    throw new HttpError(
      409,
      'Zu dieser Zeit ist der Simulator schon belegt. Es gibt nur einen.',
    )
  }
}

/** Die Minuten bis zum nächsten Termin danach — mehr darf keiner wachsen. */
export async function gapAfter(seasonId: string, slotId: string, startsAt: Date): Promise<number> {
  const next = (await sql`
    SELECT starts_at FROM slots
    WHERE season_id = ${seasonId} AND cancelled_at IS NULL AND id <> ${slotId}
      AND starts_at >= ${startsAt.toISOString()}::timestamptz
    ORDER BY starts_at LIMIT 1
  `) as any[]
  if (!next[0]) return Number.MAX_SAFE_INTEGER
  return Math.round((new Date(next[0].starts_at).getTime() - startsAt.getTime()) / 60_000)
}
