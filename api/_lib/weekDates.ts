import { sql } from './db.js'
import { HttpError } from './http.js'
import { checkWeekWindow, WeekWindowError } from '../../src/core/weekWindows.js'
import { fromZurichDateTime } from '../../src/core/dates.js'

/**
 * Die Termine einer Saison verschieben.
 *
 * Hier läuft jede Terminänderung zusammen — die ganze Saison auf einen anderen
 * Start und die einzelne Woche, die der Admin von Hand verlegt. Beide gehen
 * denselben Weg: das vollständige Raster hinlegen, es als Ganzes prüfen, und
 * erst dann schreiben.
 *
 * Als Ganzes, weil eine einzelne Woche für sich genommen immer in Ordnung
 * aussieht. Ob sie in die nächste hineinragt, zeigt sich erst im Zusammenhang —
 * und eine Saison, in der zwei Wochen übereinanderliegen, lässt sich hinterher
 * nicht mehr sauber auseinanderrechnen.
 */

export interface WeekRow {
  id: string
  number: number
  startsAt: Date
  endsAt: Date
}

export interface Window {
  startsAt: Date
  endsAt: Date
}

export async function weeksOfSeason(seasonId: string): Promise<WeekRow[]> {
  const rows = (await sql`
    SELECT id, number, starts_at, ends_at FROM weeks
    WHERE season_id = ${seasonId}
    ORDER BY number
  `) as any[]
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  }))
}

/**
 * Wann für welche Woche schon eine Karte abgegeben wurde.
 *
 * Entwürfe zählen nicht: die sind noch in Arbeit und stehen einer Verschiebung
 * nicht im Weg. Abgegeben oder bestätigt heisst dagegen: diese Runde ist
 * gespielt, und das Fenster muss sie weiterhin enthalten.
 */
async function cardTimes(seasonId: string): Promise<Map<string, Date[]>> {
  const rows = (await sql`
    SELECT week_id, coalesce(played_at, created_at) AS at FROM rounds
    WHERE season_id = ${seasonId} AND status IN ('submitted','confirmed')
  `) as any[]
  const out = new Map<string, Date[]>()
  for (const row of rows) {
    const list = out.get(row.week_id) ?? []
    list.push(new Date(row.at))
    out.set(row.week_id, list)
  }
  return out
}

/**
 * Die geänderten Fenster übernehmen — oder gar keines.
 *
 * `changes` enthält nur, was sich bewegt; der Rest bleibt stehen und wird
 * trotzdem mitgeprüft, weil eine Verschiebung auch die Nachbarn betrifft.
 */
export async function applyWindows(
  seasonId: string,
  changes: Map<string, Window>,
): Promise<number> {
  const weeks = await weeksOfSeason(seasonId)
  if (!weeks.length) throw new HttpError(409, 'Diese Saison hat noch keine Wochen.')

  const next = weeks.map((week) => {
    const change = changes.get(week.id)
    return change ? { ...week, startsAt: change.startsAt, endsAt: change.endsAt } : week
  })
  next.sort((a, b) => a.number - b.number)

  const cards = await cardTimes(seasonId)

  try {
    for (const [index, week] of next.entries()) {
      checkWeekWindow({
        number: week.number,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
        previous: next[index - 1] ?? null,
        next: next[index + 1] ?? null,
        cardTimes: cards.get(week.id),
      })
    }
  } catch (err) {
    if (err instanceof WeekWindowError) throw new HttpError(409, err.message)
    throw err
  }

  let moved = 0
  for (const week of next) {
    const before = weeks.find((w) => w.id === week.id)!
    if (
      before.startsAt.getTime() === week.startsAt.getTime() &&
      before.endsAt.getTime() === week.endsAt.getTime()
    ) {
      continue
    }
    await sql`
      UPDATE weeks SET starts_at = ${week.startsAt.toISOString()},
                       ends_at = ${week.endsAt.toISOString()}
      WHERE id = ${week.id}
    `
    moved++
  }
  return moved
}

/** 'YYYY-MM-DD' plus 'HH:MM' aus einer Anfrage, als echter Moment. */
export function zurichMoment(isoDate: unknown, time: unknown, label: string): Date {
  const date = String(isoDate ?? '').trim()
  const clock = String(time ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, `${label}: Das ist kein Datum.`)
  if (!/^\d{2}:\d{2}$/.test(clock)) throw new HttpError(400, `${label}: Das ist keine Uhrzeit.`)
  try {
    return fromZurichDateTime(date, clock)
  } catch {
    throw new HttpError(400, `${label}: Das ist kein gültiger Zeitpunkt.`)
  }
}
