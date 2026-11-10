/**
 * Zeit.
 *
 * Die Liga lebt in Europe/Zurich: eine Woche beginnt am Montag um 00:00 und
 * endet am Sonntag um 23:59 — Schweizer Zeit, nicht UTC. Zwischen Ende Oktober
 * und Ende März liegt eine Stunde Unterschied dazwischen, und genau in dieser
 * Zeit startet die Saison. Darum rechnet dieses Modul die Ortszeit explizit um,
 * statt sich auf die Zeitzone des Servers zu verlassen — die ist auf Vercel UTC
 * und auf dem Entwicklungsrechner etwas anderes.
 */

export const ZONE = 'Europe/Zurich'

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Verschiebung der Zone gegenüber UTC, in Minuten, zu diesem Zeitpunkt. */
function offsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    FORMATTER.formatToParts(at)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  )
  return (asUtc - at.getTime()) / 60000
}

/**
 * Ein Zeitpunkt, angegeben als Schweizer Ortszeit, als echter Moment.
 *
 * Zweimal gerechnet, weil die Verschiebung selbst vom Ergebnis abhängt: der
 * erste Durchgang schätzt mit der Verschiebung am UTC-Zeitpunkt, der zweite
 * korrigiert, falls dazwischen die Zeitumstellung liegt.
 */
export function fromZurich(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = new Date(naive - offsetMinutes(new Date(naive)) * 60000)
  guess = new Date(naive - offsetMinutes(guess) * 60000)
  return guess
}

/** 'YYYY-MM-DD' als Ortszeit zur angegebenen Stunde. */
export function fromZurichDate(isoDate: string, hour = 0, minute = 0): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Kein Datum: ${isoDate}`)
  return fromZurich(y, m, d, hour, minute)
}

/** Die Kalenderteile eines Moments in Schweizer Ortszeit. */
export function zurichParts(at: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const parts = Object.fromEntries(
    FORMATTER.formatToParts(at)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  // Wochentag über den UTC-Tag desselben Kalenderdatums: 1 = Montag.
  const weekday = ((new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7) + 1
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    weekday,
  }
}

/** Datum als 'YYYY-MM-DD' in Schweizer Ortszeit. */
export function zurichIsoDate(at: Date): string {
  const p = zurichParts(at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return shifted.toISOString().slice(0, 10)
}

/** Der Wochentag eines 'YYYY-MM-DD', 1 = Montag. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}

/** Das nächste Vorkommen dieses Wochentags, den Tag selbst eingeschlossen. */
export function nextWeekday(isoDate: string, weekday: number): string {
  const diff = (weekday - weekdayOf(isoDate) + 7) % 7
  return addDays(isoDate, diff)
}

export interface WeekWindow {
  number: number
  /** Erster Tag, 'YYYY-MM-DD' in Ortszeit. */
  startDate: string
  /** Letzter Tag, 'YYYY-MM-DD' in Ortszeit. */
  endDate: string
  startsAt: Date
  endsAt: Date
}

/**
 * Die Fenster einer Saison: fortlaufende Wochen ab dem Starttag.
 *
 * `pauseAfter` nimmt Wochennummern, nach denen eine Woche Pause eingelegt wird —
 * damit lassen sich die Feiertage überspringen, ohne dass jede Woche einzeln
 * verschoben werden muss.
 */
export function buildWeeks(options: {
  startDate: string
  weeks: number
  deadlineHour?: number
  pauseAfter?: number[]
}): WeekWindow[] {
  const { startDate, weeks, deadlineHour = 23, pauseAfter = [] } = options
  const out: WeekWindow[] = []
  let cursor = startDate

  for (let number = 1; number <= weeks; number++) {
    const endDate = addDays(cursor, 6)
    out.push({
      number,
      startDate: cursor,
      endDate,
      startsAt: fromZurichDate(cursor, 0, 0),
      endsAt: fromZurichDate(endDate, deadlineHour, 59),
    })
    cursor = addDays(cursor, pauseAfter.includes(number) ? 14 : 7)
  }
  return out
}

/* ------------------------------------------------------------ Anzeige */

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

/** '8. Dezember' — ohne Jahr, weil eine Saison in einem Winter liegt. */
export function formatDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${d}. ${MONTHS[m - 1]}`
}

export function formatRange(startDate: string, endDate: string): string {
  const [, sm, sd] = startDate.split('-').map(Number)
  const [, em, ed] = endDate.split('-').map(Number)
  if (sm === em) return `${sd}.–${ed}. ${MONTHS[em - 1]}`
  return `${sd}. ${MONTHS[sm - 1]} – ${ed}. ${MONTHS[em - 1]}`
}

/** 'Mi 19:00' für Termine. */
export function formatDateTime(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at
  const p = zurichParts(date)
  return `${WEEKDAYS[p.weekday - 1]} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** 'noch 3 Tage', 'noch 4 Stunden', 'abgelaufen'. */
export function timeLeft(until: Date | string, now = new Date()): string {
  const target = typeof until === 'string' ? new Date(until) : until
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return 'abgelaufen'
  const hours = Math.floor(ms / 3600_000)
  if (hours < 1) return `noch ${Math.max(1, Math.floor(ms / 60_000))} Minuten`
  if (hours < 24) return `noch ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.floor(hours / 24)
  return `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`
}

/* ------------------------------------------------- Termine verschieben */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 'HH:MM' eines Moments in Schweizer Ortszeit. */
export function zurichTime(at: Date | string): string {
  const p = zurichParts(typeof at === 'string' ? new Date(at) : at)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** 'YYYY-MM-DD' plus 'HH:MM' als Ortszeit zu einem Moment. */
export function fromZurichDateTime(isoDate: string, time: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    throw new Error(`Keine Uhrzeit: ${time}`)
  }
  return fromZurichDate(isoDate, hour, minute)
}

/** Ganze Tage zwischen zwei 'YYYY-MM-DD'. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * Einen Termin um Tage und Minuten verschieben — nach der Uhr, nicht nach der
 * Dauer.
 *
 * Der Unterschied zählt: zwischen Ende Oktober und Ende März springt die Uhr,
 * und genau da liegt die Saison. Wer eine Woche «um sieben Tage» verschiebt,
 * meint denselben Wochentag zur selben Uhrzeit — nicht 168 Stunden später, was
 * über die Zeitumstellung hinweg eine Stunde danebenläge.
 */
export function shiftZurichBy(at: Date | string, days: number, minutes = 0): Date {
  const p = zurichParts(typeof at === 'string' ? new Date(at) : at)
  let total = p.hour * 60 + p.minute + minutes
  const carry = Math.floor(total / 1440)
  total = ((total % 1440) + 1440) % 1440
  const iso = addDays(`${p.year}-${pad(p.month)}-${pad(p.day)}`, days + carry)
  const [y, m, d] = iso.split('-').map(Number)
  return fromZurich(y, m, d, Math.floor(total / 60), total % 60)
}
