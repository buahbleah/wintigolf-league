import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, optionalNumber, requireString } from '../_lib/http.js'
import { requireAdmin } from '../_lib/auth.js'
import { currentSeason, seasonById, settingsOf } from '../_lib/season.js'
import { recomputeHandicap } from '../_lib/handicap.js'
import { notify } from '../_lib/notify.js'

/**
 * Spielerverwaltung.
 *
 * GET   — alle Mitglieder mit Rolle, Handicaps und Zustand.
 * PATCH — eine Person ändern: Admin machen, Handicap setzen, ausscheiden lassen.
 *
 * Vier Dinge, die man je einmal braucht und dann sofort: jemanden zum Admin
 * machen, ein falsch eingetragenes Handicap richtigstellen, einen Aussteiger
 * aus der Tabelle nehmen, und jemanden wieder hereinholen.
 */
export default handler(['GET', 'PATCH'], async (req: VercelRequest, res: VercelResponse) => {
  const admin = await requireAdmin(req)
  const season = await currentSeason()

  if (req.method === 'GET') {
    const players = (await sql`
      SELECT u.id, u.name, u.email, u.role, u.avatar_url, u.outdoor_handicap, u.created_at,
             sp.starting_handicap, sp.indoor_handicap, sp.joined_week, sp.status,
             (SELECT count(*)::int FROM rounds r
              WHERE r.user_id = u.id AND r.status = 'confirmed') AS rounds
      FROM users u
      LEFT JOIN season_players sp
        ON sp.user_id = u.id AND sp.season_id = ${season?.id ?? null}
      ORDER BY u.created_at
    `) as any[]

    json(res, 200, {
      seasonStarted: season?.started_at !== null && season !== null,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        avatarUrl: p.avatar_url,
        outdoorHandicap: p.outdoor_handicap === null ? null : Number(p.outdoor_handicap),
        startingHandicap:
          p.starting_handicap === null ? null : Number(p.starting_handicap),
        indoorHandicap: p.indoor_handicap === null ? null : Number(p.indoor_handicap),
        joinedWeek: p.joined_week,
        status: p.status ?? 'none',
        rounds: p.rounds,
        isMe: p.id === admin.id,
      })),
    })
    return
  }

  const input = body(req)
  const userId = requireString(input.userId, 'Der Spieler', 40)

  const users = (await sql`SELECT id, name, role FROM users WHERE id = ${userId}`) as any[]
  if (!users[0]) throw new HttpError(404, 'Diese Person gibt es nicht.')
  const target = users[0]

  /* ------------------------------------------------------------- Rolle */
  if (input.role !== undefined) {
    const role = String(input.role)
    if (role !== 'admin' && role !== 'member') throw new HttpError(400, 'Diese Rolle gibt es nicht.')

    if (role === 'member' && target.id === admin.id) {
      throw new HttpError(400, 'Du kannst dir die eigenen Rechte nicht nehmen.')
    }
    if (role === 'member') {
      const admins = (await sql`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`) as any[]
      if (admins[0].n <= 1) throw new HttpError(400, 'Es muss mindestens ein Admin übrig bleiben.')
    }

    await sql`UPDATE users SET role = ${role}, updated_at = now() WHERE id = ${userId}`
    if (role === 'admin' && target.role !== 'admin') {
      await notify({
        userId,
        kind: 'admin',
        title: 'Du bist jetzt Admin',
        body: `${admin.name} hat dir die Verwaltung freigeschaltet.`,
        link: '#/admin',
      })
    }
  }

  /* ---------------------------------------------------------- Handicap */
  if (input.indoorHandicap !== undefined || input.outdoorHandicap !== undefined) {
    if (!season) throw new HttpError(400, 'Es läuft keine Saison.')

    if (input.outdoorHandicap !== undefined) {
      const outdoor = optionalNumber(input.outdoorHandicap, 'Das Handicap draussen', -10, 54)
      await sql`UPDATE users SET outdoor_handicap = ${outdoor}, updated_at = now() WHERE id = ${userId}`
    }

    if (input.indoorHandicap !== undefined) {
      const indoor = optionalNumber(input.indoorHandicap, 'Das Indoor-Handicap', -10, 54)
      /**
       * Vor dem Start zieht der Startwert mit — danach wird nur noch der
       * aktuelle Wert gesetzt, und der Startwert bleibt stehen. Sonst würde
       * eine Korrektur mitten in der Saison die ganze Geschichte umschreiben.
       */
      if (season.started_at === null) {
        await sql`
          UPDATE season_players SET starting_handicap = ${indoor}, indoor_handicap = ${indoor}
          WHERE season_id = ${season.id} AND user_id = ${userId}
        `
      } else {
        await sql`
          UPDATE season_players SET indoor_handicap = ${indoor}
          WHERE season_id = ${season.id} AND user_id = ${userId}
        `
        await sql`
          INSERT INTO handicap_events (season_id, user_id, before_value, after_value, engine,
                                       reason, ordinal)
          VALUES (${season.id}, ${userId}, NULL, ${indoor}, 'manual',
                  ${`Vom Admin gesetzt (${admin.name})`}, 999)
        `
      }

      await notify({
        userId,
        kind: 'handicap',
        title: `Dein Indoor-Handicap steht jetzt auf ${indoor?.toFixed(1)}`,
        body: `${admin.name} hat es gesetzt.`,
        link: `#/spieler/${userId}`,
      })
    }
  }

  /* ------------------------------------------------------------ Zustand */
  if (input.status !== undefined) {
    if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
    const status = String(input.status)
    if (status !== 'active' && status !== 'withdrawn') {
      throw new HttpError(400, 'Diesen Zustand gibt es nicht.')
    }
    await sql`
      UPDATE season_players SET status = ${status}
      WHERE season_id = ${season.id} AND user_id = ${userId}
    `
    // Wer wieder mitspielt, bekommt sein Handicap frisch durchgerechnet.
    if (status === 'active') await recomputeHandicap(await seasonById(season.id), userId)
  }

  /* ------------------------------------------------- Nachträglich aufnehmen */
  if (input.joinedWeek !== undefined) {
    if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
    const week = Math.round(Number(input.joinedWeek))
    const settings = settingsOf(season)
    if (!Number.isInteger(week) || week < 1 || week > settings.weeks) {
      throw new HttpError(400, `Die Woche muss zwischen 1 und ${settings.weeks} liegen.`)
    }
    await sql`
      UPDATE season_players SET joined_week = ${week}
      WHERE season_id = ${season.id} AND user_id = ${userId}
    `
  }

  /* ---------------------------------------------------- Einzelrunde erlauben
   * Wer in einer Woche niemanden findet, braucht eine Freigabe: danach lässt
   * sich die Karte ohne Zähler abgeben, und der Admin bestätigt sie selbst
   * anhand des Belegs. Die Freigabe hängt an der Karte, nicht am Spieler —
   * also muss er sie angefangen haben.
   */
  if (input.approveSolo === true) {
    if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
    const rounds = (await sql`
      SELECT r.id FROM rounds r
      JOIN weeks w ON w.id = r.week_id
      WHERE r.season_id = ${season.id} AND r.user_id = ${userId}
        AND now() BETWEEN w.starts_at AND w.ends_at
      ORDER BY w.number DESC LIMIT 1
    `) as any[]
    if (!rounds[0]) {
      throw new HttpError(
        400,
        `${target.name} hat für die laufende Woche noch keine Karte angefangen — erst danach lässt sie sich freigeben.`,
      )
    }
    await sql`UPDATE rounds SET solo_approved_by = ${admin.id} WHERE id = ${rounds[0].id}`
    await notify({
      userId,
      kind: 'solo-approved',
      title: 'Deine Einzelrunde ist freigegeben',
      body: 'Du kannst die Karte ohne Zähler abgeben.',
      link: '#/woche',
    })
  }

  /* ------------------------------------------------- In die Saison aufnehmen */
  if (input.addToSeason === true) {
    if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
    const settings = settingsOf(season)
    const outdoor = (await sql`SELECT outdoor_handicap FROM users WHERE id = ${userId}`) as any[]
    const start =
      outdoor[0]?.outdoor_handicap === null || outdoor[0]?.outdoor_handicap === undefined
        ? null
        : Math.round(Number(outdoor[0].outdoor_handicap) * settings.startFactor * 10) / 10
    await sql`
      INSERT INTO season_players (season_id, user_id, starting_handicap, indoor_handicap)
      VALUES (${season.id}, ${userId}, ${start}, ${start})
      ON CONFLICT (season_id, user_id) DO NOTHING
    `
  }

  json(res, 200, { ok: true })
})
