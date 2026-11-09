import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, json, requireString } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, requireMember } from '../_lib/season.js'

/**
 * Das Clubhaus: Themen, in denen mitgeredet wird.
 *
 * Für die laufende Woche entsteht ein Thema von selbst, sobald jemand das
 * Clubhaus öffnet — das ist der Ort, an dem über den Kurs der Woche gelästert
 * wird, und niemand soll ihn erst anlegen müssen.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) {
    json(res, 200, { topics: [] })
    return
  }
  await requireMember(season.id, user.id)

  if (req.method === 'POST') {
    const title = requireString(body(req).title, 'Der Titel', 120)
    const first = body(req).body ? requireString(body(req).body, 'Der Text', 4000) : null

    const created = (await sql`
      INSERT INTO topics (season_id, title, created_by) VALUES (${season.id}, ${title}, ${user.id})
      RETURNING id
    `) as any[]
    if (first) {
      await sql`
        INSERT INTO posts (topic_id, author_id, body) VALUES (${created[0].id}, ${user.id}, ${first})
      `
    }
    json(res, 201, { id: created[0].id })
    return
  }

  /* Das Thema zur laufenden Woche, falls es noch keines gibt. */
  const running = (await sql`
    SELECT id, number, (SELECT name FROM courses c WHERE c.id = w.course_id) AS course_name
    FROM weeks w
    WHERE w.season_id = ${season.id} AND w.kind = 'regular'
      AND now() BETWEEN w.starts_at AND w.ends_at
    ORDER BY w.number LIMIT 1
  `) as any[]
  if (running[0]) {
    const existing = (await sql`
      SELECT 1 FROM topics WHERE season_id = ${season.id} AND week_id = ${running[0].id}
    `) as any[]
    if (!existing.length) {
      const title = running[0].course_name
        ? `Woche ${running[0].number} — ${running[0].course_name}`
        : `Woche ${running[0].number}`
      await sql`
        INSERT INTO topics (season_id, week_id, title, pinned) VALUES
          (${season.id}, ${running[0].id}, ${title}, true)
        ON CONFLICT DO NOTHING
      `
    }
  }

  const topics = (await sql`
    SELECT t.id, t.title, t.pinned, t.created_at, t.last_post_at, t.week_id,
           u.name AS created_by_name,
           (SELECT count(*)::int FROM posts p WHERE p.topic_id = t.id) AS posts,
           (SELECT p.body FROM posts p WHERE p.topic_id = t.id ORDER BY p.created_at DESC LIMIT 1)
             AS last_body,
           (SELECT au.name FROM posts p JOIN users au ON au.id = p.author_id
            WHERE p.topic_id = t.id ORDER BY p.created_at DESC LIMIT 1) AS last_author
    FROM topics t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.season_id = ${season.id}
    ORDER BY t.pinned DESC, t.last_post_at DESC
  `) as any[]

  json(res, 200, {
    topics: topics.map((t) => ({
      id: t.id,
      title: t.title,
      pinned: t.pinned,
      weekId: t.week_id,
      createdByName: t.created_by_name,
      posts: t.posts,
      lastBody: t.last_body,
      lastAuthor: t.last_author,
      lastPostAt: t.last_post_at,
    })),
  })
})
