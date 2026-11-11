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
  if (!(await allowed(req))) {
    /**
     * Eine abgewiesene Anfrage ist normalerweise nichts Besonderes. Zwei Fälle
     * sind es doch, und beide enden sonst damit, dass wochenlang keine
     * Erinnerung rausgeht und es niemandem auffällt — darum stehen sie im
     * Protokoll.
     */
    if (!process.env.CRON_SECRET) {
      console.error(
        'CRON_SECRET fehlt — der Zeitplan kommt nicht durch, es gehen keine Erinnerungen raus.',
      )
    } else if (req.headers['x-vercel-cron'] !== undefined) {
      console.error(
        'Aufruf mit Cron-Kopf, aber ohne gültiges CRON_SECRET. Entweder stimmt der ' +
          'hinterlegte Wert nicht mehr — dann neu setzen und neu deployen — oder es ' +
          'war gar nicht der Zeitplan, sondern jemand, der sich dafür ausgibt.',
      )
    }
    throw new HttpError(403, 'Das löst der Zeitplan aus.')
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

/**
 * Wer den Versand auslösen darf.
 *
 * Vercel hängt an jeden geplanten Aufruf das Geheimnis aus CRON_SECRET, im Kopf
 * `Authorization: Bearer …`. Nur wer das mitbringt, bringt die Liga dazu, Mails
 * zu verschicken.
 *
 * Früher stand hier der Kopf `x-vercel-cron`. Der taugt nicht: so einen Vermerk
 * darf jeder an jede Anfrage hängen, er ist eine Behauptung und kein Nachweis.
 * Die Adresse steht im offenen Internet, also hätte jeder, der sie kennt, den
 * Versand anstossen können.
 *
 * Fehlt das Geheimnis ganz, kommt niemand durch — auch der Zeitplan nicht. Das
 * ist Absicht: lieber eine Erinnerung, die ausbleibt und sich im Protokoll
 * erklärt, als eine Tür, die offen steht.
 *
 * Ein Admin darf es ausserdem von Hand, mit seiner angemeldeten Sitzung.
 */
async function allowed(req: VercelRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization === `Bearer ${secret}`) return true
  const user = await currentUser(req)
  return user?.role === 'admin'
}
