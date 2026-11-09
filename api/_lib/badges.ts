import { sql } from './db.js'
import { notify } from './notify.js'
import type { RoundResult } from '../../src/core/scoring.js'

/**
 * Abzeichen.
 *
 * Vergeben wird nur, was an einer einzelnen Runde festzumachen ist — ein Eagle
 * bleibt ein Eagle, auch wenn später noch zwölf Runden kommen. Alles, was sich
 * aus dem Stand der Liga ergibt (Wochensiege, grösster Handicap-Cut, beste
 * Runde der Saison), wird nicht gespeichert, sondern gerechnet: gespeicherte
 * Ranglisten laufen auseinander, gerechnete nie.
 */

export const BADGE_LABELS: Record<string, { label: string; icon: string }> = {
  'hole-in-one': { label: 'Hole-in-One', icon: '🎯' },
  albatross: { label: 'Albatros', icon: '🦅' },
  eagle: { label: 'Eagle', icon: '🦅' },
  'first-round': { label: 'Erste Runde', icon: '🏁' },
  'all-weeks': { label: 'Alle Wochen gespielt', icon: '📅' },
}

/** Nach einer Bestätigung: was diese Runde hergibt. */
export async function awardForRound(
  seasonId: string,
  userId: string,
  roundId: string,
  result: RoundResult,
): Promise<string[]> {
  const earned: string[] = []

  for (const hole of result.holes) {
    if (hole.strokes === null) continue
    if (hole.strokes === 1 && hole.par >= 3) {
      earned.push(await give(seasonId, userId, 'hole-in-one', roundId, { hole: hole.number }))
    } else if (hole.toPar !== null && hole.toPar <= -3) {
      earned.push(await give(seasonId, userId, 'albatross', roundId, { hole: hole.number }))
    } else if (hole.toPar === -2) {
      earned.push(await give(seasonId, userId, 'eagle', roundId, { hole: hole.number }))
    }
  }

  const rounds = (await sql`
    SELECT count(*)::int AS n FROM rounds
    WHERE season_id = ${seasonId} AND user_id = ${userId} AND status = 'confirmed'
  `) as any[]
  if (rounds[0].n === 1) {
    earned.push(await give(seasonId, userId, 'first-round', roundId, {}))
  }

  const weeks = (await sql`
    SELECT count(*)::int AS n FROM weeks WHERE season_id = ${seasonId} AND kind = 'regular'
  `) as any[]
  if (rounds[0].n >= weeks[0].n && weeks[0].n > 0) {
    earned.push(await give(seasonId, userId, 'all-weeks', roundId, {}))
  }

  const fresh = earned.filter(Boolean)
  for (const kind of fresh) {
    const badge = BADGE_LABELS[kind]
    if (!badge) continue
    await notify({
      userId,
      kind: 'badge',
      title: `${badge.icon} ${badge.label}`,
      body: 'Ein neues Abzeichen für dich.',
      link: `#/spieler/${userId}`,
    })
  }
  return fresh
}

/** Vergibt ein Abzeichen, wenn es das für diese Runde noch nicht gibt. */
async function give(
  seasonId: string,
  userId: string,
  kind: string,
  roundId: string,
  detail: Record<string, unknown>,
): Promise<string> {
  const unique =
    kind === 'first-round' || kind === 'all-weeks'
      ? ((await sql`
          SELECT 1 FROM badges
          WHERE season_id = ${seasonId} AND user_id = ${userId} AND kind = ${kind}
        `) as any[])
      : ((await sql`
          SELECT 1 FROM badges
          WHERE season_id = ${seasonId} AND user_id = ${userId} AND kind = ${kind}
            AND round_id = ${roundId} AND detail = ${JSON.stringify(detail)}::jsonb
        `) as any[])
  if (unique.length) return ''

  await sql`
    INSERT INTO badges (season_id, user_id, kind, detail, round_id)
    VALUES (${seasonId}, ${userId}, ${kind}, ${JSON.stringify(detail)}::jsonb, ${roundId})
  `
  return kind
}

/** Abzeichen eines Spielers, für die Profilseite. */
export async function badgesOf(seasonId: string, userId: string) {
  const rows = (await sql`
    SELECT kind, detail, round_id, created_at FROM badges
    WHERE season_id = ${seasonId} AND user_id = ${userId}
    ORDER BY created_at
  `) as any[]

  const counts = new Map<string, { kind: string; label: string; icon: string; count: number }>()
  for (const row of rows) {
    const meta = BADGE_LABELS[row.kind] ?? { label: row.kind, icon: '🏅' }
    const entry = counts.get(row.kind) ?? { kind: row.kind, ...meta, count: 0 }
    entry.count++
    counts.set(row.kind, entry)
  }
  return [...counts.values()]
}
