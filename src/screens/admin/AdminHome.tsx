import { useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import type { LeagueData } from '@/state/league'

const STATUS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'läuft',
  playoffs: 'Playoffs',
  finished: 'abgeschlossen',
  archived: 'archiviert',
}

/**
 * Die Verwaltung.
 *
 * Oben die Saison mit ihrem Zustand und den Schritten, die von hier aus gehen,
 * darunter die drei Bereiche. Der heikelste Knopf — löschen — fragt zweimal
 * und ist gesperrt, sobald eine Karte abgegeben wurde.
 */
export function AdminHome({ data, onChange }: { data: LeagueData; onChange: () => void }) {
  const season = data.season
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const played = data.weeks.reduce((sum, week) => sum + week.submitted, 0)

  async function act(payload: unknown, tag: string) {
    if (!season) return
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

  async function remove() {
    if (!season) return
    setBusy('delete')
    setError(null)
    try {
      await api.del(`/api/seasons/${season.id}`)
      setConfirming(false)
      onChange()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
      setConfirming(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Verwaltung</span>
        <h1>{season ? season.name : 'Keine Saison'}</h1>
        {season && (
          <p className="lede">
            {STATUS[season.status] ?? season.status} ·{' '}
            {played === 0 ? 'noch keine Karte abgegeben' : `${played} Karten abgegeben`}
          </p>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      {!season ? (
        <button className="btn btn--primary btn--block" onClick={() => navigate('/admin/saison')}>
          Saison anlegen
        </button>
      ) : (
        <>
          <div className="stack stack--tight">
            <button className="btn btn--ghost btn--block" onClick={() => navigate('/admin/spieler')}>
              Spieler
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => navigate('/admin/wochen')}>
              Wochen und Kurszuteilung
            </button>
            <button
              className="btn btn--ghost btn--block"
              onClick={() => navigate('/admin/einstellungen')}
            >
              Einstellungen der Liga
            </button>
          </div>

          <div className="card stack">
            <div className="card-title">
              <h3>Saison</h3>
              <span className="chip">{STATUS[season.status] ?? season.status}</span>
            </div>

            {season.status === 'draft' && (
              <>
                <p className="muted small">
                  Noch nicht gestartet. Mit dem Start frieren die Handicaps ein: ab dann rechnet
                  nur noch das System.
                </p>
                <button
                  className="btn btn--primary"
                  disabled={busy === 'start'}
                  onClick={() => act({ status: 'active' }, 'start')}
                >
                  Saison starten
                </button>
              </>
            )}

            {season.status === 'active' && (
              <>
                <p className="muted small">
                  Läuft. Die Playoffs startest du, wenn die letzte Spielwoche vorbei ist — der
                  Knopf dafür steht im Playoff-Bereich.
                </p>
                <button className="btn btn--ghost" onClick={() => navigate('/playoffs')}>
                  Zu den Playoffs
                </button>
              </>
            )}

            {(season.status === 'playoffs' || season.status === 'finished') && (
              <>
                <p className="muted small">
                  {season.status === 'finished'
                    ? 'Abgeschlossen. Archivieren macht den Weg frei für die nächste Saison — die Indoor-Handicaps werden dabei übernommen.'
                    : 'Die Playoffs laufen. Sobald der Final entschieden ist, schliesst sich die Saison von selbst.'}
                </p>
                {season.status === 'finished' && (
                  <button
                    className="btn btn--primary"
                    disabled={busy === 'archive'}
                    onClick={() => act({ status: 'archived' }, 'archive')}
                  >
                    Archivieren
                  </button>
                )}
              </>
            )}

            <hr className="divider" />

            {/* Löschen: nur solange nichts gespielt ist, und mit Rückfrage. */}
            {played === 0 ? (
              confirming ? (
                <>
                  <div className="notice notice--warn">
                    «{season.name}» mit allen Wochen und Kursen endgültig löschen? Das lässt sich
                    nicht rückgängig machen.
                  </div>
                  <div className="row">
                    <button
                      className="btn btn--danger"
                      disabled={busy === 'delete'}
                      onClick={remove}
                    >
                      Ja, löschen
                    </button>
                    <button className="btn btn--quiet" onClick={() => setConfirming(false)}>
                      Doch nicht
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted small">
                    Solange keine Karte abgegeben ist, lässt sich die Saison wegwerfen und neu
                    anlegen — zum Ausprobieren.
                  </p>
                  <button
                    className="btn btn--quiet"
                    style={{ color: 'var(--red)' }}
                    onClick={() => setConfirming(true)}
                  >
                    Saison löschen
                  </button>
                </>
              )
            ) : (
              <p className="muted small">
                Mit {played} abgegebenen Karten lässt sich die Saison nicht mehr löschen — daran
                hängen Runden, Belege und der Handicap-Verlauf. Abschliessen und archivieren geht
                immer.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
