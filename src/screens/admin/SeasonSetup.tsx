import { useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { DEFAULT_SETTINGS } from '@/core/settings'
import { addDays, formatRange, nextWeekday, weekdayOf, zurichIsoDate } from '@/core/dates'

/**
 * Saison anlegen.
 *
 * Nur das Nötigste: Name, Startmontag, Anzahl Wochen, Streichresultate,
 * Spielerzahl. Alles Weitere steht in den Einstellungen und lässt sich danach
 * drehen — hier soll niemand vierzig Schrauben sehen, bevor es losgeht.
 */
export function SeasonSetup({ onDone }: { onDone: () => void }) {
  const today = zurichIsoDate(new Date())
  const [name, setName] = useState(`Saison ${new Date().getFullYear()}/${String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}`)
  const [startDate, setStartDate] = useState(nextWeekday(today, 1))
  const [weeks, setWeeks] = useState(DEFAULT_SETTINGS.weeks)
  const [dropped, setDropped] = useState(DEFAULT_SETTINGS.droppedWeeks)
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_SETTINGS.maxPlayers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mondayWarning = weekdayOf(startDate) !== 1
  const lastDay = addDays(startDate, weeks * 7 - 1)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/seasons', {
        name,
        startDate,
        settings: { weeks, droppedWeeks: dropped, maxPlayers },
      })
      onDone()
      navigate('/admin/wochen')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Verwaltung</span>
        <h1>Saison anlegen</h1>
        <p className="lede">
          Danach bekommst du den Liga-Code zum Weitergeben, und jeder Spieler kriegt seine Woche.
        </p>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor="sname">Name der Saison</label>
          <input id="sname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="sstart">Erster Spieltag</label>
          <input
            id="sstart"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {mondayWarning ? (
            <span className="field-error">
              Eine Spielwoche läuft von Montag bis Sonntag — such bitte einen Montag.
            </span>
          ) : (
            <span className="hint">Woche 1: {formatRange(startDate, addDays(startDate, 6))}</span>
          )}
        </div>

        <div className="trio">
          <div className="field">
            <label htmlFor="sweeks">Wochen</label>
            <input
              id="sweeks"
              type="number"
              min={2}
              max={30}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="sdrop">Streichresultate</label>
            <input
              id="sdrop"
              type="number"
              min={0}
              max={Math.max(0, weeks - 1)}
              value={dropped}
              onChange={(e) => setDropped(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="smax">Spieler</label>
            <input
              id="smax"
              type="number"
              min={2}
              max={60}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="notice">
          {weeks} Wochen bis {formatRange(addDays(lastDay, -6), lastDay)} · es zählen die besten{' '}
          {Math.max(1, weeks - dropped)} · höchstens {maxPlayers} Spieler
        </div>

        {error && <div className="notice notice--error">{error}</div>}

        <button
          className="btn btn--primary btn--block"
          onClick={create}
          disabled={busy || mondayWarning || !name.trim()}
        >
          {busy ? <span className="spinner" /> : null}
          Saison anlegen
        </button>
        <p className="muted small center">
          Die Saison startet als Entwurf. Gestartet wird sie erst, wenn alle da sind — dann frieren
          die Handicaps ein.
        </p>
      </div>
    </div>
  )
}
