/**
 * Prüfung einer ausgelesenen Scorecard.
 *
 * Aus einem Bild gelesene Zahlen sind Vorschläge, keine Tatsachen. Bevor eine
 * davon ins Formular kommt, muss die Karte in sich stimmen — dieselben Regeln,
 * die auch beim Eintragen von Hand gelten.
 *
 * Der Stroke-Index ist der heikelste Wert: ein falscher fällt niemandem auf,
 * verschiebt aber die Vorgabeschläge auf die falschen Löcher und verfälscht
 * damit jede Netto-Rechnung der Woche. Darum wird eine Karte, bei der auch nur
 * ein Index doppelt vorkommt, ganz abgewiesen — lieber abtippen als still
 * danebenliegen.
 */

export interface RawHole {
  number?: number
  par?: number
  strokeIndex?: number
  length?: number | null
}

export interface CleanHole {
  number: number
  par: number
  strokeIndex: number
  length: number | null
}

export class ScorecardError extends Error {}

export function validateScorecard(holes: RawHole[]): CleanHole[] {
  if (!Array.isArray(holes) || holes.length !== 18) {
    throw new ScorecardError(
      `Auf dem Bild waren ${Array.isArray(holes) ? holes.length : 0} statt achtzehn Löcher zu lesen. Trag die Karte von Hand ein.`,
    )
  }

  const seenIndex = new Set<number>()
  const seenNumber = new Set<number>()
  const clean: CleanHole[] = []

  for (const hole of holes) {
    const number = hole.number
    if (!Number.isInteger(number) || number! < 1 || number! > 18) {
      throw new ScorecardError('Die Lochnummern waren nicht lesbar.')
    }
    if (seenNumber.has(number!)) throw new ScorecardError(`Loch ${number} kam zweimal vor.`)
    seenNumber.add(number!)

    const par = hole.par
    if (!Number.isInteger(par) || par! < 3 || par! > 6) {
      throw new ScorecardError(`Loch ${number}: Par ${par} ergibt keinen Sinn.`)
    }

    const strokeIndex = hole.strokeIndex
    if (!Number.isInteger(strokeIndex) || strokeIndex! < 1 || strokeIndex! > 18) {
      throw new ScorecardError(`Loch ${number}: Der Stroke-Index war nicht lesbar.`)
    }
    if (seenIndex.has(strokeIndex!)) {
      throw new ScorecardError(
        `Der Stroke-Index ${strokeIndex} kam zweimal vor — das Bild wurde nicht sauber gelesen.`,
      )
    }
    seenIndex.add(strokeIndex!)

    clean.push({
      number: number!,
      par: par!,
      strokeIndex: strokeIndex!,
      length:
        hole.length === null || hole.length === undefined || !Number.isFinite(hole.length)
          ? null
          : Math.round(hole.length),
    })
  }

  return clean.sort((a, b) => a.number - b.number)
}

/** Yards oder Meter — die Karte sagt es, gerechnet wird in Metern. */
export function toMetres(value: number | null | undefined, unit: string): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.round(unit === 'yards' ? value * 0.9144 : value)
}

/**
 * Was beim Auslesen einer Karte herauskommt.
 *
 * Dieselbe Form auf beiden Seiten: der Server gibt sie heraus, das Formular
 * nimmt sie entgegen. Ein Tee ohne Rating ist normal — nicht jede Karte zeigt
 * eines —, achtzehn Löcher sind es dagegen immer, sonst kommt gar nichts.
 */
export interface ReadTee {
  name: string
  lengthM: number | null
  courseRating: number | null
  slopeRating: number | null
}

export interface ReadCard {
  courseName: string | null
  unit: 'yards' | 'metres'
  par: number
  holes: { number: number; par: number; strokeIndex: number; lengthM: number | null }[]
  tees: ReadTee[]
}
