import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { handler, HttpError, json } from '../_lib/http.js'
import { currentUser } from '../_lib/auth.js'
import { currentSeason } from '../_lib/season.js'
import { notify } from '../_lib/notify.js'
import { zurichParts } from '../../src/core/dates.js'

/**
 * Die Erinnerung einen Tag vor der Deadline.
 *
 * Läuft als Vercel-Cron einmal am Tag und schickt nur dann etwas, wenn die
 * laufende Woche morgen endet — und nur an die, von denen noch keine Karte da
 * ist. Zweimal am selben Tag ausgelöst passiert nichts: der Versand merkt sich
 * seinen Schlüssel.
 *
 * Aufrufen darf das der Vercel-Cron und ein Admin von Hand. Sonst niemand, denn
 * sonst könnte jeder der Liga Mails schicken lassen.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const fromCron = req.headers['x-vercel-cron'] !== undefined
  if (!fromCron) {
    const user = await currentUser(req)
    if (!user || user.role !== 'admin') throw new HttpError(403, 'Das löst der Cron aus.')
  }

  const season = await currentSeason()
  if (!season || season.status !== 'active' || season.paused_at) {
    json(res, 200, { sent: 0, reason: 'keine laufende Saison' })
    return
  }

  const weeks = (await sql`
    SELECT w.id, w.number, w.ends_at, c.name AS course_name
    FROM weeks w LEFT JOIN courses c ON c.id = w.course_id
    WHERE w.season_id = ${season.id} AND w.kind = 'regular'
      AND now() BETWEEN w.starts_at AND w.ends_at
    ORDER BY w.number LIMIT 1
  `) as any[]
  if (!weeks[0]) {
    json(res, 200, { sent: 0, reason: 'keine laufende Woche' })
    return
  }
  const week = weeks[0]

  // Nur am Tag vor der Deadline — Ortszeit, nicht UTC.
  const endsAt = new Date(week.ends_at)
  const hoursLeft = (endsAt.getTime() - Date.now()) / 3600_000
  if (hoursLeft > 36 || hoursLeft < 2) {
    json(res, 200, { sent: 0, reason: `Deadline in ${Math.round(hoursLeft)} Stunden` })
    return
  }

  const missing = (await sql`
    SELECT sp.user_id, u.name
    FROM season_players sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.season_id = ${season.id} AND sp.status = 'active'
      AND sp.joined_week <= ${week.number}
      AND NOT EXISTS (
        SELECT 1 FROM rounds r
        WHERE r.week_id = ${week.id} AND r.user_id = sp.user_id
          AND r.status IN ('submitted','confirmed')
      )
  `) as any[]

  const deadline = zurichParts(endsAt)
  let sent = 0
  for (const player of missing) {
    const fresh = await notify({
      userId: player.user_id,
      kind: 'deadline',
      title: `Woche ${week.number} endet morgen`,
      body: week.course_name
        ? `${week.course_name} — bis morgen ${String(deadline.hour).padStart(2, '0')}:${String(deadline.minute).padStart(2, '0')}`
        : undefined,
      link: '#/woche',
      mail: {
        subject: `Woche ${week.number} endet morgen`,
        paragraphs: [
          `Hallo ${player.name}`,
          week.course_name
            ? `Von dir fehlt noch die Karte aus Woche ${week.number} auf ${week.course_name}.`
            : `Von dir fehlt noch die Karte aus Woche ${week.number}.`,
          `Abgabeschluss ist morgen um ${String(deadline.hour).padStart(2, '0')}:${String(deadline.minute).padStart(2, '0')}. Danach gibt es für die Woche null Punkte.`,
          'Denk daran: nie allein spielen — es braucht einen Mitspieler, der die Karte bestätigt.',
        ],
        action: { label: 'Zur Woche', path: '#/woche' },
      },
      dedupeKey: `reminder:${week.id}:${player.user_id}`,
    })
    if (fresh) sent++
  }

  json(res, 200, { sent, week: week.number, open: missing.map((m) => m.name) })
})
