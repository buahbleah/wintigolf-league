import { useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { formatDateTime, formatRange, zurichIsoDate, zurichTime } from '@/core/dates'
import { weekState, type LeagueData } from '@/state/league'

interface Dates {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

function datesOf(week: { startsAt: string | Date; endsAt: string | Date }): Dates {
  const start = new Date(week.startsAt)
  const end = new Date(week.endsAt)
  return {
    startDate: zurichIsoDate(start),
    startTime: zurichTime(start),
    endDate: zurichIsoDate(end),
    endTime: zurichTime(end),
  }
}

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

  /* Welche Woche gerade bearbeitet wird, und wie ihre Felder stehen. */
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Dates | null>(null)

  /* Der Saisonstart als Datum und Uhrzeit der ersten Woche. */
  const firstWeek = data.weeks[0]
  const firstStart = firstWeek ? String(firstWeek.startsAt) : ''
  const [start, setStart] = useState({ date: '', time: '' })

  /* Nach jeder Verschiebung stehen neue Termine in den Daten — die Felder
     ziehen nach, statt den eben abgeschickten Wert weiterzuzeigen. */
  useEffect(() => {
    if (!firstStart) return
    const at = new Date(firstStart)
    setStart({ date: zurichIsoDate(at), time: zurichTime(at) })
  }, [firstStart])

  const active = data.players.filter((p) => p.status === 'active')
  const withoutWeek = active.filter((p) => !data.weeks.some((w) => w.picker?.id === p.id))

  /** Gibt zurück, ob es geklappt hat — der Editor bleibt sonst offen. */
  async function patchWeek(weekId: string, payload: unknown): Promise<boolean> {
    setBusy(weekId)
    setError(null)
    try {
      await api.patch(`/api/weeks/${weekId}`, payload)
      onChange()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
      return false
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

      {/* ------------------------------------------- Die Saison verschieben */}
      {firstWeek && (
        <div className="card stack">
          <div className="card-title">
            <h3>Saisonstart</h3>
            <span className="chip">verschiebt alle Wochen mit</span>
          </div>
          <p className="muted small">
            Wann Woche 1 beginnt. Änderst du das, rücken alle Wochen um denselben Betrag mit — samt
            ihren Einreicheterminen und samt dem, was du an einzelnen Wochen schon von Hand
            gerichtet hast. Eine Woche, in der bereits eine Karte liegt, lässt sich nicht von ihr
            wegschieben.
          </p>
          <div className="pair">
            <div className="field">
              <label htmlFor="sdate">Datum</label>
              <input
                id="sdate"
                type="date"
                value={start.date}
                onChange={(e) => setStart({ ...start, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="stime">Uhrzeit</label>
              <input
                id="stime"
                type="time"
                value={start.time}
                onChange={(e) => setStart({ ...start, time: e.target.value })}
              />
            </div>
          </div>
          <button
            className="btn btn--ghost"
            disabled={busy === 'start-date' || !start.date || !start.time}
            onClick={() => patchSeason({ startDate: start.date, startTime: start.time }, 'start-date')}
          >
            {busy === 'start-date' ? <span className="spinner" /> : 'Saison verschieben'}
          </button>
        </div>
      )}

      {error && !editing && <div className="notice notice--error">{error}</div>}

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
                    Einreichen bis {formatDateTime(week.endsAt)}
                  </span>
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
                <button
                  className="btn btn--quiet"
                  onClick={() => {
                    setError(null)
                    if (editing === week.id) {
                      setEditing(null)
                      setDraft(null)
                    } else {
                      setEditing(week.id)
                      setDraft(datesOf(week))
                    }
                  }}
                >
                  {editing === week.id ? 'Schliessen' : 'Termine'}
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

              {editing === week.id && draft && (
                <div className="stack stack--tight week-dates">
                  {error && <div className="notice notice--error">{error}</div>}
                  <div className="pair">
                    <div className="field">
                      <label htmlFor={`sd-${week.id}`}>Beginn</label>
                      <input
                        id={`sd-${week.id}`}
                        type="date"
                        value={draft.startDate}
                        onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`st-${week.id}`}>Uhrzeit</label>
                      <input
                        id={`st-${week.id}`}
                        type="time"
                        value={draft.startTime}
                        onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="pair">
                    <div className="field">
                      <label htmlFor={`ed-${week.id}`}>Einreichen bis</label>
                      <input
                        id={`ed-${week.id}`}
                        type="date"
                        value={draft.endDate}
                        onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`et-${week.id}`}>Uhrzeit</label>
                      <input
                        id={`et-${week.id}`}
                        type="time"
                        value={draft.endTime}
                        onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn--ghost"
                    disabled={busy === week.id}
                    onClick={async () => {
                      if (await patchWeek(week.id, draft)) {
                        setEditing(null)
                        setDraft(null)
                      }
                    }}
                  >
                    {busy === week.id ? <span className="spinner" /> : `Woche ${week.number} festlegen`}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
