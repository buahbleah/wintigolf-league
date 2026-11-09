import { useEffect, useState } from 'react'
import { api } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { when } from '@/screens/Clubhaus'

interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

const ICONS: Record<string, string> = {
  'confirm-request': '✋',
  'card-confirmed': '✓',
  'card-rejected': '✗',
  'round-comment': '💬',
  'topic-reply': '💬',
  'slot-created': '📅',
  'slot-joined': '📅',
  'slot-cancelled': '📅',
  deadline: '⏳',
  badge: '🏅',
}

/**
 * Das Benachrichtigungs-Center.
 *
 * Hier landet alles: Zusagen, Bestätigungen, Kommentare, Abzeichen. Per Mail
 * geht nur das Wenige raus, das sonst untergeht — Erinnerung vor der Deadline,
 * eine Karte, die auf dich wartet, und eine, die abgelehnt wurde.
 */
export function Mitteilungen() {
  const { refresh } = useSession()
  const [items, setItems] = useState<Notification[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ notifications: Notification[] }>('/api/notifications')
      .then(async (res) => {
        if (cancelled) return
        setItems(res.notifications)
        if (res.notifications.some((n) => !n.read)) {
          await api.post('/api/notifications', {})
          await refresh()
        }
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Mitteilungen</span>
        <h1>Was passiert ist</h1>
      </div>

      {items === null ? (
        <span className="spinner" style={{ margin: '0 auto' }} />
      ) : items.length === 0 ? (
        <div className="empty">
          <p>Nichts Neues.</p>
        </div>
      ) : (
        <div className="card">
          <div className="list">
            {items.map((item) => (
              <button
                key={item.id}
                className={`notice-row${item.read ? '' : ' is-new'}`}
                onClick={() => item.link && navigate(item.link.replace(/^#/, ''))}
                disabled={!item.link}
              >
                <span className="notice-icon">{ICONS[item.kind] ?? '•'}</span>
                <span className="stack stack--tight" style={{ flex: 1, gap: 1, textAlign: 'left' }}>
                  <strong>{item.title}</strong>
                  {item.body && <span className="muted small">{item.body}</span>}
                </span>
                <span className="muted small">{when(item.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
