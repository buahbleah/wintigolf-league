import { randomInt } from 'node:crypto'
import { sql } from './db.js'
import { HttpError } from './http.js'
import { withDefaults, type LeagueSettings } from '../../src/core/settings.js'

/**
 * Was alle Saison-Endpunkte gemeinsam brauchen.
 */

export interface SeasonRow {
  id: string
  name: string
  status: 'draft' | 'active' | 'playoffs' | 'finished' | 'archived'
  join_code: string
  settings: Partial<LeagueSettings>
  started_at: string | null
  paused_at: string | null
}

/** Die Saison, um die es gerade geht: die jüngste, die noch nicht vorbei ist. */
export async function currentSeason(): Promise<SeasonRow | null> {
  const rows = (await sql`
    SELECT id, name, status, join_code, settings, started_at, paused_at
    FROM seasons
    WHERE status IN ('draft','active','playoffs')
    ORDER BY created_at DESC
    LIMIT 1
  `) as any[]
  return rows[0] ?? null
}

export async function seasonById(id: string): Promise<SeasonRow> {
  const rows = (await sql`
    SELECT id, name, status, join_code, settings, started_at, paused_at
    FROM seasons WHERE id = ${id}
  `) as any[]
  if (!rows[0]) throw new HttpError(404, 'Diese Saison gibt es nicht.')
  return rows[0]
}

export function settingsOf(season: SeasonRow): LeagueSettings {
  return withDefaults(season.settings)
}

/**
 * Ein Code, den man am Telefon durchgeben kann: keine Vokale, also auch kein
 * Zufallswort, und keine Zeichen, die sich verwechseln lassen (0/O, 1/I/L).
 */
export function makeJoinCode(): string {
  const alphabet = 'BCDFGHJKMNPQRSTVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

export async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeJoinCode()
    const taken = (await sql`SELECT 1 FROM seasons WHERE join_code = ${code}`) as any[]
    if (!taken.length) return code
  }
  throw new HttpError(500, 'Es liess sich kein freier Liga-Code finden.')
}

/** Nur Zahlen und Wahrheitswerte, die es wirklich gibt — alles andere fliegt raus. */
export function cleanSettings(input: unknown): Partial<LeagueSettings> {
  if (!input || typeof input !== 'object') return {}
  const defaults = withDefaults(null) as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(key in defaults)) continue
    const expected = typeof defaults[key]
    if (expected === 'number') {
      const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
      if (!Number.isFinite(num)) throw new HttpError(400, `${key} muss eine Zahl sein.`)
      out[key] = Math.round(num * 100) / 100
    } else if (expected === 'boolean') {
      out[key] = Boolean(value)
    } else {
      out[key] = String(value).slice(0, 60)
    }
  }

  const merged = { ...defaults, ...out } as unknown as LeagueSettings
  if (merged.droppedWeeks >= merged.weeks) {
    throw new HttpError(400, 'Es können nicht so viele Wochen gestrichen werden, wie es Wochen gibt.')
  }
  if (merged.minLengthM >= merged.maxLengthM) {
    throw new HttpError(400, 'Der kürzeste Kurs muss kürzer sein als der längste.')
  }
  if (merged.bufferLow > merged.bufferHigh) {
    throw new HttpError(400, 'Die Pufferzone läuft verkehrt herum.')
  }
  if (merged.engine !== 'whs' && merged.engine !== 'congu') {
    throw new HttpError(400, 'Dieses Handicap-Verfahren gibt es nicht.')
  }
  return out as Partial<LeagueSettings>
}

/** Spielt jemand in dieser Saison mit? */
export async function requireMember(seasonId: string, userId: string): Promise<void> {
  const rows = (await sql`
    SELECT 1 FROM season_players WHERE season_id = ${seasonId} AND user_id = ${userId}
  `) as any[]
  if (!rows.length) throw new HttpError(403, 'Du spielst in dieser Saison nicht mit.')
}
