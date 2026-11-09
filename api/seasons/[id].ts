import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param, requireString } from '../_lib/http.js'
import { requireAdmin } from '../_lib/auth.js'
import { cleanSettings, seasonById, settingsOf } from '../_lib/season.js'
import { addDays, buildWeeks, weekdayOf, zurichIsoDate } from '../../src/core/dates.js'
import { withDefaults } from '../../src/core/settings.js'

/**
 * Die Saison verwalten: Einstellungen ändern, starten, pausieren, abschliessen.
 *
 * Zwei Dinge sind hier bewusst streng. Erstens wirkt jede Änderung nur nach
 * vorne — eine gespielte Runde hält ihr Handicap selber fest. Zweitens lassen
 * sich ein paar Schrauben nach dem Start gar nicht mehr drehen, weil sie
 * Gespieltes umdeuten würden: die Zahl der Wochen, die Länge der Eichphase und
 * der Startfaktor.
 */
export default handler(['PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  await requireAdmin(req)
  const season = await seasonById(param(req, 'id'))
  const input = body(req)
  const started = season.started_at !== null

  /* --------------------------------------------------------- Einstellungen */
  if (input.settings !== undefined) {
    const incoming = cleanSettings(input.settings)
    const current = settingsOf(season)

    if (started) {
      for (const locked of ['weeks', 'calibrationWeeks', 'startFactor'] as const) {
        if (incoming[locked] !== undefined && incoming[locked] !== current[locked]) {
          throw new HttpError(
            409,
            'Wochen, Eichphase und Startfaktor stehen fest, sobald die Saison gestartet ist.',
          )
        }
      }
    }

    const merged = { ...(season.settings ?? {}), ...incoming }
    await sql`
      UPDATE seasons SET settings = ${JSON.stringify(merged)}::jsonb, updated_at = now()
      WHERE id = ${season.id}
    `

    // Mehr oder weniger Wochen heisst: die Fenster neu legen. Nur solange nichts
    // gespielt ist, darum ist das nach dem Start gesperrt.
    const next = withDefaults(merged)
    if (!started && (incoming.weeks !== undefined || incoming.deadlineHour !== undefined)) {
      await relayWeeks(season.id, next.weeks, next.deadlineHour)
    }
  }

  /* ------------------------------------------------------------- Startdatum */
  if (input.startDate !== undefined) {
    if (started) throw new HttpError(409, 'Die Saison läuft bereits.')
    const startDate = requireString(input.startDate, 'Das Startdatum', 10)
    if (weekdayOf(startDate) !== settingsOf(season).weekStartsOn) {
      throw new HttpError(400, 'Die Saison muss an einem Montag beginnen.')
    }
    const s = settingsOf(season)
    const windows = buildWeeks({ startDate, weeks: s.weeks, deadlineHour: s.deadlineHour })
    for (const week of windows) {
      await sql`
        UPDATE weeks SET starts_at = ${week.startsAt.toISOString()},
                         ends_at = ${week.endsAt.toISOString()}
        WHERE season_id = ${season.id} AND number = ${week.number}
      `
    }
  }

  /* ----------------------------------------------------------------- Status */
  if (input.status !== undefined) {
    const status = String(input.status)
    if (!['draft', 'active', 'playoffs', 'finished', 'archived'].includes(status)) {
      throw new HttpError(400, 'Diesen Zustand gibt es nicht.')
    }
    if (status === 'active' && !started) {
      // Der Start friert die Handicaps ein.
      await sql`UPDATE seasons SET started_at = now() WHERE id = ${season.id}`
    }
    await sql`UPDATE seasons SET status = ${status}, updated_at = now() WHERE id = ${season.id}`
  }

  /* ------------------------------------------------------------------ Pause */
  if (input.pause !== undefined) {
    const pause = Boolean(input.pause)
    await sql`
      UPDATE seasons SET paused_at = ${pause ? new Date().toISOString() : null}, updated_at = now()
      WHERE id = ${season.id}
    `
  }

  /**
   * Wochen verschieben: ab einer Nummer alles um so viele Tage nach hinten.
   * Das ist der Weg für Feiertage und für einen Simulator, der eine Woche steht.
   */
  if (input.shiftFrom !== undefined) {
    const from = Number(input.shiftFrom)
    const days = Number(input.shiftDays ?? 7)
    if (!Number.isInteger(from) || from < 1) throw new HttpError(400, 'Ab welcher Woche?')
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 120) {
      throw new HttpError(400, 'Um wie viele Tage?')
    }
    const weeks = (await sql`
      SELECT id, number, starts_at, ends_at FROM weeks
      WHERE season_id = ${season.id} AND number >= ${from}
      ORDER BY number
    `) as any[]
    const s = settingsOf(season)
    for (const week of weeks) {
      const startDate = addDays(zurichIsoDate(new Date(week.starts_at)), days)
      const windows = buildWeeks({ startDate, weeks: 1, deadlineHour: s.deadlineHour })
      await sql`
        UPDATE weeks SET starts_at = ${windows[0].startsAt.toISOString()},
                         ends_at = ${windows[0].endsAt.toISOString()}
        WHERE id = ${week.id}
      `
    }
  }

  json(res, 200, { ok: true })
})

/** Wochenfenster neu auslegen, ausgehend vom bisherigen Start. */
async function relayWeeks(seasonId: string, weeks: number, deadlineHour: number) {
  const first = (await sql`
    SELECT starts_at FROM weeks WHERE season_id = ${seasonId} ORDER BY number LIMIT 1
  `) as any[]
  if (!first[0]) return
  const startDate = zurichIsoDate(new Date(first[0].starts_at))

  const windows = buildWeeks({ startDate, weeks, deadlineHour })
  for (const week of windows) {
    await sql`
      INSERT INTO weeks (season_id, number, starts_at, ends_at, status)
      VALUES (${seasonId}, ${week.number}, ${week.startsAt.toISOString()},
              ${week.endsAt.toISOString()}, 'upcoming')
      ON CONFLICT (season_id, number) DO UPDATE
        SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at
    `
  }
  // Überzählige Wochen fallen weg — aber nur, wenn dort nichts gespielt wurde.
  await sql`
    DELETE FROM weeks w
    WHERE w.season_id = ${seasonId} AND w.number > ${weeks} AND w.kind = 'regular'
      AND NOT EXISTS (SELECT 1 FROM rounds r WHERE r.week_id = w.id)
  `
}
