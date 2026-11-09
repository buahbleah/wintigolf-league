import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { initials } from '@/screens/Profile'
import { ROUND_LABELS } from '@/core/settings'
import { formatRange, timeLeft, zurichIsoDate } from '@/core/dates'
import { Mark } from '@/ui/Brand'

interface MatchSideView {
  id: string
  name: string
  seed: number | null
  avatarUrl: string | null
}

interface Match {
  id: string
  roundName: string
  slot: number
  weekId: string
  weekNumber: number
  startsAt: string
  endsAt: string
  home: MatchSideView | null
  away: MatchSideView | null
  courseId: string | null
  courseName: string | null
  pickerId: string | null
  winnerId: string | null
  result: string | null
  decidedBy: string | null
  live: { label: string; standing: number; played: number; allSquare: boolean } | null
  cards: { userId: string; roundId: string; status: string; points: number }[]
}

interface PlayoffData {
  season: {
    id: string
    name: string
    status: string
    playoffSize: number
    thirdPlace: boolean
  } | null
  matches: Match[]
  seasonWinner: { userId: string; name: string; total: number } | null
  champion: { userId: string; name: string; result: string | null } | null
}

/**
 * Das Bracket.
 *
 * Jede Runde eine Woche, jede Paarung ein Match über achtzehn Löcher. Das
 * Resultat rechnet die App aus den beiden Karten — eingetragen wird nur, was
 * sich daraus nicht ergibt: das Stechen nach einem geteilten Match.
 */
export function Playoffs() {
  const { state } = useSession()
  const me = state.user!
  const [data, setData] = useState<PlayoffData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api.get<PlayoffData>('/api/playoffs'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function startPlayoffs() {
    setBusy('start')
    setError(null)
    try {
      await api.post('/api/playoffs')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  async function decide(match: Match, payload: unknown) {
    setBusy(match.id)
    setError(null)
    try {
      await api.patch(`/api/matches/${match.id}`, payload)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  if (!data) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  if (!data.season) {
    return (
      <div className="page">
        <div className="empty">
          <p>Es läuft keine Saison.</p>
        </div>
      </div>
    )
  }

  if (data.matches.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <span className="eyebrow">Playoffs</span>
          <h1>Noch nicht so weit</h1>
          <p className="lede">
            Nach der letzten Spielwoche treten die besten {data.season.playoffSize} im Matchplay
            gegeneinander an.
          </p>
        </div>
        {me.role === 'admin' && (
          <div className="card card--accent stack">
            <h3>Playoffs starten</h3>
            <p className="muted small">
              Setzt das Bracket nach der Tabelle: die Nummer 1 gegen die letzte Qualifizierte, und
              so, dass sich 1 und 2 frühestens im Final treffen. Danach lässt sich daran nichts
              mehr verschieben.
            </p>
            {error && <div className="notice notice--error">{error}</div>}
            <button className="btn btn--primary" onClick={startPlayoffs} disabled={busy === 'start'}>
              {busy === 'start' ? <span className="spinner" /> : 'Bracket setzen'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const rounds = [...new Set(data.matches.map((m) => m.roundName))]

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">{data.season.name}</span>
        <h1>Playoffs</h1>
      </div>

      {data.champion && (
        <div className="champion">
          <Mark size={44} />
          <span className="champion-label">Overall Winner</span>
          <strong className="champion-name">{data.champion.name}</strong>
          {data.champion.result && <span className="muted small">Final {data.champion.result}</span>}
          {data.seasonWinner && data.seasonWinner.userId !== data.champion.userId && (
            <p className="muted small">
              Grundsaison-Sieger: {data.seasonWinner.name} mit {data.seasonWinner.total} Punkten
            </p>
          )}
        </div>
      )}

      {error && <div className="notice notice--error">{error}</div>}

      {rounds.map((roundName) => (
        <div className="card stack" key={roundName}>
          <div className="card-title">
            <h3>{ROUND_LABELS[roundName] ?? roundName}</h3>
            <span className="muted small">
              {weekLabel(data.matches.find((m) => m.roundName === roundName)!)}
            </span>
          </div>

          {data.matches
            .filter((m) => m.roundName === roundName)
            .map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                meId={me.id}
                isAdmin={me.role === 'admin'}
                busy={busy === match.id}
                onDecide={(payload) => decide(match, payload)}
              />
            ))}
        </div>
      ))}

      {data.seasonWinner && !data.champion && (
        <div className="card stack">
          <div className="card-title">
            <h3>Grundsaison</h3>
          </div>
          <p className="muted small">
            {data.seasonWinner.name} führt die Tabelle mit {data.seasonWinner.total} Punkten an —
            eine eigene Ehre, unabhängig vom Playoff.
          </p>
        </div>
      )}
    </div>
  )
}

function weekLabel(match: Match): string {
  const left = timeLeft(match.endsAt)
  if (left !== 'abgelaufen') return left
  return formatRange(zurichIsoDate(new Date(match.startsAt)), zurichIsoDate(new Date(match.endsAt)))
}

function MatchCard({
  match,
  meId,
  isAdmin,
  busy,
  onDecide,
}: {
  match: Match
  meId: string
  isAdmin: boolean
  busy: boolean
  onDecide: (payload: unknown) => void
}) {
  const involved = match.home?.id === meId || match.away?.id === meId
  const iPick = match.pickerId === meId
  const open = !match.winnerId

  return (
    <div className="match">
      <div className="match-side">
        <Side side={match.home} winner={match.winnerId === match.home?.id} />
        <span className="match-vs">
          {match.live && open ? match.live.label : (match.result ?? 'gegen')}
        </span>
        <Side side={match.away} winner={match.winnerId === match.away?.id} />
      </div>

      <div className="match-foot">
        {match.courseName ? (
          <span className="muted small">{match.courseName}</span>
        ) : match.home && match.away ? (
          <span className="chip chip--amber">Kurs offen</span>
        ) : (
          <span className="muted small">wartet auf die Runde davor</span>
        )}

        {open && iPick && !match.courseId && (
          <button className="btn btn--quiet" onClick={() => navigate(`/kurs/match/${match.id}`)}>
            Kurs wählen
          </button>
        )}

        {open && involved && match.courseId && (
          <button className="btn btn--quiet" onClick={() => navigate(`/runde/${match.weekId}`)}>
            Karte eintragen
          </button>
        )}

        {match.cards.map((card) => (
          <button
            key={card.roundId}
            className="btn btn--quiet"
            onClick={() => navigate(`/karte/${card.roundId}`)}
          >
            Karte ansehen
          </button>
        ))}
      </div>

      {open && match.live?.allSquare && (involved || isAdmin) && (
        <div className="notice notice--warn stack">
          <span>Geteilt nach achtzehn Löchern — es geht ins Stechen ab Loch 1.</span>
          <div className="row">
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => onDecide({ suddenDeathWinnerId: match.home!.id })}
            >
              {match.home!.name} gewinnt
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => onDecide({ suddenDeathWinnerId: match.away!.id })}
            >
              {match.away!.name} gewinnt
            </button>
          </div>
        </div>
      )}

      {open && isAdmin && match.home && match.away && (
        <button className="btn btn--quiet" disabled={busy} onClick={() => onDecide({ walkover: true })}>
          Kampflos weiterkommen lassen
        </button>
      )}
    </div>
  )
}

function Side({ side, winner }: { side: MatchSideView | null; winner: boolean }) {
  if (!side) {
    return (
      <span className="match-player is-empty">
        <span className="avatar">?</span>
        <span className="muted small">offen</span>
      </span>
    )
  }
  return (
    <button
      className={`match-player${winner ? ' is-winner' : ''}`}
      onClick={() => navigate(`/spieler/${side.id}`)}
    >
      <span className="avatar">
        {side.avatarUrl ? <img src={side.avatarUrl} alt="" /> : initials(side.name)}
      </span>
      <span className="match-name">
        {side.seed !== null && <span className="seed">{side.seed}</span>}
        {side.name}
      </span>
    </button>
  )
}
