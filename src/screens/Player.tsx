import { useEffect, useState } from 'react'
import { api } from '@/net/api'
import { navigate } from '@/state/router'
import { initials } from '@/screens/Profile'
import { StatusChip } from '@/screens/Week'
import { CLUBS } from '@/core/types'

interface PlayerPage {
  player: {
    id: string
    name: string
    avatarUrl: string | null
    outdoorHandicap: number | null
    clubDistances: Record<string, number>
    role: string
  }
  season: {
    startingHandicap: number | null
    indoorHandicap: number | null
    joinedWeek: number
    status: string
  } | null
  rounds: {
    id: string
    weekNumber: number
    courseName: string
    status: string
    points: number
    gross: number
    toPar: number
    played: number
    handicapIndex: number
    adminNote: string | null
  }[]
  stats: {
    roundsPlayed: number
    totalPoints: number
    average: number
    best: number
    worst: number
    eagles: number
    birdies: number
    pars: number
    bogeys: number
    worse: number
    holesPlayed: number
    biggestCut: number
  } | null
  badges: { kind: string; label: string; icon: string; count: number }[]
  history: {
    before: number | null
    after: number
    differential: number | null
    reason: string
    engine: string
  }[]
}

/**
 * Die Seite eines Spielers: alle Runden, die Statistik und der Handicap-Verlauf.
 *
 * Das ist der Ort, an dem man nachschaut, bevor man jemanden aufzieht — und der
 * Grund, warum niemand über Zahlen streiten muss.
 */
export function Player({ playerId }: { playerId: string }) {
  const [data, setData] = useState<PlayerPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .get<PlayerPage>(`/api/players/${playerId}`)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [playerId])

  if (error) {
    return (
      <div className="page">
        <div className="notice notice--error">{error}</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  const { player, season, rounds, stats, history, badges } = data
  const clubs = CLUBS.filter((club) => player.clubDistances[club])

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Spieler</span>
        <h1>{player.name}</h1>
        {season?.status === 'withdrawn' && <p className="lede">Ausgeschieden</p>}
      </div>

      <div className="card stack">
        <div className="row">
          <span className="avatar avatar--lg">
            {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : initials(player.name)}
          </span>
          <div className="handicap-pair" style={{ flex: 1, border: 0, padding: 0 }}>
            <div className="stat">
              <span className="value" style={{ color: 'var(--green)' }}>
                {season?.indoorHandicap?.toFixed(1) ?? '—'}
              </span>
              <span className="label">Indoor</span>
            </div>
            <div className="stat">
              <span className="value">{player.outdoorHandicap?.toFixed(1) ?? '—'}</span>
              <span className="label">Draussen</span>
            </div>
          </div>
        </div>
        {season && season.startingHandicap !== null && (
          <p className="muted small">
            Gestartet mit {season.startingHandicap.toFixed(1)}
            {season.joinedWeek > 1 && ` · dabei ab Woche ${season.joinedWeek}`}
          </p>
        )}
      </div>

      {stats && stats.roundsPlayed > 0 && (
        <div className="card">
          <div className="card-title">
            <h3>Saison</h3>
            <span className="muted small">{stats.holesPlayed} Löcher gespielt</span>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <span className="value">{stats.totalPoints}</span>
              <span className="label">Punkte</span>
            </div>
            <div className="stat">
              <span className="value">{stats.average.toFixed(1)}</span>
              <span className="label">Schnitt</span>
            </div>
            <div className="stat">
              <span className="value" style={{ color: 'var(--green)' }}>
                {stats.best}
              </span>
              <span className="label">Beste</span>
            </div>
            <div className="stat">
              <span className="value">{stats.worst}</span>
              <span className="label">Schlechteste</span>
            </div>
          </div>
          <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />
          <div className="stat-grid">
            <div className="stat">
              <span className="value" style={{ color: 'var(--gold)' }}>
                {stats.eagles}
              </span>
              <span className="label">Eagles</span>
            </div>
            <div className="stat">
              <span className="value" style={{ color: 'var(--green)' }}>
                {stats.birdies}
              </span>
              <span className="label">Birdies</span>
            </div>
            <div className="stat">
              <span className="value">{stats.pars}</span>
              <span className="label">Pars</span>
            </div>
            <div className="stat">
              <span className="value">{stats.bogeys}</span>
              <span className="label">Bogeys</span>
            </div>
          </div>
        </div>
      )}

      {(badges.length > 0 || (stats?.biggestCut ?? 0) > 0) && (
        <div className="card stack">
          <div className="card-title">
            <h3>Abzeichen</h3>
          </div>
          <div className="badges">
            {badges.map((badge) => (
              <span className="badge" key={badge.kind} title={badge.label}>
                <span className="badge-icon">{badge.icon}</span>
                <span className="badge-label">{badge.label}</span>
                {badge.count > 1 && <span className="badge-count">×{badge.count}</span>}
              </span>
            ))}
            {(stats?.biggestCut ?? 0) > 0 && (
              <span className="badge" title="Grösster Schnitt am Handicap in einer Runde">
                <span className="badge-icon">✂️</span>
                <span className="badge-label">Grösster Cut</span>
                <span className="badge-count">−{stats!.biggestCut.toFixed(1)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="card">
          <div className="card-title">
            <h3>Runden</h3>
          </div>
          <div className="table">
            {rounds.map((round) => (
              <button
                key={round.id}
                className="table-row"
                onClick={() => navigate(`/karte/${round.id}`)}
              >
                <span className="week-no">{round.weekNumber}</span>
                <span className="table-name">
                  <strong>{round.courseName}</strong>
                  <span className="muted small">
                    Brutto {round.gross} · HCP {round.handicapIndex.toFixed(1)}
                    {round.played < 18 && ` · ${18 - round.played} ohne Ergebnis`}
                  </span>
                </span>
                <StatusChip status={round.status} />
                <span className="table-total num">{round.points}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="card-title">
            <h3>Handicap-Verlauf</h3>
            <span className="muted small">{history[0].engine === 'whs' ? 'WHS' : 'CONGU'}</span>
          </div>
          <div className="list">
            {history.map((event, i) => (
              <div className="list-item" key={i}>
                <span className="num history-pair">
                  <span className="muted">{event.before?.toFixed(1) ?? '—'}</span>
                  <span className="history-arrow">→</span>
                  <strong
                    style={{
                      color:
                        event.before !== null && event.after < event.before
                          ? 'var(--green)'
                          : event.before !== null && event.after > event.before
                            ? 'var(--amber)'
                            : 'var(--ink)',
                    }}
                  >
                    {event.after.toFixed(1)}
                  </strong>
                </span>
                <span className="muted small" style={{ flex: 1 }}>
                  {event.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {clubs.length > 0 && (
        <div className="card">
          <div className="card-title">
            <h3>Schlägerdistanzen</h3>
          </div>
          <div className="club-grid">
            {clubs.map((club) => (
              <div className="club-row" key={club}>
                <span>{club}</span>
                <strong className="num">{player.clubDistances[club]} m</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn--quiet" onClick={() => navigate('/')}>
        Zurück zur Liga
      </button>
    </div>
  )
}
