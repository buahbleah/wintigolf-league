/**
 * Die Stellschrauben der Liga.
 *
 * Alles, was der Admin drehen kann, steht hier an einem Ort — mit dem Wert, der
 * gilt, wenn er nichts dreht. Gespeichert wird pro Saison nur, was vom Standard
 * abweicht; `withDefaults` legt beides übereinander. Dadurch bekommt eine alte
 * Saison automatisch einen neuen Schalter, ohne dass irgendwo migriert werden
 * muss.
 *
 * Eine Änderung wirkt immer nur nach vorne. Jede gespielte Runde hält fest, mit
 * welchem Handicap sie gespielt wurde, und keine Auswertung rechnet eine alte
 * Runde neu.
 */

export interface LeagueSettings {
  /* ---------------------------------------------------------- Saison */
  /** Wie viele Spielwochen die Grundsaison hat. */
  weeks: number
  /** Wie viele der schlechtesten Wochen gestrichen werden. */
  droppedWeeks: number
  /** Wochen, in denen noch auf dem Startwert gespielt wird (Eichphase). */
  calibrationWeeks: number
  /** Obergrenze für die Teilnehmerzahl. Ist sie erreicht, greift kein Code mehr. */
  maxPlayers: number
  /** Wochentag, an dem eine Spielwoche beginnt. 1 = Montag. */
  weekStartsOn: number
  /** Uhrzeit der Deadline am letzten Tag, in Stunden (23 = 23:59). */
  deadlineHour: number

  /* ----------------------------------------------------------- Kurse */
  minLengthM: number
  maxLengthM: number
  /** Darf ein Kurs zweimal in derselben Saison vorkommen? */
  allowDuplicateCourses: boolean
  /** Tage vor Wochenbeginn, bis wann der Kurs eingetragen sein muss. */
  coursePickLeadDays: number

  /* ------------------------------------------- Einstellungen am Simulator */
  gimmieMetres: number
  wind: string
  greenSpeed: string
  firmness: string
  mulligans: boolean
  practiceRounds: boolean
  /** Darf der Admin im Einzelfall eine Runde ohne Zähler freigeben? */
  soloRoundsAllowed: boolean

  /* -------------------------------------------------------- Handicap */
  engine: 'whs' | 'congu'
  /** Anteil des Outdoor-Handicaps, mit dem das Indoor-Handicap startet. */
  startFactor: number
  /** Prozent des Course Handicap, das tatsächlich gespielt wird. */
  allowancePct: number
  /** Grösste Bewegung pro Runde, in beide Richtungen. */
  maxMovePerRound: number
  /** Das Handicap steigt nie mehr als so viel über den Tiefstwert der Saison. */
  softCap: number
  /** Ab so viel besser als das Handicap gibt es zusätzlich einen Schlag weniger. */
  exceptionalMinor: number
  /** Ab so viel besser gibt es zwei weniger. */
  exceptionalMajor: number
  minIndex: number
  maxIndex: number
  /** In der Eichphase läuft die Anpassung mit diesem Faktor. */
  calibrationFactor: number
  /** Pufferzone für das CONGU-Verfahren, in Stableford-Punkten. */
  bufferLow: number
  bufferHigh: number
  conguCutPerPoint: number
  conguRisePerPoint: number

  /* --------------------------------------------------------- Termine */
  hoursPerPlayer: number
  minSlotHours: number
  maxPlayersPerSlot: number

  /* -------------------------------------------------------- Playoffs */
  playoffSize: number
  thirdPlace: boolean
}

export const DEFAULT_SETTINGS: LeagueSettings = {
  weeks: 10,
  droppedWeeks: 2,
  calibrationWeeks: 3,
  maxPlayers: 12,
  weekStartsOn: 1,
  deadlineHour: 23,

  minLengthM: 5200,
  maxLengthM: 6300,
  allowDuplicateCourses: false,
  coursePickLeadDays: 1,

  gimmieMetres: 1.2,
  wind: 'aus',
  greenSpeed: 'Standard',
  firmness: 'Standard',
  mulligans: false,
  practiceRounds: false,
  soloRoundsAllowed: true,

  engine: 'whs',
  startFactor: 0.5,
  allowancePct: 100,
  maxMovePerRound: 2,
  softCap: 3,
  exceptionalMinor: 7,
  exceptionalMajor: 10,
  minIndex: -4,
  maxIndex: 54,
  calibrationFactor: 2,
  bufferLow: 35,
  bufferHigh: 37,
  conguCutPerPoint: 0.2,
  conguRisePerPoint: 0.2,

  hoursPerPlayer: 1,
  minSlotHours: 2,
  maxPlayersPerSlot: 4,

  playoffSize: 4,
  thirdPlace: false,
}

export function withDefaults(stored: Partial<LeagueSettings> | null | undefined): LeagueSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

/** Wie viele Wochen am Ende tatsächlich zählen. */
export function countingWeeks(settings: LeagueSettings): number {
  return Math.max(1, settings.weeks - settings.droppedWeeks)
}

/** Playoff-Runden, von der ersten bis zum Final. */
export function playoffRounds(settings: LeagueSettings): string[] {
  const names: string[] = []
  if (settings.playoffSize >= 8) names.push('quarter')
  if (settings.playoffSize >= 4) names.push('semi')
  names.push('final')
  return names
}

export const ROUND_LABELS: Record<string, string> = {
  quarter: 'Viertelfinal',
  semi: 'Halbfinal',
  final: 'Final',
  third: 'Spiel um Platz 3',
}

/**
 * Beschreibung der Felder für den Einstellungs-Screen. Steht hier, damit es
 * keinen zweiten Ort gibt, an dem eine neue Schraube eingetragen werden muss.
 */
export interface SettingField {
  key: keyof LeagueSettings
  label: string
  hint?: string
  kind: 'number' | 'decimal' | 'switch' | 'text' | 'choice'
  min?: number
  max?: number
  choices?: { value: string | number; label: string }[]
  /** Nach dem Saisonstart gesperrt, weil es Gespieltes umdeuten würde. */
  lockedAfterStart?: boolean
}

export const SETTING_GROUPS: { title: string; note?: string; fields: SettingField[] }[] = [
  {
    title: 'Saison',
    fields: [
      {
        key: 'weeks',
        label: 'Spielwochen',
        kind: 'number',
        min: 2,
        max: 30,
        lockedAfterStart: true,
        hint: 'Wie viele Wochen die Grundsaison dauert.',
      },
      {
        key: 'droppedWeeks',
        label: 'Streichresultate',
        kind: 'number',
        min: 0,
        max: 10,
        hint: 'So viele der schlechtesten Wochen fallen aus der Wertung.',
      },
      {
        key: 'calibrationWeeks',
        label: 'Eichphase',
        kind: 'number',
        min: 0,
        max: 10,
        lockedAfterStart: true,
        hint: 'Wochen, in denen noch auf dem Startwert gespielt wird.',
      },
      {
        key: 'maxPlayers',
        label: 'Maximale Spielerzahl',
        kind: 'number',
        min: 2,
        max: 60,
        hint: 'Ist sie erreicht, lässt der Liga-Code niemanden mehr herein.',
      },
      {
        key: 'deadlineHour',
        label: 'Deadline-Stunde',
        kind: 'number',
        min: 0,
        max: 23,
        hint: '23 heisst: Sonntag 23:59.',
      },
    ],
  },
  {
    title: 'Kurse',
    fields: [
      { key: 'minLengthM', label: 'Kürzester Kurs (m)', kind: 'number', min: 3000, max: 7000 },
      { key: 'maxLengthM', label: 'Längster Kurs (m)', kind: 'number', min: 3000, max: 8000 },
      {
        key: 'allowDuplicateCourses',
        label: 'Kurs darf doppelt vorkommen',
        kind: 'switch',
      },
      {
        key: 'coursePickLeadDays',
        label: 'Kurswahl bis (Tage vorher)',
        kind: 'number',
        min: 0,
        max: 14,
        hint: '1 heisst: Sonntag 23:59 vor der eigenen Woche.',
      },
    ],
  },
  {
    title: 'Am Simulator',
    note: 'Diese Werte stehen bei jeder Woche in der App, damit alle gleich einstellen.',
    fields: [
      { key: 'gimmieMetres', label: 'Gimmie (m)', kind: 'decimal', min: 0, max: 10 },
      { key: 'wind', label: 'Wind', kind: 'text' },
      { key: 'greenSpeed', label: 'Green Speed', kind: 'text' },
      { key: 'firmness', label: 'Firmness', kind: 'text' },
      { key: 'mulligans', label: 'Mulligans erlaubt', kind: 'switch' },
      { key: 'practiceRounds', label: 'Proberunden erlaubt', kind: 'switch' },
      {
        key: 'soloRoundsAllowed',
        label: 'Einzelrunden freigebbar',
        kind: 'switch',
        hint: 'Der Admin kann im Einzelfall eine Runde ohne Zähler bestätigen.',
      },
    ],
  },
  {
    title: 'Handicap',
    fields: [
      {
        key: 'engine',
        label: 'Verfahren',
        kind: 'choice',
        choices: [
          { value: 'whs', label: 'WHS — Score Differentials' },
          { value: 'congu', label: 'CONGU — Punkte gegen Pufferzone' },
        ],
        hint: 'WHS misst die tatsächliche Schlagzahl gegen das Rating und konvergiert schneller.',
      },
      {
        key: 'startFactor',
        label: 'Startwert vom Outdoor-Handicap',
        kind: 'decimal',
        min: 0.1,
        max: 1,
        lockedAfterStart: true,
        hint: '0.5 heisst: das Indoor-Handicap startet bei der Hälfte.',
      },
      { key: 'allowancePct', label: 'Allowance (%)', kind: 'number', min: 50, max: 100 },
      { key: 'maxMovePerRound', label: 'Grösste Bewegung pro Runde', kind: 'decimal', min: 0.1, max: 10 },
      { key: 'softCap', label: 'Soft Cap über Tiefstwert', kind: 'decimal', min: 0.5, max: 20 },
      {
        key: 'calibrationFactor',
        label: 'Faktor in der Eichphase',
        kind: 'decimal',
        min: 1,
        max: 4,
        hint: 'Doppelt heisst: ein zu tiefer Startwert korrigiert sich schneller.',
      },
      { key: 'exceptionalMinor', label: 'Aussergewöhnlich ab (−1.0)', kind: 'decimal', min: 1, max: 20 },
      { key: 'exceptionalMajor', label: 'Aussergewöhnlich ab (−2.0)', kind: 'decimal', min: 1, max: 25 },
      { key: 'bufferLow', label: 'Pufferzone von (Punkte)', kind: 'number', min: 20, max: 40 },
      { key: 'bufferHigh', label: 'Pufferzone bis (Punkte)', kind: 'number', min: 20, max: 45 },
      { key: 'conguCutPerPoint', label: 'CONGU: Abzug je Punkt', kind: 'decimal', min: 0, max: 2 },
      { key: 'conguRisePerPoint', label: 'CONGU: Zuschlag je Punkt', kind: 'decimal', min: 0, max: 2 },
      { key: 'minIndex', label: 'Tiefstes Handicap', kind: 'decimal', min: -10, max: 0 },
      { key: 'maxIndex', label: 'Höchstes Handicap', kind: 'decimal', min: 10, max: 54 },
    ],
  },
  {
    title: 'Termine',
    fields: [
      { key: 'hoursPerPlayer', label: 'Stunden pro Person', kind: 'decimal', min: 0.5, max: 3 },
      { key: 'minSlotHours', label: 'Kürzester Termin (h)', kind: 'decimal', min: 1, max: 6 },
      { key: 'maxPlayersPerSlot', label: 'Plätze pro Termin', kind: 'number', min: 2, max: 8 },
    ],
  },
  {
    title: 'Playoffs',
    fields: [
      {
        key: 'playoffSize',
        label: 'Playoff-Plätze',
        kind: 'choice',
        choices: [
          { value: 2, label: 'Nur der Final' },
          { value: 4, label: 'Top 4 — Halbfinal und Final' },
          { value: 8, label: 'Top 8 — Viertel, Halb, Final' },
        ],
      },
      { key: 'thirdPlace', label: 'Spiel um Platz 3', kind: 'switch' },
    ],
  },
]
