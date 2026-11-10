import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { initials } from '@/screens/Profile'
import type { Season } from '@/state/league'

interface AdminPlayer {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  avatarUrl: string | null
  outdoorHandicap: number | null
  startingHandicap: number | null
  indoorHandicap: number | null
  joinedWeek: number | null
  status: 'active' | 'withdrawn' | 'none'
  rounds: number
  isMe: boolean
}

/**
 * Spieler verwalten.
 *
 * Vier Dinge, die man je einmal braucht und dann sofort: jemanden zum Admin
 * machen, ein Handicap richtigstellen, einen Aussteiger aus der Tabelle nehmen,
 * eine Einzelrunde freigeben. Alles andere regelt die Liga von selbst.
 */
export function PlayersScreen({ season, onChange }: { season: Season | null; onChange: () => void }) {
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null)
  const [seasonStarted, setSeasonStarted] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ players: AdminPlayer[]; seasonStarted: boolean }>(
        '/api/admin/players',
      )
      setPlayers(res.players)
      setSeasonStarted(res.seasonStarted)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(player: AdminPlayer, payload: Record<string, unknown>, said?: string) {
    setBusy(player.id)
    setError(null)
    setNote(null)
    try {
      await api.patch('/api/admin/players', { userId: player.id, ...payload })
      if (said) setNote(said)
      await load()
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
        <h1>Spieler</h1>
        <p className="lede">
          {players ? `${players.length} Konten` : 'Wird geladen'}
          {season && !seasonStarted && ' · Saison noch nicht gestartet, Handicaps sind frei änderbar'}
        </p>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {note && <div className="notice notice--ok">{note}</div>}

      {players === null ? (
        <span className="spinner" style={{ margin: '0 auto' }} />
      ) : (
        <div className="stack stack--tight">
          {players.map((player) => (
            <div className="card stack stack--tight" key={player.id}>
              <div className="row">
                <span className="avatar">
                  {player.avatarUrl ? (
                    <img src={player.avatarUrl} alt="" />
                  ) : (
                    initials(player.name)
                  )}
                </span>
                <span className="stack stack--tight" style={{ flex: 1, gap: 0 }}>
                  <strong>
                    {player.name}
                    {player.isMe && <span className="muted small"> · du</span>}
                  </strong>
                  <span className="muted small">{player.email}</span>
                </span>
                {player.role === 'admin' && <span className="chip chip--green">Admin</span>}
                {player.status === 'withdrawn' && <span className="chip chip--red">raus</span>}
                {player.status === 'none' && <span className="chip chip--amber">nicht dabei</span>}
              </div>

              <div className="row" style={{ gap: 'var(--space-4)' }}>
                <span className="stat">
                  <span className="value" style={{ fontSize: 'var(--text-lg)', color: 'var(--green)' }}>
                    {player.indoorHandicap?.toFixed(1) ?? '—'}
                  </span>
                  <span className="label">Indoor</span>
                </span>
                <span className="stat">
                  <span className="value" style={{ fontSize: 'var(--text-lg)' }}>
                    {player.outdoorHandicap?.toFixed(1) ?? '—'}
                  </span>
                  <span className="label">Draussen</span>
                </span>
                <span className="stat">
                  <span className="value" style={{ fontSize: 'var(--text-lg)' }}>
                    {player.rounds}
                  </span>
                  <span className="label">Runden</span>
                </span>
              </div>

              {editing === player.id ? (
                <div className="row">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value.replace(',', '.'))}
                    inputMode="decimal"
                    placeholder="Indoor-Handicap"
                    style={{
                      flex: 1,
                      minHeight: 44,
                      padding: '0 12px',
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  />
                  <button
                    className="btn btn--primary"
                    disabled={busy === player.id}
                    onClick={async () => {
                      await patch(player, { indoorHandicap: value }, 'Handicap gesetzt.')
                      setEditing(null)
                    }}
                  >
                    Setzen
                  </button>
                  <button className="btn btn--quiet" onClick={() => setEditing(null)}>
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className="admin-actions">
                  <button
                    className="btn btn--quiet"
                    onClick={() => navigate(`/spieler/${player.id}`)}
                  >
                    Profil
                  </button>

                  {player.status !== 'none' && (
                    <button
                      className="btn btn--quiet"
                      onClick={() => {
                        setEditing(player.id)
                        setValue(player.indoorHandicap?.toFixed(1) ?? '')
                      }}
                    >
                      Handicap
                    </button>
                  )}

                  {player.role === 'member' ? (
                    <button
                      className="btn btn--quiet"
                      disabled={busy === player.id}
                      onClick={() =>
                        patch(player, { role: 'admin' }, `${player.name} ist jetzt Admin.`)
                      }
                    >
                      Zum Admin machen
                    </button>
                  ) : (
                    !player.isMe && (
                      <button
                        className="btn btn--quiet"
                        disabled={busy === player.id}
                        onClick={() =>
                          patch(player, { role: 'member' }, `${player.name} ist kein Admin mehr.`)
                        }
                      >
                        Admin entziehen
                      </button>
                    )
                  )}

                  {player.status === 'active' && (
                    <>
                      <button
                        className="btn btn--quiet"
                        disabled={busy === player.id}
                        onClick={() =>
                          patch(
                            player,
                            { approveSolo: true },
                            `Einzelrunde für ${player.name} freigegeben.`,
                          )
                        }
                      >
                        Einzelrunde freigeben
                      </button>
                      <button
                        className="btn btn--quiet"
                        style={{ color: 'var(--red)' }}
                        disabled={busy === player.id}
                        onClick={() =>
                          patch(
                            player,
                            { status: 'withdrawn' },
                            `${player.name} ist ausgeschieden.`,
                          )
                        }
                      >
                        Ausscheiden
                      </button>
                    </>
                  )}

                  {player.status === 'withdrawn' && (
                    <button
                      className="btn btn--quiet"
                      disabled={busy === player.id}
                      onClick={() =>
                        patch(player, { status: 'active' }, `${player.name} spielt wieder mit.`)
                      }
                    >
                      Wieder aufnehmen
                    </button>
                  )}

                  {player.status === 'none' && season && (
                    <button
                      className="btn btn--ghost"
                      disabled={busy === player.id}
                      onClick={() =>
                        patch(player, { addToSeason: true }, `${player.name} ist dabei.`)
                      }
                    >
                      In die Saison aufnehmen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="muted small">
        Das Handicap eines Spielers zu setzen, wirkt nach vorne: gespielte Runden behalten den
        Wert, mit dem sie gespielt wurden. Vor dem Saisonstart zieht der Startwert mit, danach
        steht die Änderung als eigener Eintrag im Verlauf.
      </p>
    </div>
  )
}
