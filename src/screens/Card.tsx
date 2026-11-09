import { useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { initials } from '@/screens/Profile'
import { StatusChip } from '@/screens/Week'
import { holeLabel, type HoleResult } from '@/core/scoring'

interface RoundDetail {
  id: string
  weekNumber: number
  userId: string
  playerName: string
  avatarUrl: string | null
  courseName: string
  tee: string
  status: 'draft' | 'submitted' | 'confirmed' | 'rejected'
  markerId: string | null
  markerName: string | null
  confirmedAt: string | null
  rejectedReason: string | null
  adminNote: string | null
  screenshotId: string | null
  handicapIndex: number
  playingHandicap: number
  points: number
  gross: number
  played: number
  toPar: number
  holes: HoleResult[]
}

/**
 * Eine Karte ansehen — und, wenn sie bei einem liegt, bestätigen oder ablehnen.
 *
 * Jedes Mitglied sieht jede Karte Loch für Loch samt Beleg. Das ist der Sinn der
 * Sache: eine Liga, in der jeder nachschauen kann, braucht keine Diskussion über
 * Zahlen.
 */
export function Card({ roundId }: { roundId: string }) {
  const { state, refresh } = useSession()
  const me = state.user!
  const [round, setRound] = useState<RoundDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ round: RoundDetail }>(`/api/rounds/${roundId}`)
      .then((res) => {
        if (!cancelled) setRound(res.round)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Nicht gefunden.')
      })
    return () => {
      cancelled = true
    }
  }, [roundId])

  async function decide(reject: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ round: RoundDetail }>(`/api/rounds/${roundId}/confirm`, {
        reject,
        reason: reject ? reason : undefined,
      })
      setRound(res.round)
      setRejecting(false)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !round) {
    return (
      <div className="page">
        <div className="notice notice--error">{error}</div>
      </div>
    )
  }
  if (!round) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  const isMarker = round.markerId === me.id
  const isAdmin = me.role === 'admin'
  const canDecide = (isMarker || isAdmin) && round.status !== 'confirmed'
  const front = round.holes.slice(0, 9)
  const back = round.holes.slice(9)

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Woche {round.weekNumber}</span>
        <h1>{round.playerName}</h1>
        <p className="lede">
          {round.courseName} · {round.tee} · {round.playingHandicap} Schläge vor
        </p>
      </div>

      <div className="card stack">
        <div className="row row--between">
          <span className="avatar">
            {round.avatarUrl ? <img src={round.avatarUrl} alt="" /> : initials(round.playerName)}
          </span>
          <StatusChip status={round.status} />
        </div>
        <div className="stat-grid">
          <div className="stat">
            <span className="value" style={{ color: 'var(--green)' }}>
              {round.points}
            </span>
            <span className="label">Punkte</span>
          </div>
          <div className="stat">
            <span className="value">{round.gross}</span>
            <span className="label">Brutto</span>
          </div>
          <div className="stat">
            <span className="value">
              {round.toPar > 0 ? `+${round.toPar}` : round.toPar}
            </span>
            <span className="label">zu Par</span>
          </div>
          <div className="stat">
            <span className="value">{round.handicapIndex.toFixed(1)}</span>
            <span className="label">Handicap</span>
          </div>
        </div>
        {round.played < 18 && (
          <p className="muted small">
            {18 - round.played === 1
              ? 'Ein Loch ohne Ergebnis — das gibt null Punkte.'
              : `${18 - round.played} Löcher ohne Ergebnis — die geben null Punkte.`}
          </p>
        )}
        {round.adminNote && <div className="notice notice--warn">{round.adminNote}</div>}
        {round.status === 'submitted' && (
          <p className="muted small">
            Wartet auf {round.markerName ?? 'den Zähler'}.
          </p>
        )}
        {round.status === 'confirmed' && round.markerName && (
          <p className="muted small">Bestätigt von {round.markerName}.</p>
        )}
        {round.rejectedReason && round.status === 'draft' && (
          <div className="notice notice--warn">Abgelehnt: {round.rejectedReason}</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h3>Die Karte</h3>
          <span className="muted small">Punkte je Loch</span>
        </div>
        <Nine holes={front} label="Hin" />
        <Nine holes={back} label="Zurück" />
      </div>

      {round.screenshotId && (
        <div className="card stack">
          <div className="card-title">
            <h3>Beleg</h3>
          </div>
          <img
            className="proof-preview"
            src={`/api/rounds/${round.id}/screenshot`}
            alt={`Abschlussbildschirm von ${round.playerName}`}
          />
        </div>
      )}

      {error && <div className="notice notice--error">{error}</div>}

      {canDecide && (
        <div className="card card--accent stack">
          <div className="card-title">
            <h3>{isMarker ? 'Du bist der Zähler' : 'Als Admin entscheiden'}</h3>
          </div>
          <p className="muted small">
            Stimmen die Zahlen mit dem Beleg überein? Bestätigen heisst: so ist gespielt worden.
            Ablehnen setzt die Lochliste zurück, die Runde wird neu eingetragen.
          </p>
          {rejecting ? (
            <>
              <div className="field">
                <label htmlFor="reason">Was stimmt nicht?</label>
                <input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="z. B. Loch 7 war eine 6"
                />
              </div>
              <div className="row">
                <button className="btn btn--danger" onClick={() => decide(true)} disabled={busy}>
                  Ablehnen
                </button>
                <button className="btn btn--quiet" onClick={() => setRejecting(false)}>
                  Doch nicht
                </button>
              </div>
            </>
          ) : (
            <div className="row">
              <button className="btn btn--primary" onClick={() => decide(false)} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Bestätigen'}
              </button>
              <button className="btn btn--ghost" onClick={() => setRejecting(true)}>
                Stimmt nicht
              </button>
            </div>
          )}
        </div>
      )}

      <button className="btn btn--quiet" onClick={() => navigate('/woche')}>
        Zurück zur Woche
      </button>
    </div>
  )
}

/** Neun Löcher als Zeile — so, wie eine Scorecard gelesen wird. */
function Nine({ holes, label }: { holes: HoleResult[]; label: string }) {
  const points = holes.reduce((sum, h) => sum + h.points, 0)
  const gross = holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0)

  return (
    <div className="nine">
      <div className="nine-head">
        <span>{label}</span>
        <span className="muted small">
          {gross} Schläge · {points} Punkte
        </span>
      </div>
      <div className="nine-grid">
        {holes.map((hole) => (
          <div className="nine-cell" key={hole.number} title={holeLabel(hole.toPar) ?? undefined}>
            <span className="nine-no">{hole.number}</span>
            <span className={`nine-score pts-${Math.min(hole.points, 5)}`}>
              {hole.strokes ?? '–'}
              {hole.received > 0 && <i className="nine-dot" />}
            </span>
            <span className="nine-par">{hole.par}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
