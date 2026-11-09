import { sql } from './db.js'
import { appUrl, sendMail } from './mail.js'

/**
 * Jemandem Bescheid geben.
 *
 * In der App landet alles — Zusagen, Bestätigungen, Kommentare. Eine Mail geht
 * nur bei den vier Anlässen raus, bei denen jemand sonst womöglich tagelang
 * nichts merkt. Alles andere wäre Spam, und Spam liest nach drei Wochen niemand
 * mehr.
 */

export interface Notice {
  userId: string
  kind: string
  title: string
  body?: string
  link?: string
  /** Zusätzlich eine Mail schicken. */
  mail?: { subject: string; paragraphs: string[]; action?: { label: string; path: string } }
  dedupeKey?: string
}

export async function notify(notice: Notice): Promise<void> {
  await sql`
    INSERT INTO notifications (user_id, kind, title, body, link)
    VALUES (${notice.userId}, ${notice.kind}, ${notice.title}, ${notice.body ?? null},
            ${notice.link ?? null})
  `

  if (!notice.mail) return

  const rows = (await sql`SELECT email, name FROM users WHERE id = ${notice.userId}`) as any[]
  if (!rows[0]) return

  await sendMail({
    to: rows[0].email,
    toName: rows[0].name,
    userId: notice.userId,
    kind: notice.kind,
    dedupeKey: notice.dedupeKey,
    subject: notice.mail.subject,
    paragraphs: notice.mail.paragraphs,
    action: notice.mail.action
      ? { label: notice.mail.action.label, url: appUrl(`/${notice.mail.action.path}`) }
      : undefined,
  })
}
