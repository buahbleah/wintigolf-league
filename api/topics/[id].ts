import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db.js'
import { body, handler, HttpError, json, param, requireString } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { currentSeason, requireMember } from '../_lib/season.js'
import { notify } from '../_lib/notify.js'

/**
 * Ein Thema mit seinen Beiträgen.
 *
 * GET  — lesen.
 * POST — antworten. Wer im Thema schon geschrieben hat, bekommt eine Mitteilung
 *        in der App; eine Mail gibt es dafür nicht, sonst wird aus einem Clubhaus
 *        ein Postfach.
 */
export default handler(['GET', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const user = await requireUser(req)
  const season = await currentSeason()
  if (!season) throw new HttpError(400, 'Es läuft keine Saison.')
  await requireMember(season.id, user.id)

  const topicId = param(req, 'id')
  const topics = (await sql`
    SELECT t.id, t.title, t.pinned, t.week_id, u.name AS created_by_name
    FROM topics t LEFT JOIN users u ON u.id = t.created_by
    WHERE t.id = ${topicId} AND t.season_id = ${season.id}
  `) as any[]
  if (!topics[0]) throw new HttpError(404, 'Dieses Thema gibt es nicht.')

  if (req.method === 'POST') {
    const text = requireString(body(req).body, 'Der Text', 4000)
    await sql`INSERT INTO posts (topic_id, author_id, body) VALUES (${topicId}, ${user.id}, ${text})`
    await sql`UPDATE topics SET last_post_at = now() WHERE id = ${topicId}`

    const others = (await sql`
      SELECT DISTINCT author_id FROM posts WHERE topic_id = ${topicId} AND author_id <> ${user.id}
    `) as any[]
    for (const other of others) {
      await notify({
        userId: other.author_id,
        kind: 'topic-reply',
        title: `${user.name} hat in «${topics[0].title}» geschrieben`,
        body: text.slice(0, 120),
        link: `#/thema/${topicId}`,
      })
    }
  }

  const posts = (await sql`
    SELECT p.id, p.body, p.created_at, p.edited_at, p.author_id, u.name, u.avatar_url
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.topic_id = ${topicId}
    ORDER BY p.created_at
  `) as any[]

  const reactions = (await sql`
    SELECT r.target_id, r.emoji, r.user_id, u.name
    FROM reactions r JOIN users u ON u.id = r.user_id
    WHERE r.target_type = 'post'
      AND r.target_id IN (SELECT id FROM posts WHERE topic_id = ${topicId})
  `) as any[]

  json(res, req.method === 'POST' ? 201 : 200, {
    topic: {
      id: topics[0].id,
      title: topics[0].title,
      pinned: topics[0].pinned,
      weekId: topics[0].week_id,
      createdByName: topics[0].created_by_name,
    },
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.created_at,
      editedAt: p.edited_at,
      authorId: p.author_id,
      authorName: p.name,
      avatarUrl: p.avatar_url,
      reactions: summarise(reactions.filter((r) => r.target_id === p.id), user.id),
    })),
  })
})

/** Emoji → Zahl, plus ob man selbst dabei ist. */
export interface ReactionSummary {
  emoji: string
  count: number
  mine: boolean
  who: string[]
}

export function summarise(rows: any[], userId: string): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary>()
  for (const row of rows) {
    const entry: ReactionSummary = byEmoji.get(row.emoji) ?? {
      emoji: row.emoji,
      count: 0,
      mine: false,
      who: [],
    }
    entry.count++
    entry.who.push(row.name)
    if (row.user_id === userId) entry.mine = true
    byEmoji.set(row.emoji, entry)
  }
  return [...byEmoji.values()]
}
