import { useEffect, useState } from 'react'
import { api } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { activeWeek, weekState, type LeagueData } from '@/state/league'
import { formatRange, timeLeft, zurichIsoDate } from '@/core/dates'
import { initials } from '@/screens/Profile'

interface RoundSummary {
  id: string
  userId: string
  playerName: string
  avatarUrl: string | null
  status: 'draft' | 'submitted' | 'confirmed' | 'rejected'
  markerId: string | null
  markerName: string | null
  points: number
  gross: number
  played: number
  adminNote: string | null
}

/**
 * Die Woche.
 *
 * Worauf gespielt wird, wie eingestellt werden muss, wer schon abgegeben hat und
 * was noch auf eine Bestätigung wartet.
 */
export function Week({ data }: { data: LeagueData }) {
  const { state } = useSession()
  const me = state.user!
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)

  const week = activeWeek(data.weeks)
  const settings = data.season?.settings

  useEffect(() => {
    if (!week) return
    let cancelled = false
    void api
      .get<{ rounds: RoundSummary[] }>(`/api/rounds?weekId=${week.id}`)
      .then((res) => {
        if (!cancelled) setRounds(res.rounds)
      })
      .catch(() => {
        if (!cancelled) setRounds([])
      })
    return () => {
      cancelled = true
    }
  }, [week?.id])

  if (!data.season || !week) {
    return (
      <div className="page">
        <div className="page-head">
          <span className="eyebrow">Woche</span>
          <h1>Noch nichts zu spielen</h1>
        </div>
        <div className="empty">
          <p>Sobald eine Woche läuft, steht hier der Kurs und du kannst deine Karte eintragen.</p>
        </div>
      </div>
    )
  }

  const state_ = weekState(week)
  const mine = rounds?.find((r) => r.userId === me.id) ?? null
  const waitingOnMe = rounds?.filter((r) => r.status === 'submitted' && r.markerId === me.id) ?? []
  const open = data.players.filter(
    (p) => p.status === 'active' && !rounds?.some((r) => r.userId === p.id && r.status !== 'draft'),
  )

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Woche {week.number}</span>
        <h1>{week.course ? week.course.name : 'Kurs offen'}</h1>
        <p className="lede">
          {formatRange(zurichIsoDate(new Date(week.startsAt)), zurichIsoDate(new Date(week.endsAt)))}
          {state_ === 'open' && ` · ${timeLeft(week.endsAt)}`}
          {state_ === 'upcoming' && ' · läuft noch nicht'}
          {state_ === 'closed' && ' · vorbei'}
        </p>
      </div>

      {waitingOnMe.length > 0 && (
        <div className="card card--accent stack">
          <div className="card-title">
            <h3>Wartet auf dich</h3>
            <span className="chip chip--green">{waitingOnMe.length}</span>
          </div>
          {waitingOnMe.map((round) => (
            <button
              key={round.id}
              className="list-item lookup-hit"
              onClick={() => navigate(`/karte/${round.id}`)}
            >
              <span className="avatar">
                {round.avatarUrl ? <img src={round.avatarUrl} alt="" /> : initials(round.playerName)}
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <strong>{round.playerName}</strong>
                <span className="muted small"> · {round.points} Punkte</span>
              </span>
              <span className="chip chip--amber">bestätigen</span>
            </button>
          ))}
        </div>
      )}

      {week.course && (
        <div className="card stack">
          <div className="card-title">
            <h3>So wird gespielt</h3>
            {week.course.ratingSource === 'estimate' && (
              <span className="chip chip--amber">Rating geschätzt</span>
            )}
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span className="value">{week.course.par}</span>
              <span className="label">Par</span>
            </div>
            <div className="stat">
              <span className="value">{week.course.courseRating.toFixed(1)}</span>
              <span className="label">Rating</span>
            </div>
            <div className="stat">
              <span className="value">{week.course.slopeRating}</span>
              <span className="label">Slope</span>
            </div>
            <div className="stat">
              <span className="value">{week.course.lengthM}</span>
              <span className="label">Meter</span>
            </div>
          </div>
          {settings && (
            <p className="muted small">
              Tee {week.course.tee} für alle · Gimmie {settings.gimmieMetres} m · Wind{' '}
              {settings.wind} · Greens {settings.greenSpeed} ·{' '}
              {settings.mulligans ? 'Mulligans erlaubt' : 'keine Mulligans'} ·{' '}
              {settings.practiceRounds ? 'Proberunden erlaubt' : 'keine Proberunden'} · nie allein
              spielen
            </p>
          )}
        </div>
      )}

      {week.course && state_ !== 'upcoming' && (
        <div className="card stack">
          <div className="card-title">
            <h3>Deine Karte</h3>
            {mine && <StatusChip status={mine.status} />}
          </div>
          {!mine || mine.status === 'draft' ? (
            <>
              <p className="muted small">
                {mine
                  ? `Angefangen: ${mine.played} von 18 Löchern.`
                  : 'Noch nichts eingetragen. Du kannst schon während der Runde Loch für Loch eintragen.'}
              </p>
              <button
                className="btn btn--primary"
                onClick={() => navigate(`/runde/${week.id}`)}
                disabled={state_ === 'closed'}
              >
                {mine ? 'Weiter eintragen' : 'Karte eintragen'}
              </button>
            </>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <span className="value" style={{ color: 'var(--green)' }}>
                    {mine.points}
                  </span>
                  <span className="label">Punkte</span>
                </div>
                <div className="stat">
                  <span className="value">{mine.gross}</span>
                  <span className="label">Brutto</span>
                </div>
              </div>
              <button className="btn btn--ghost" onClick={() => navigate(`/karte/${mine.id}`)}>
                Karte ansehen
              </button>
              {mine.status === 'submitted' && (
                <p className="muted small">
                  Wartet auf {mine.markerName ?? 'den Zähler'}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="card stack">
        <div className="card-title">
          <h3>Abgegeben</h3>
          <span className="muted small">
            {rounds?.filter((r) => r.status !== 'draft').length ?? 0} von{' '}
            {data.players.filter((p) => p.status === 'active').length}
          </span>
        </div>
        {rounds === null ? (
          <span className="spinner" />
        ) : (
          <div className="list">
            {rounds
              .filter((r) => r.status !== 'draft')
              .sort((a, b) => b.points - a.points)
              .map((round) => (
                <button
                  key={round.id}
                  className="list-item lookup-hit"
                  onClick={() => navigate(`/karte/${round.id}`)}
                >
                  <span className="avatar">
                    {round.avatarUrl ? (
                      <img src={round.avatarUrl} alt="" />
                    ) : (
                      initials(round.playerName)
                    )}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <strong>{round.playerName}</strong>
                    <br />
                    <span className="muted small">
                      Brutto {round.gross}
                      {round.adminNote ? ' · vom Admin korrigiert' : ''}
                    </span>
                  </span>
                  <StatusChip status={round.status} />
                  <span className="num handicap-cell">{round.points}</span>
                </button>
              ))}
            {rounds.filter((r) => r.status !== 'draft').length === 0 && (
              <p className="muted small">Noch niemand.</p>
            )}
          </div>
        )}
        {open.length > 0 && (
          <p className="muted small">
            Offen: {open.map((p) => p.name).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}

export function StatusChip({ status }: { status: string }) {
  if (status === 'confirmed') return <span className="chip chip--green">bestätigt</span>
  if (status === 'submitted') return <span className="chip chip--amber">unbestätigt</span>
  if (status === 'rejected') return <span className="chip chip--red">abgelehnt</span>
  return <span className="chip">Entwurf</span>
}
