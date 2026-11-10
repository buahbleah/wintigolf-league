import { sql } from './db.js'

/**
 * Mails über Brevo.
 *
 * Nur transaktionaler Versand: die Adresse kommt aus dem Konto, niemand landet
 * in einer Kontaktliste, und mit dem Newsletter des Gyms hat das nichts zu tun.
 *
 * Verschickt wird nur bei vier Anlässen: Erinnerung am Tag vor der Deadline,
 * "eine Karte wartet auf deine Bestätigung", "deine Karte wurde abgelehnt",
 * Passwort zurücksetzen. Alles andere bleibt in der App.
 *
 * Eingeladen wird ohne Mail — der Admin gibt den Beitrittslink weiter, den die
 * Ligaseite anzeigt. Wer die Liga kennt, kennt auch den Weg zu ihr.
 */

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export interface Mail {
  to: string
  toName?: string
  subject: string
  /** Fliesstext in Absätzen. Die Hülle drumherum macht diese Datei. */
  paragraphs: string[]
  action?: { label: string; url: string }
  /** Verhindert, dass ein zweiter Cron-Lauf dieselbe Mail nochmals schickt. */
  dedupeKey?: string
  userId?: string
  kind: string
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    console.warn(`Keine BREVO_API_KEY gesetzt — Mail "${mail.subject}" nicht verschickt.`)
    return false
  }

  /**
   * Auf dem Entwicklungsrechner wird nichts verschickt.
   *
   * Beim Ausprobieren entstehen Konten wie test@example.com, und jede Mail
   * dorthin ist eine Unzustellbarkeit, die auf den Ruf des Absenders geht.
   * `MAIL_IN_DEV=1` hebt das auf, wenn man den Versand wirklich prüfen will.
   */
  if (!process.env.VERCEL && process.env.MAIL_IN_DEV !== '1') {
    console.info(`[Mail nur lokal protokolliert] An ${mail.to}: ${mail.subject}`)
    return false
  }

  if (mail.dedupeKey) {
    const already = (await sql`SELECT 1 FROM mail_log WHERE dedupe_key = ${mail.dedupeKey}`) as any[]
    if (already.length) return false
  }

  const payload = {
    sender: {
      email: process.env.BREVO_SENDER_EMAIL ?? 'info@crossfitgleis10.ch',
      name: process.env.BREVO_SENDER_NAME ?? 'Wintigolf League',
    },
    to: [{ email: mail.to, name: mail.toName ?? mail.to }],
    subject: mail.subject,
    htmlContent: render(mail),
    textContent: [...mail.paragraphs, mail.action ? `${mail.action.label}: ${mail.action.url}` : '']
      .filter(Boolean)
      .join('\n\n'),
  }

  let error: string | null = null
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) error = `Brevo antwortete mit ${response.status}: ${await response.text()}`
  } catch (err) {
    error = (err as Error).message
  }

  if (error) console.error(`Mail "${mail.subject}" an ${mail.to}: ${error}`)

  await sql`
    INSERT INTO mail_log (user_id, kind, dedupe_key, error)
    VALUES (${mail.userId ?? null}, ${mail.kind},
            ${mail.dedupeKey ?? `${mail.kind}:${mail.to}:${Date.now()}`}, ${error})
    ON CONFLICT (dedupe_key) DO NOTHING
  `
  return error === null
}

/**
 * Die Hülle. Bewusst karg: dunkel, eine Akzentfarbe, keine Bilder — eine Mail,
 * die in jedem Client gleich aussieht und nie wie Werbung wirkt.
 */
function render(mail: Mail): string {
  const body = mail.paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p)}</p>`)
    .join('')
  const button = mail.action
    ? `<p style="margin:28px 0 8px">
         <a href="${mail.action.url}"
            style="display:inline-block;padding:12px 22px;border-radius:8px;background:#37d67a;color:#04140b;font-weight:600;text-decoration:none">
           ${escapeHtml(mail.action.label)}
         </a>
       </p>`
    : ''

  return `<!doctype html>
<html lang="de"><body style="margin:0;background:#0b0f0d;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e9efea">
  <div style="max-width:520px;margin:0 auto;background:#121816;border:1px solid #253029;border-radius:14px;padding:28px">
    <div style="font-weight:700;letter-spacing:-0.02em;margin-bottom:20px">
      Wintigolf <span style="color:#37d67a">League</span>
    </div>
    ${body}${button}
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:#5d6b63;font-size:12px">
    Diese Nachricht kommt aus der Wintigolf League. Sie geht nur an Mitglieder der Liga.
  </p>
</body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Die öffentliche Adresse der App, für Links in Mails. */
export function appUrl(path = ''): string {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:5173')
  return `${base.replace(/\/$/, '')}${path}`
}
