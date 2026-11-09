import { useState } from 'react'
import { api } from '@/net/api'

export interface ReactionSummary {
  emoji: string
  count: number
  mine: boolean
  who: string[]
}

/** Die Auswahl ist absichtlich klein: eine Liste, die alle lesen können. */
export const EMOJI = ['👏', '😂', '🔥', '😱', '🫡', '⛳']

/**
 * Reaktionen an einem Beitrag oder einer Karte.
 *
 * Ein Tipp schaltet eine Reaktion an oder aus. Wer schon reagiert hat, sieht das
 * an der grünen Kante — und wer über die Zahl fährt, sieht, wer es war.
 */
export function Reactions({
  targetType,
  targetId,
  reactions,
  onChange,
}: {
  targetType: 'post' | 'round'
  targetId: string
  reactions: ReactionSummary[]
  onChange: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle(emoji: string) {
    setBusy(true)
    try {
      await api.post('/api/reactions', { targetType, targetId, emoji })
      await onChange()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          className={`reaction${reaction.mine ? ' is-mine' : ''}`}
          onClick={() => toggle(reaction.emoji)}
          disabled={busy}
          title={reaction.who.join(', ')}
        >
          {reaction.emoji} {reaction.count}
        </button>
      ))}

      {open ? (
        <span className="reaction-picker">
          {EMOJI.map((emoji) => (
            <button key={emoji} className="reaction" onClick={() => toggle(emoji)} disabled={busy}>
              {emoji}
            </button>
          ))}
        </span>
      ) : (
        <button className="reaction reaction--add" onClick={() => setOpen(true)} aria-label="Reagieren">
          +
        </button>
      )}
    </div>
  )
}
