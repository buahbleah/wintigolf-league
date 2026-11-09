import { useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { formatRange, zurichIsoDate } from '@/core/dates'
import { weekState, type LeagueData } from '@/state/league'

/**
 * Wochen und Kurszuteilung.
 *
 * Hier verteilt der Admin die Wochen an die Spieler, verschiebt sie über
 * Feiertage, startet die Saison und sieht auf einen Blick, wo noch kein Kurs
 * steht.
 */
export function WeeksScreen({ data, onChange }: { data: LeagueData; onChange: () => void }) {
  const season = data.season!
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = data.players.filter((p) => p.status === 'active')
  const withoutWeek = active.filter((p) => !data.weeks.some((w) => w.picker?.id === p.id))

  async function patchWeek(weekId: string, payload: unknown) {
    setBusy(weekId)
    setError(null)
    try {
      await api.patch(`/api/weeks/${weekId}`, payload)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  async function patchSeason(payload: unknown, tag: string) {
    setBusy(tag)
    setError(null)
    try {
      await api.patch(`/api/seasons/${season.id}`, payload)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Verwaltung</span>
        <h1>Wochen</h1>
        <p className="lede">
          {data.weeks.length} Wochen · {active.length} von {season.settings.maxPlayers} Spielern
          {withoutWeek.length > 0 && ` · ${withoutWeek.length} ohne eigene Woche`}
        </p>
      </div>

      {season.status === 'draft' && (
        <div className="card card--accent stack">
          <h3>Saison starten</h3>
          <p className="muted small">
            Mit dem Start frieren die Handicaps ein: ab dann rechnet nur noch das System. Teile
            vorher den Liga-Code aus, damit alle ihr Outdoor-Handicap eingetragen haben.
          </p>
          <button
            className="btn btn--primary"
            onClick={() => patchSeason({ status: 'active' }, 'start')}
            disabled={busy === 'start'}
          >
            Saison starten
          </button>
        </div>
      )}

      {season.status === 'active' && (
        <div className="card stack">
          <div className="card-title">
            <h3>Liga pausieren</h3>
            {season.pausedAt && <span className="chip chip--amber">pausiert</span>}
          </div>
          <p className="muted small">
            Wenn der Simulator steht oder alle in den Ferien sind: pausieren und die restlichen
            Wochen um eine Woche nach hinten schieben.
          </p>
          <div className="row">
            <button
              className="btn btn--ghost"
              onClick={() => patchSeason({ pause: !season.pausedAt }, 'pause')}
              disabled={busy === 'pause'}
            >
              {season.pausedAt ? 'Pause aufheben' : 'Pausieren'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="notice notice--error">{error}</div>}

      <div className="stack stack--tight">
        {data.weeks.map((week) => {
          const state = weekState(week)
          return (
            <div className="card week-row" key={week.id}>
              <div className="week-row-head">
                <div className="week-no">{week.number}</div>
                <div className="stack stack--tight" style={{ flex: 1, gap: 2 }}>
                  <strong>
                    {formatRange(zurichIsoDate(new Date(week.startsAt)), zurichIsoDate(new Date(week.endsAt)))}
                  </strong>
                  <span className="muted small">
                    {week.course
                      ? `${week.course.name} · ${week.course.tee} · Par ${week.course.par}`
                      : 'Noch kein Kurs'}
                  </span>
                </div>
                <span
                  className={
                    state === 'open' ? 'chip chip--green' : state === 'closed' ? 'chip' : 'chip'
                  }
                >
                  {state === 'open' ? 'läuft' : state === 'closed' ? 'vorbei' : 'kommt'}
                </span>
              </div>

              <div className="week-row-foot">
                <select
                  value={week.picker?.id ?? ''}
                  disabled={busy === week.id}
                  onChange={(e) => patchWeek(week.id, { pickerId: e.target.value || null })}
                  aria-label={`Wer bestimmt den Kurs in Woche ${week.number}`}
                >
                  <option value="">Wer wählt?</option>
                  {active.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--quiet"
                  onClick={() => navigate(`/kurs/${week.id}`)}
                >
                  {week.course ? 'Kurs ändern' : 'Kurs eintragen'}
                </button>
                {state !== 'closed' && (
                  <button
                    className="btn btn--quiet"
                    onClick={() => patchSeason({ shiftFrom: week.number, shiftDays: 7 }, week.id)}
                    disabled={busy === week.id}
                    title="Diese und alle folgenden Wochen um eine Woche nach hinten"
                  >
                    +1 Woche
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
