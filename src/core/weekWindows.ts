/**
 * Wann eine Woche beginnt und wann sie zu Ende ist.
 *
 * Die Termine einer Liga halten selten so, wie sie im Oktober gesetzt wurden:
 * der Simulator ist belegt, jemand ist krank, zwischen den Feiertagen geht
 * ohnehin nichts. Darum darf der Admin jede Woche einzeln verschieben.
 *
 * Was er dabei nicht darf, steht hier. Drei Dinge halten die Saison zusammen:
 *
 * Eine Woche endet nach ihrem Beginn. Zwei Wochen überlappen sich nicht — sonst
 * wäre nicht mehr entscheidbar, zu welcher Woche eine Runde gehört, und genau
 * daran hängen Tabelle, Streichresultate und Handicap.
 *
 * Und das Fenster lässt keine Karte draussen stehen, die schon abgegeben wurde.
 * Eine Runde wird in ihrer Woche gespielt; ein Termin, der das nachträglich
 * umdeutet, macht aus einer gültigen Karte eine, die es nie hätte geben dürfen.
 * Darum wird so eine Verschiebung abgewiesen und nicht stillschweigend gemacht.
 */

import { formatDay, zurichIsoDate, zurichTime } from './dates.js'

export class WeekWindowError extends Error {}

export interface Neighbour {
  number: number
  startsAt: Date
  endsAt: Date
}

export interface WindowCheck {
  number: number
  startsAt: Date
  endsAt: Date
  /** Die Woche davor, falls es eine gibt. */
  previous?: Neighbour | null
  /** Die Woche danach, falls es eine gibt. */
  next?: Neighbour | null
  /** Wann Karten dieser Woche abgegeben wurden. */
  cardTimes?: (Date | null | undefined)[]
}

const HOUR = 3_600_000
const MAX_DAYS = 120

export function checkWeekWindow(check: WindowCheck): void {
  const { number, startsAt, endsAt } = check

  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new WeekWindowError(`Woche ${number}: Der Beginn ist kein Datum.`)
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new WeekWindowError(`Woche ${number}: Der Einreichetermin ist kein Datum.`)
  }

  const span = endsAt.getTime() - startsAt.getTime()
  if (span <= 0) {
    throw new WeekWindowError(
      `Woche ${number}: Der Einreichetermin liegt vor dem Beginn der Woche.`,
    )
  }
  if (span < HOUR) {
    throw new WeekWindowError(`Woche ${number} wäre kürzer als eine Stunde.`)
  }
  if (span > MAX_DAYS * 24 * HOUR) {
    throw new WeekWindowError(`Woche ${number} würde über ${MAX_DAYS} Tage dauern.`)
  }

  const previous = check.previous
  if (previous && startsAt.getTime() < previous.endsAt.getTime()) {
    throw new WeekWindowError(
      `Woche ${number} würde beginnen, bevor Woche ${previous.number} eingereicht ist.`,
    )
  }

  const next = check.next
  if (next && endsAt.getTime() > next.startsAt.getTime()) {
    throw new WeekWindowError(
      `Woche ${number} würde noch laufen, wenn Woche ${next.number} schon begonnen hat.`,
    )
  }

  for (const time of check.cardTimes ?? []) {
    if (!time) continue
    if (time.getTime() < startsAt.getTime() || time.getTime() > endsAt.getTime()) {
      throw new WeekWindowError(
        `In Woche ${number} liegt bereits eine Karte vom ${formatStamp(time)}. Das neue Fenster würde sie ausschliessen.`,
      )
    }
  }
}

/** '16. November, 20:14' — nur zum Erklären, warum etwas abgelehnt wurde. */
function formatStamp(at: Date): string {
  return `${formatDay(zurichIsoDate(at))}, ${zurichTime(at)}`
}
