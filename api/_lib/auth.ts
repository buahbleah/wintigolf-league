import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './db.js'
import { HttpError } from './http.js'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const COOKIE = 'wintigolf_session'
const SESSION_DAYS = 90
const KEYLEN = 64

/* ------------------------------------------------------------- Passwörter */

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 8) {
    throw new HttpError(400, 'Das Passwort braucht mindestens 8 Zeichen.')
  }
  if (password.length > 200) throw new HttpError(400, 'Das Passwort ist zu lang.')
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), KEYLEN)
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}

/* --------------------------------------------------------------- Sitzungen */

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  outdoorHandicap: number | null
  avatarUrl: string | null
  colorIndex: number
  clubDistances: Record<string, number>
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

/**
 * Das Cookie ist httpOnly: kein Skript auf der Seite kann den Token lesen, auch
 * kein eingeschleustes. `Secure` entfällt auf dem Dev-Server, weil das Cookie
 * sonst über http://localhost gar nicht erst gesetzt würde.
 */
function cookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : ''
  return `${COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

export async function createSession(res: VercelResponse, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expires.toISOString()})`
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_DAYS * 86400))
}

export async function destroySession(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (token) await sql`DELETE FROM sessions WHERE token = ${token}`
  res.setHeader('Set-Cookie', cookieHeader('', 0))
}

/** Eine Zeile aus `users` in die Form, die die App kennt. */
export function publicUser(row: any): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    outdoorHandicap: row.outdoor_handicap === null ? null : Number(row.outdoor_handicap),
    avatarUrl: row.avatar_url ?? null,
    colorIndex: row.color_index,
    clubDistances: row.club_distances ?? {},
  }
}

export const USER_COLUMNS = `id, email, name, role, outdoor_handicap, avatar_url, color_index, club_distances`

/** Der angemeldete Spieler, oder null. Wirft nie für anonyme Aufrufe. */
export async function currentUser(req: VercelRequest): Promise<SessionUser | null> {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (!token) return null
  const rows = (await sql`
    SELECT u.id, u.email, u.name, u.role, u.outdoor_handicap, u.avatar_url,
           u.color_index, u.club_distances
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
  `) as any[]
  const row = rows[0]
  return row ? publicUser(row) : null
}

export async function requireUser(req: VercelRequest): Promise<SessionUser> {
  const user = await currentUser(req)
  if (!user) throw new HttpError(401, 'Dafür musst du angemeldet sein.')
  return user
}

export async function requireAdmin(req: VercelRequest): Promise<SessionUser> {
  const user = await requireUser(req)
  if (user.role !== 'admin') throw new HttpError(403, 'Das darf nur ein Admin.')
  return user
}

/** Räumt abgelaufene Sitzungen gelegentlich weg, damit die Tabelle nicht wächst. */
export async function sweepSessions(): Promise<void> {
  if (Math.random() > 0.02) return
  try {
    await sql`DELETE FROM sessions WHERE expires_at < now()`
    await sql`DELETE FROM password_resets WHERE expires_at < now()`
  } catch {
    /* reine Hausarbeit */
  }
}
