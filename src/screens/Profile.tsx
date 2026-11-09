import { useRef, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { useSession } from '@/state/session'
import { navigate } from '@/state/router'
import { CLUBS, type User } from '@/core/types'

/**
 * Das eigene Profil.
 *
 * Name, Bild, Handicap und Schlägerdistanzen. Gespeichert wird erst auf Knopf
 * druck, damit ein halb getippter Wert nie beim Server landet.
 */
export function Profile() {
  const { state, setUser, signOut } = useSession()
  const user = state.user as User

  const [name, setName] = useState(user.name)
  const [handicap, setHandicap] = useState(
    user.outdoorHandicap === null ? '' : String(user.outdoorHandicap),
  )
  const [avatar, setAvatar] = useState(user.avatarUrl)
  const [distances, setDistances] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(user.clubDistances).map(([k, v]) => [k, String(v)])),
  )
  const [showClubs, setShowClubs] = useState(Object.keys(user.clubDistances).length > 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const indoor = state.season?.indoorHandicap ?? null
  const seasonRunning = state.season?.status === 'active' || state.season?.status === 'playoffs'

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await api.patch<{ user: User }>('/api/profile', {
        name,
        avatarUrl: avatar,
        outdoorHandicap: handicap === '' ? null : handicap,
        clubDistances: distances,
      })
      setUser(res.user)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setAvatar(await shrinkToDataUrl(file, 256))
      setSaved(false)
    } catch {
      setError('Dieses Bild konnte nicht gelesen werden.')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Profil</span>
        <h1>{user.name}</h1>
        <p className="lede">{user.email}</p>
      </div>

      <div className="card stack">
        <div className="row">
          <button
            type="button"
            className="avatar avatar--lg"
            onClick={() => fileInput.current?.click()}
            aria-label="Profilbild wählen"
          >
            {avatar ? <img src={avatar} alt="" /> : initials(user.name)}
          </button>
          <div className="stack stack--tight">
            <button type="button" className="btn btn--ghost" onClick={() => fileInput.current?.click()}>
              Bild wählen
            </button>
            {avatar && (
              <button type="button" className="btn btn--quiet" onClick={() => setAvatar(null)}>
                Bild entfernen
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={pickImage}
          />
        </div>

        <div className="field">
          <label htmlFor="pname">Name</label>
          <input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Handicap</h3>
        </div>
        <div className="handicap-pair">
          <div className="stat">
            <span className="value">{handicap === '' ? '—' : handicap}</span>
            <span className="label">Draussen</span>
          </div>
          <div className="stat">
            <span className="value" style={{ color: 'var(--green)' }}>
              {indoor === null ? '—' : indoor.toFixed(1)}
            </span>
            <span className="label">Indoor</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="phandicap">Handicap draussen</label>
          <input
            id="phandicap"
            value={handicap}
            onChange={(e) => setHandicap(e.target.value)}
            inputMode="decimal"
            disabled={seasonRunning && user.role !== 'admin'}
          />
          <span className="hint">
            {seasonRunning && user.role !== 'admin'
              ? 'Die Saison läuft — ab jetzt ändert das Handicap nur noch das System.'
              : 'Dein Indoor-Handicap startet bei der Hälfte dieses Werts.'}
          </span>
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Schlägerdistanzen</h3>
          <button type="button" className="btn btn--quiet" onClick={() => setShowClubs((v) => !v)}>
            {showClubs ? 'Einklappen' : 'Eintragen'}
          </button>
        </div>
        {showClubs ? (
          <div className="club-grid">
            {CLUBS.map((club) => (
              <label key={club} className="club-row">
                <span>{club}</span>
                <input
                  value={distances[club] ?? ''}
                  onChange={(e) => setDistances({ ...distances, [club]: e.target.value })}
                  inputMode="numeric"
                  placeholder="m"
                  aria-label={`${club} in Metern`}
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="muted small">
            Freiwillig. Praktisch, wenn am Simulator jemand fragt, was du mit dem 7er schlägst.
          </p>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {saved && <div className="notice notice--ok">Gespeichert.</div>}

      <button className="btn btn--primary btn--block" onClick={save} disabled={busy}>
        {busy ? <span className="spinner" /> : null}
        Speichern
      </button>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn--quiet" onClick={() => navigate('/regeln')}>
          Regeln
        </button>
        <button className="btn btn--quiet" onClick={() => void signOut()}>
          Abmelden
        </button>
      </div>
    </div>
  )
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Ein Profilbild wird auf dem Gerät verkleinert, bevor es den Rechner verlässt.
 * Ein Handyfoto hat gerne vier Megabyte; 256 Pixel reichen für einen Avatar.
 */
function shrinkToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((done, failed) => {
    const reader = new FileReader()
    reader.onerror = () => failed(new Error('unlesbar'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => failed(new Error('kein Bild'))
      image.onload = () => {
        const side = Math.min(image.width, image.height)
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return failed(new Error('kein Canvas'))
        ctx.drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size,
        )
        done(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
