import { sql } from './db.js'
import { courseCard } from './rounds.js'
import { settingsOf, type SeasonRow } from './season.js'
import { scoreRound, scoreDifferential } from '../../src/core/scoring.js'
import { replaySeason, type HandicapRound } from '../../src/core/handicapEngine.js'

/**
 * Das Indoor-Handicap eines Spielers neu rechnen.
 *
 * Immer die ganze Geschichte, nie nur den letzten Schritt. Das kostet ein paar
 * Abfragen mehr und ist jede davon wert: das Ergebnis hängt dann nicht davon ab,
 * in welcher Reihenfolge Bestätigungen eintreffen, eine Korrektur des Admins
 * rechnet sauber durch, und ein zweimal ausgelöster Lauf ändert nichts.
 *
 * Was sich dabei nie ändert: mit welchem Handicap eine gespielte Runde gespielt
 * wurde. Das steht in der Runde selbst.
 */
export async function recomputeHandicap(
  season: SeasonRow,
  userId: string,
): Promise<{ before: number | null; after: number | null }> {
  const settings = settingsOf(season)

  const players = (await sql`
    SELECT starting_handicap, indoor_handicap FROM season_players
    WHERE season_id = ${season.id} AND user_id = ${userId}
  `) as any[]
  if (!players[0]) return { before: null, after: null }

  const before = players[0].indoor_handicap === null ? null : Number(players[0].indoor_handicap)
  const starting = players[0].starting_handicap === null ? null : Number(players[0].starting_handicap)
  if (starting === null) return { before, after: before }

  /* Alle bestätigten Runden in Wochenreihenfolge. Unbestätigte zählen für die
     Tabelle vorläufig mit, fürs Handicap aber nicht — dort wäre eine spätere
     Ablehnung sonst nicht mehr einzufangen. */
  const rounds = (await sql`
    SELECT r.id, r.course_id, r.handicap_index, w.number AS week_number
    FROM rounds r
    JOIN weeks w ON w.id = r.week_id
    WHERE r.season_id = ${season.id} AND r.user_id = ${userId} AND r.status = 'confirmed'
    ORDER BY w.number, r.created_at
  `) as any[]

  const cards = new Map<string, Awaited<ReturnType<typeof courseCard>>>()
  const history: HandicapRound[] = []

  for (const round of rounds) {
    if (!cards.has(round.course_id)) cards.set(round.course_id, await courseCard(round.course_id))
    const card = cards.get(round.course_id)!

    const holes = (await sql`
      SELECT number, strokes FROM round_holes WHERE round_id = ${round.id}
    `) as any[]
    const strokes: Record<number, number | null> = {}
    for (const hole of holes) strokes[hole.number] = hole.strokes

    const result = scoreRound(card, strokes, Number(round.handicap_index), settings.allowancePct)
    history.push({
      weekNumber: round.week_number,
      points: result.points,
      differential: scoreDifferential(result.adjustedGross, card),
    })
  }

  const steps = replaySeason(starting, history, settings)
  const after = steps.length ? steps[steps.length - 1].after : starting

  await sql`
    UPDATE season_players SET indoor_handicap = ${after}
    WHERE season_id = ${season.id} AND user_id = ${userId}
  `

  /* Der Verlauf wird mitgeschrieben, nicht fortgeschrieben: er ist die Ansicht
     auf dieselbe Rechnung und wird darum bei jedem Lauf neu gesetzt. */
  await sql`
    DELETE FROM handicap_events WHERE season_id = ${season.id} AND user_id = ${userId}
      AND engine <> 'manual'
  `
  if (steps.length) {
    await sql`
      INSERT INTO handicap_events (season_id, user_id, round_id, before_value, after_value,
                                   differential, engine, reason, ordinal, created_at)
      SELECT ${season.id}, ${userId}, rid::uuid, b, a, d, ${settings.engine}, why, ord, now()
      FROM unnest(
        ${steps.map((_, i) => rounds[i]?.id ?? null)}::text[],
        ${steps.map((s) => s.before)}::numeric[],
        ${steps.map((s) => s.after)}::numeric[],
        ${steps.map((s) => s.differential)}::numeric[],
        ${steps.map((s) => s.reason)}::text[],
        ${steps.map((_, i) => i + 1)}::int[]
      ) AS t(rid, b, a, d, why, ord)
    `
  }

  return { before, after }
}
