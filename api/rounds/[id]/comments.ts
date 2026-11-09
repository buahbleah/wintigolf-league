import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../../_lib/db.js'
import { body, handler, json, param, requireString } from '../../_lib/http.js'
import { requireUser } from '../../_lib/auth.js'
import { notify } from '../../_lib/notify.js'
import { summarise } from '../../topics/[id].js'

/**
 * Kommentare an einer Karte — der Ort, wo das Lästern hingehört: direkt am
 * Beweisstück.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const roundId = param(req, 'id')

  if (req.method === 'POST') {
    const text = requireString(body(req).body, 'Der Text', 2000)
    await sql`INSERT INTO posts (round_id, author_id, body) VALUES (${roundId}, ${user.id}, ${text})`

    const owner = (await sql`
      SELECT r.user_id, w.number AS week_number FROM rounds r
      JOIN weeks w ON w.id = r.week_id WHERE r.id = ${roundId}
    `) as any[]
    if (owner[0] && owner[0].user_id !== user.id) {
      await notify({
        userId: owner[0].user_id,
        kind: 'round-comment',
        title: `${user.name} hat deine Karte kommentiert`,
        body: text.slice(0, 120),
        link: `#/karte/${roundId}`,
      })
    }
  }

  const comments = (await sql`
    SELECT p.id, p.body, p.created_at, p.author_id, u.name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.round_id = ${roundId}
    ORDER BY p.created_at
  `) as any[]

  const reactions = (await sql`
    SELECT r.target_id, r.emoji, r.user_id, u.name
    FROM reactions r JOIN users u ON u.id = r.user_id
    WHERE (r.target_type = 'round' AND r.target_id = ${roundId})
       OR (r.target_type = 'post' AND r.target_id IN
           (SELECT id FROM posts WHERE round_id = ${roundId}))
  `) as any[]

  json(res, req.method === 'POST' ? 201 : 200, {
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      authorId: c.author_id,
      authorName: c.name,
      avatarUrl: c.avatar_url,
      reactions: summarise(reactions.filter((r) => r.target_id === c.id), user.id),
    })),
    reactions: summarise(reactions.filter((r) => r.target_id === roundId), user.id),
  })
})
