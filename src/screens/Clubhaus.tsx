import { useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { initials } from '@/screens/Profile'
import { Reactions } from '@/ui/Reactions'
import type { ReactionSummary } from '@/ui/Reactions'

interface TopicRow {
  id: string
  title: string
  pinned: boolean
  weekId: string | null
  createdByName: string | null
  posts: number
  lastBody: string | null
  lastAuthor: string | null
  lastPostAt: string
}

/** Die Themenliste des Clubhauses. */
export function Clubhaus() {
  const [topics, setTopics] = useState<TopicRow[] | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await api.get<{ topics: TopicRow[] }>('/api/topics')
      setTopics(res.topics)
    } catch {
      setTopics([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ id: string }>('/api/topics', { title, body: text || undefined })
      setTitle('')
      setText('')
      setOpen(false)
      navigate(`/thema/${res.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Clubhaus</span>
        <h1>Was läuft</h1>
      </div>

      {open ? (
        <div className="card stack">
          <div className="field">
            <label htmlFor="ttitle">Thema</label>
            <input
              id="ttitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Worum geht es?"
            />
          </div>
          <div className="field">
            <label htmlFor="ttext">Dein erster Beitrag</label>
            <textarea id="ttext" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <div className="row">
            <button className="btn btn--primary" onClick={create} disabled={busy || !title.trim()}>
              {busy ? <span className="spinner" /> : 'Eröffnen'}
            </button>
            <button className="btn btn--quiet" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn--ghost btn--block" onClick={() => setOpen(true)}>
          Thema eröffnen
        </button>
      )}

      {topics === null ? (
        <span className="spinner" style={{ margin: '0 auto' }} />
      ) : topics.length === 0 ? (
        <div className="empty">
          <p>Noch still hier.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table">
            {topics.map((topic) => (
              <button
                key={topic.id}
                className="table-row"
                onClick={() => navigate(`/thema/${topic.id}`)}
              >
                <span className="table-name">
                  <strong>
                    {topic.pinned && <span className="pin">📌 </span>}
                    {topic.title}
                  </strong>
                  <span className="muted small">
                    {topic.lastAuthor
                      ? `${topic.lastAuthor}: ${(topic.lastBody ?? '').slice(0, 60)}`
                      : 'noch kein Beitrag'}
                  </span>
                </span>
                <span className="chip">{topic.posts}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface Post {
  id: string
  body: string
  createdAt: string
  authorId: string
  authorName: string
  avatarUrl: string | null
  reactions: ReactionSummary[]
}

/** Ein Thema mit seinen Beiträgen. */
export function Thema({ topicId }: { topicId: string }) {
  const { state } = useSession()
  const me = state.user!
  const [data, setData] = useState<{ topic: TopicRow; posts: Post[] } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await api.get<{ topic: TopicRow; posts: Post[] }>(`/api/topics/${topicId}`)
    setData(res)
  }

  useEffect(() => {
    void load().catch(() => setData(null))
  }, [topicId])

  async function reply() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await api.post<{ topic: TopicRow; posts: Post[] }>(`/api/topics/${topicId}`, {
        body: text,
      })
      setData(res)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Clubhaus</span>
        <h1>{data.topic.title}</h1>
      </div>

      <div className="stack stack--tight">
        {data.posts.map((post) => (
          <div className={`post${post.authorId === me.id ? ' is-mine' : ''}`} key={post.id}>
            <div className="post-head">
              <span className="avatar">
                {post.avatarUrl ? <img src={post.avatarUrl} alt="" /> : initials(post.authorName)}
              </span>
              <strong>{post.authorName}</strong>
              <span className="muted small">{when(post.createdAt)}</span>
            </div>
            <p className="post-body">{post.body}</p>
            <Reactions
              targetType="post"
              targetId={post.id}
              reactions={post.reactions}
              onChange={load}
            />
          </div>
        ))}
        {data.posts.length === 0 && <p className="muted small">Noch kein Beitrag. Fang an.</p>}
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="reply">Antworten</label>
          <textarea id="reply" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn--primary" onClick={reply} disabled={busy || !text.trim()}>
          {busy ? <span className="spinner" /> : 'Abschicken'}
        </button>
      </div>

      <button className="btn btn--quiet" onClick={() => navigate('/clubhaus')}>
        Zurück ins Clubhaus
      </button>
    </div>
  )
}

/** «vor 3 Minuten», «gestern 19:04» — nah dran genau, weiter weg grob. */
export function when(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} min`
  if (minutes < 60 * 20) return `vor ${Math.round(minutes / 60)} h`
  return then.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}
