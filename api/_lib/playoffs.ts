import { sql } from './db.js'
import { HttpError } from './http.js'
import { courseCard } from './rounds.js'
import { settingsOf, type SeasonRow } from './season.js'
import { scoreRound } from '../../src/core/scoring.js'
import { bracketPairs, bracketRounds, playMatch, type MatchSide } from '../../src/core/matchplay.js'
import { buildWeeks } from '../../src/core/dates.js'
import { notify } from './notify.js'

/**
 * Die Playoffs.
 *
 * Nach der Grundsaison treten die Besten im K.-o.-System an. Das Bracket wird
 * einmal vollständig angelegt — mit leeren Plätzen für die späteren Runden —
 * damit von Anfang an sichtbar ist, wer auf wen treffen könnte.
 *
 * Wer weiterkommt, rechnet sich aus den Karten: beide Spieler tragen ihre Runde
 * ein wie immer, bestätigen sich gegenseitig, und daraus entsteht «3&2». Nur das
 * Stechen nach einem geteilten Match wird eingetragen, weil es sich nicht aus
 * achtzehn Löchern ergibt.
 */

/** Bringt das Bracket in Gang: Wochen anlegen, Paarungen setzen. */
export async function startPlayoffs(season: SeasonRow, table: { userId: string }[]) {
  const settings = settingsOf(season)
  const size = settings.playoffSize

  const qualified = table.slice(0, size)
  if (qualified.length < size) {
    throw new HttpError(
      400,
      `Für ${size} Playoff-Plätze braucht es ${size} Spieler mit Resultaten.`,
    )
  }

  /**
   * Ein zweiter Anlauf ist erlaubt, solange im Playoff noch nichts passiert ist.
   * Das ist kein Komfort, sondern Notwendigkeit: diese Funktion schreibt viele
   * Zeilen und läuft nicht in einer Transaktion — bricht sie in der Mitte ab,
   * muss man sie wiederholen können, statt mit einem halben Bracket dazustehen.
   */
  const played = (await sql`
    SELECT 1 FROM rounds r JOIN weeks w ON w.id = r.week_id
    WHERE r.season_id = ${season.id} AND w.kind = 'playoff'
    LIMIT 1
  `) as any[]
  if (played.length) throw new HttpError(409, 'Im Playoff wurde schon gespielt.')

  const decided = (await sql`
    SELECT 1 FROM matches WHERE season_id = ${season.id} AND winner_id IS NOT NULL LIMIT 1
  `) as any[]
  if (decided.length) throw new HttpError(409, 'Die Playoffs laufen schon.')

  await sql`DELETE FROM matches WHERE season_id = ${season.id}`
  await sql`DELETE FROM weeks WHERE season_id = ${season.id} AND kind = 'playoff'`

  const last = (await sql`
    SELECT number, ends_at FROM weeks
    WHERE season_id = ${season.id} AND kind = 'regular'
    ORDER BY number DESC LIMIT 1
  `) as any[]
  if (!last[0]) throw new HttpError(400, 'Es gibt noch keine Grundsaison.')

  const rounds = bracketRounds(size)
  if (settings.thirdPlace && size >= 4) rounds.splice(rounds.length - 1, 0, { name: 'third', matches: 1 })

  /* Eine Woche pro Runde, direkt im Anschluss an die Grundsaison. Das Spiel um
     Platz 3 läuft in derselben Woche wie der Final. */
  const startDate = new Date(new Date(last[0].ends_at).getTime() + 86400_000)
    .toISOString()
    .slice(0, 10)
  const playoffWeeks = rounds.filter((r) => r.name !== 'third').length
  const windows = buildWeeks({
    startDate,
    weeks: playoffWeeks,
    deadlineHour: settings.deadlineHour,
  })

  let weekNumber = last[0].number
  let windowIndex = 0
  const weekByRound = new Map<string, string>()

  for (const round of rounds) {
    if (round.name === 'third') {
      // Platz 3 teilt sich die Woche mit dem Final.
      weekByRound.set('third', weekByRound.get('final') ?? '')
      continue
    }
    weekNumber++
    const window = windows[windowIndex++]
    const created = (await sql`
      INSERT INTO weeks (season_id, number, kind, playoff_round, starts_at, ends_at, status)
      VALUES (${season.id}, ${weekNumber}, 'playoff', ${round.name},
              ${window.startsAt.toISOString()}, ${window.endsAt.toISOString()}, 'upcoming')
      RETURNING id
    `) as any[]
    weekByRound.set(round.name, created[0].id)
    if (round.name === 'final' && settings.thirdPlace && size >= 4) {
      weekByRound.set('third', created[0].id)
    }
  }

  // Die erste Runde bekommt die Paarungen, die späteren leere Plätze.
  for (const round of rounds) {
    const weekId = weekByRound.get(round.name)
    if (!weekId) continue

    if (round.name === rounds[0].name) {
      const pairs = bracketPairs(size)
      for (const [slot, [homeSeed, awaySeed]] of pairs.entries()) {
        await sql`
          INSERT INTO matches (season_id, week_id, round_name, slot, home_id, away_id,
                               home_seed, away_seed)
          VALUES (${season.id}, ${weekId}, ${round.name}, ${slot + 1},
                  ${qualified[homeSeed - 1].userId}, ${qualified[awaySeed - 1].userId},
                  ${homeSeed}, ${awaySeed})
        `
      }
    } else {
      /* Das kleine Finale läuft in derselben Woche wie der Final, und die
         Plätze einer Woche sind eindeutig — also bekommt es den zweiten. */
      const first = round.name === 'third' ? 2 : 1
      for (let slot = first; slot < first + round.matches; slot++) {
        await sql`
          INSERT INTO matches (season_id, week_id, round_name, slot)
          VALUES (${season.id}, ${weekId}, ${round.name}, ${slot})
        `
      }
    }
  }

  await sql`UPDATE seasons SET status = 'playoffs', updated_at = now() WHERE id = ${season.id}`

  for (const [index, player] of qualified.entries()) {
    await notify({
      userId: player.userId,
      kind: 'playoff-start',
      title: `Die Playoffs stehen — du bist als Nummer ${index + 1} gesetzt`,
      body: 'Schau dir das Bracket an und trag deinen Kurs ein, wenn du dran bist.',
      link: '#/playoffs',
      dedupeKey: `playoff-start:${season.id}:${player.userId}`,
    })
  }

  return { rounds: rounds.map((r) => r.name), qualified: qualified.length }
}

export interface MatchView {
  id: string
  roundName: string
  slot: number
  weekId: string
  weekNumber: number
  startsAt: string
  endsAt: string
  home: { id: string; name: string; seed: number | null; avatarUrl: string | null } | null
  away: { id: string; name: string; seed: number | null; avatarUrl: string | null } | null
  courseId: string | null
  courseName: string | null
  /** Wer den Kurs bestimmt: der höher gesetzte Spieler. */
  pickerId: string | null
  winnerId: string | null
  result: string | null
  decidedBy: string | null
  /** Stand aus den Karten, solange das Match läuft. */
  live: { label: string; standing: number; played: number; allSquare: boolean } | null
  cards: { userId: string; roundId: string; status: string; points: number }[]
}

/** Das Bracket mit allem, was die Ansicht braucht. */
export async function bracketState(season: SeasonRow): Promise<MatchView[]> {
  const rows = (await sql`
    SELECT m.id, m.round_name, m.slot, m.week_id, m.home_id, m.away_id, m.home_seed, m.away_seed,
           m.winner_id, m.result, m.decided_by, m.course_id,
           h.name AS home_name, h.avatar_url AS home_avatar,
           a.name AS away_name, a.avatar_url AS away_avatar,
           c.name AS course_name,
           w.number AS week_number, w.starts_at, w.ends_at
    FROM matches m
    JOIN weeks w ON w.id = m.week_id
    LEFT JOIN users h ON h.id = m.home_id
    LEFT JOIN users a ON a.id = m.away_id
    LEFT JOIN courses c ON c.id = m.course_id
    WHERE m.season_id = ${season.id}
    ORDER BY w.number, m.round_name, m.slot
  `) as any[]

  const out: MatchView[] = []
  for (const row of rows) {
    const cards = (await sql`
      SELECT r.id, r.user_id, r.status, r.handicap_index, r.playing_handicap, r.course_id
      FROM rounds r
      WHERE r.week_id = ${row.week_id} AND r.user_id IN (${row.home_id}, ${row.away_id})
    `) as any[]

    let live: MatchView['live'] = null
    if (row.course_id && cards.length === 2) {
      const card = await courseCard(row.course_id)
      const sides: Record<string, MatchSide> = {}
      const summary: MatchView['cards'] = []

      for (const round of cards) {
        const holes = (await sql`
          SELECT number, strokes FROM round_holes WHERE round_id = ${round.id}
        `) as any[]
        const strokes: Record<number, number | null> = {}
        for (const hole of holes) strokes[hole.number] = hole.strokes
        sides[round.user_id] = {
          userId: round.user_id,
          name: round.user_id === row.home_id ? row.home_name : row.away_name,
          playingHandicap: round.playing_handicap,
          strokes,
        }
        const result = scoreRound(card, strokes, Number(round.handicap_index))
        summary.push({
          userId: round.user_id,
          roundId: round.id,
          status: round.status,
          points: result.points,
        })
      }

      if (sides[row.home_id] && sides[row.away_id]) {
        const match = playMatch(card, sides[row.home_id], sides[row.away_id])
        live = {
          label: match.label,
          standing: match.standing,
          played: match.played,
          allSquare: match.allSquare,
        }
      }
      out.push({ ...view(row), live, cards: summary })
      continue
    }

    out.push({ ...view(row), live, cards: [] })
  }
  return out
}

function view(row: any): Omit<MatchView, 'live' | 'cards'> {
  return {
    id: row.id,
    roundName: row.round_name,
    slot: row.slot,
    weekId: row.week_id,
    weekNumber: row.week_number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    home: row.home_id
      ? { id: row.home_id, name: row.home_name, seed: row.home_seed, avatarUrl: row.home_avatar }
      : null,
    away: row.away_id
      ? { id: row.away_id, name: row.away_name, seed: row.away_seed, avatarUrl: row.away_avatar }
      : null,
    courseId: row.course_id,
    courseName: row.course_name,
    // Der höher gesetzte Spieler ist der mit der kleineren Nummer.
    pickerId:
      row.home_seed !== null && row.away_seed !== null
        ? row.home_seed <= row.away_seed
          ? row.home_id
          : row.away_id
        : row.home_id,
    winnerId: row.winner_id,
    result: row.result,
    decidedBy: row.decided_by,
  }
}

/**
 * Entschiedene Matches auswerten und die Sieger weiterschieben.
 *
 * Läuft nach jeder Bestätigung und nach jedem Eingriff des Admins. Wie der
 * Handicap-Motor rechnet sie immer das ganze Bracket durch, statt Schritte
 * fortzuschreiben — zweimal ausgeführt ändert sich nichts.
 */
export async function advanceBracket(season: SeasonRow): Promise<void> {
  const settings = settingsOf(season)
  const matches = await bracketState(season)

  for (const match of matches) {
    if (match.winnerId || !match.home || !match.away || !match.courseId) continue

    const both = match.cards.length === 2 && match.cards.every((c) => c.status === 'confirmed')
    if (!both || !match.live) continue
    if (match.live.played < 18) continue
    if (match.live.allSquare) continue // wartet aufs Stechen

    const winnerId = match.live.standing > 0 ? match.home.id : match.away.id
    await sql`
      UPDATE matches SET winner_id = ${winnerId}, result = ${match.live.label},
                         decided_by = 'play'
      WHERE id = ${match.id}
    `
  }

  await fillNextRounds(season.id)

  /* Ist der Final entschieden, ist die Saison vorbei. */
  const final = (await sql`
    SELECT winner_id FROM matches WHERE season_id = ${season.id} AND round_name = 'final'
  `) as any[]
  if (final[0]?.winner_id) {
    await sql`
      UPDATE seasons SET status = 'finished', updated_at = now()
      WHERE id = ${season.id} AND status <> 'finished'
    `
    await notify({
      userId: final[0].winner_id,
      kind: 'champion',
      title: '🏆 Du bist Champion',
      body: `${season.name} geht an dich.`,
      link: '#/playoffs',
      dedupeKey: `champion:${season.id}`,
    })
  }

  void settings
}

/** Sieger in die nächste Runde setzen, Verlierer der Halbfinals ins kleine Finale. */
async function fillNextRounds(seasonId: string): Promise<void> {
  const matches = (await sql`
    SELECT id, round_name, slot, home_id, away_id, winner_id FROM matches
    WHERE season_id = ${seasonId}
    ORDER BY slot
  `) as any[]

  const by = (name: string) => matches.filter((m) => m.round_name === name)
  const order = ['quarter', 'semi', 'final']

  for (let i = 0; i < order.length - 1; i++) {
    const from = by(order[i])
    const to = by(order[i + 1])
    if (!from.length || !to.length) continue

    for (const [index, target] of to.entries()) {
      const left = from[index * 2]
      const right = from[index * 2 + 1]
      if (!left || !right) continue
      const home = left.winner_id
      const away = right.winner_id
      if (home && target.home_id !== home) {
        await sql`UPDATE matches SET home_id = ${home} WHERE id = ${target.id}`
      }
      if (away && target.away_id !== away) {
        await sql`UPDATE matches SET away_id = ${away} WHERE id = ${target.id}`
      }
    }
  }

  const third = by('third')[0]
  const semis = by('semi')
  if (third && semis.length === 2 && semis.every((s) => s.winner_id)) {
    const losers = semis.map((s) => (s.winner_id === s.home_id ? s.away_id : s.home_id))
    if (third.home_id !== losers[0]) {
      await sql`UPDATE matches SET home_id = ${losers[0]} WHERE id = ${third.id}`
    }
    if (third.away_id !== losers[1]) {
      await sql`UPDATE matches SET away_id = ${losers[1]} WHERE id = ${third.id}`
    }
  }
}
