import { sql } from './db.js'
import { HttpError } from './http.js'
import { scoreRound, type CourseCard } from '../../src/core/scoring.js'

/**
 * Eine Runde laden und auswerten.
 *
 * Gespeichert sind nur Kopf und Lochliste. Punkte, Netto, korrigiertes Brutto
 * und Differential entstehen hier bei jedem Lesen neu — es gibt keine zweite
 * Wahrheit, die irgendwann auseinanderläuft.
 */

export interface RoundRow {
  id: string
  season_id: string
  week_id: string
  user_id: string
  course_id: string
  handicap_index: string | number
  playing_handicap: number
  status: 'draft' | 'submitted' | 'confirmed' | 'rejected'
  marker_id: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  rejected_reason: string | null
  solo_approved_by: string | null
  admin_note: string | null
  played_at: string | null
}

export async function courseCard(courseId: string): Promise<CourseCard> {
  const course = (await sql`
    SELECT par, course_rating, slope_rating FROM courses WHERE id = ${courseId}
  `) as any[]
  if (!course[0]) throw new HttpError(404, 'Zu dieser Runde fehlt der Kurs.')

  const holes = (await sql`
    SELECT number, par, stroke_index FROM course_holes
    WHERE course_id = ${courseId} ORDER BY number
  `) as any[]

  return {
    par: course[0].par,
    courseRating: Number(course[0].course_rating),
    slopeRating: course[0].slope_rating,
    holes: holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.stroke_index })),
  }
}

/** Kopf, Karte und Lochliste einer Runde, fertig ausgewertet. */
export async function loadRound(roundId: string) {
  const rows = (await sql`
    SELECT r.*, u.name AS player_name, u.avatar_url, m.name AS marker_name,
           c.name AS course_name, c.tee, w.number AS week_number,
           (SELECT id FROM screenshots s WHERE s.round_id = r.id ORDER BY created_at DESC LIMIT 1)
             AS screenshot_id
    FROM rounds r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN users m ON m.id = r.marker_id
    JOIN courses c ON c.id = r.course_id
    JOIN weeks w ON w.id = r.week_id
    WHERE r.id = ${roundId}
  `) as any[]
  if (!rows[0]) throw new HttpError(404, 'Diese Runde gibt es nicht.')
  const row = rows[0]

  const card = await courseCard(row.course_id)
  const holeRows = (await sql`
    SELECT number, strokes FROM round_holes WHERE round_id = ${roundId} ORDER BY number
  `) as any[]

  const strokes: Record<number, number | null> = {}
  for (const hole of holeRows) strokes[hole.number] = hole.strokes

  const result = scoreRound(card, strokes, Number(row.handicap_index))

  return { row, card, strokes, result }
}

/** Die Form, in der eine Runde zur App geht. */
export function roundPayload(loaded: Awaited<ReturnType<typeof loadRound>>) {
  const { row, result } = loaded
  return {
    id: row.id,
    weekId: row.week_id,
    weekNumber: row.week_number,
    userId: row.user_id,
    playerName: row.player_name,
    avatarUrl: row.avatar_url,
    courseName: row.course_name,
    tee: row.tee,
    status: row.status,
    markerId: row.marker_id,
    markerName: row.marker_name,
    confirmedAt: row.confirmed_at,
    rejectedReason: row.rejected_reason,
    adminNote: row.admin_note,
    soloApproved: row.solo_approved_by !== null,
    screenshotId: row.screenshot_id,
    handicapIndex: Number(row.handicap_index),
    playingHandicap: row.playing_handicap,
    points: result.points,
    gross: result.gross,
    played: result.played,
    toPar: result.toPar,
    holes: result.holes,
  }
}
