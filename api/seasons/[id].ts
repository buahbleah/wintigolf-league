import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param, requireString } from '../_lib/http.js'
import { requireAdmin } from '../_lib/auth.js'
import { cleanSettings, seasonById, settingsOf } from '../_lib/season.js'
import {
  buildWeeks,
  daysBetween,
  shiftZurichBy,
  zurichIsoDate,
  zurichTime,
} from '../../src/core/dates.js'
import { applyWindows, weeksOfSeason, zurichMoment } from '../_lib/weekDates.js'
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
export default handler(['PATCH', 'DELETE'], async (req: VercelRequest, res: VercelResponse) => {
  await requireAdmin(req)
  const season = await seasonById(param(req, 'id'))

  /**
   * Eine Saison wegwerfen.
   *
   * Nur, solange niemand eine Karte abgegeben hat — danach hängen Runden,
   * Belege, Handicap-Verlauf und Abzeichen daran, und das löscht man nicht
   * aus Versehen weg. Eine gespielte Saison wird abgeschlossen und archiviert,
   * nicht gelöscht: sie ist die Geschichte der Liga.
   *
   * Genau dafür ist das hier da: eine Probesaison zum Ausprobieren soll keine
   * Einbahnstrasse sein.
   */
  if (req.method === 'DELETE') {
    const played = (await sql`
      SELECT count(*)::int AS n FROM rounds
      WHERE season_id = ${season.id} AND status IN ('submitted','confirmed')
    `) as any[]
    if (played[0].n > 0) {
      throw new HttpError(
        409,
        played[0].n === 1
          ? 'In dieser Saison liegt bereits eine abgegebene Karte. Schliess sie ab und archiviere sie, statt sie wegzuwerfen.'
          : `In dieser Saison liegen ${played[0].n} abgegebene Karten. Schliess sie ab und archiviere sie, statt sie wegzuwerfen.`,
      )
    }
    await sql`DELETE FROM seasons WHERE id = ${season.id}`
    json(res, 200, { deleted: true })
    return
  }

  const input = body(req)
  const started = season.started_at !== null
  let moved = 0

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

  /**
   * Die ganze Saison verschieben.
   *
   * Angegeben wird, wann Woche 1 beginnt — Datum, Uhrzeit oder beides. Alle
   * Wochen rücken um denselben Betrag mit, samt ihren Einreicheterminen. Was
   * der Admin an einzelnen Wochen schon von Hand gerichtet hat, bleibt dabei
   * erhalten: verschoben wird das Raster, nicht neu gelegt.
   *
   * Anders als früher geht das auch, wenn die Saison schon läuft. Genau dann
   * braucht man es: der Start steht, und dann kommt doch etwas dazwischen. Die
   * Grenze zieht nicht der Saisonstatus, sondern das Gespielte — eine Woche,
   * in der schon eine Karte liegt, lässt sich nicht aus ihr herausschieben.
   */
  if (input.startDate !== undefined || input.startTime !== undefined) {
    const weeks = await weeksOfSeason(season.id)
    if (!weeks.length) throw new HttpError(409, 'Diese Saison hat noch keine Wochen.')
    const first = weeks[0]

    const startDate =
      input.startDate === undefined
        ? zurichIsoDate(first.startsAt)
        : requireString(input.startDate, 'Das Startdatum', 10)
    const startTime =
      input.startTime === undefined
        ? zurichTime(first.startsAt)
        : requireString(input.startTime, 'Die Uhrzeit', 5)

    const target = zurichMoment(startDate, startTime, 'Der Saisonstart')
    const days = daysBetween(zurichIsoDate(first.startsAt), zurichIsoDate(target))
    const minutes = minutesOfDay(target) - minutesOfDay(first.startsAt)

    moved = await applyWindows(
      season.id,
      new Map(
        weeks.map((week) => [
          week.id,
          {
            startsAt: shiftZurichBy(week.startsAt, days, minutes),
            endsAt: shiftZurichBy(week.endsAt, days, minutes),
          },
        ]),
      ),
    )
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
    const weeks = await weeksOfSeason(season.id)
    moved = await applyWindows(
      season.id,
      new Map(
        weeks
          .filter((week) => week.number >= from)
          .map((week) => [
            week.id,
            { startsAt: shiftZurichBy(week.startsAt, days), endsAt: shiftZurichBy(week.endsAt, days) },
          ]),
      ),
    )
  }

  json(res, 200, { ok: true, moved })
})

/** Minuten seit Mitternacht, in Schweizer Ortszeit. */
function minutesOfDay(at: Date): number {
  const [hour, minute] = zurichTime(at).split(':').map(Number)
  return hour * 60 + minute
}

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
