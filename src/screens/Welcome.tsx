import { useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { useSession } from '@/state/session'
import { navigate, useRoute } from '@/state/router'
import { Mark } from '@/ui/Brand'
import type { User } from '@/core/types'

/**
 * Der Eingang.
 *
 * Drei Zustände auf einem Screen: anmelden, registrieren, Passwort vergessen.
 * Wer über einen Einladungslink kommt (`#/beitreten/ABC123`), landet direkt im
 * Registrieren, mit dem Code schon eingetragen.
 */
export function Welcome() {
  const { state, refresh, setUser } = useSession()
  const { segments } = useRoute()
  const mode =
    segments[0] === 'registrieren' || segments[0] === 'beitreten'
      ? 'signup'
      : segments[0] === 'passwort'
        ? segments[1]
          ? 'newpass' // mit Token aus der Mail
          : 'reset'
        : 'signin'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [handicap, setHandicap] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const firstAccount = state.needsFirstAccount === true

  useEffect(() => {
    if (segments[0] === 'beitreten' && segments[1]) setCode(segments[1].toUpperCase())
  }, [segments])

  useEffect(() => {
    setError(null)
    setDone(null)
  }, [mode])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') {
        const res = await api.post<{ user: User }>('/api/auth/login', { email, password })
        setUser(res.user)
        await refresh()
        navigate('/', true)
      } else if (mode === 'signup') {
        const res = await api.post<{ user: User }>('/api/auth/register', {
          name,
          email,
          password,
          outdoorHandicap: handicap === '' ? null : handicap,
          joinCode: firstAccount ? undefined : code,
        })
        setUser(res.user)
        await refresh()
        navigate('/', true)
      } else if (mode === 'newpass') {
        await api.post('/api/auth/reset', { token: segments[1], password })
        await refresh()
        navigate('/', true)
      } else {
        await api.post('/api/auth/request-reset', { email })
        setDone('Wenn es zu dieser Adresse ein Konto gibt, ist die Mail unterwegs.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <Mark size={56} />
        <h1>
          Wintigolf <span>League</span>
        </h1>
        <p className="lede">
          Zehn Wochen, zehn Kurse, ein Handicap, das sich nach jeder Runde bewegt.
        </p>
      </div>

      <form className="card card--raised stack" onSubmit={submit}>
        {mode === 'signup' && firstAccount && (
          <div className="notice notice--ok">
            Das erste Konto dieser Liga — damit wirst du Admin und legst danach die Saison an.
          </div>
        )}

        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Wie dich alle nennen"
              required
            />
          </div>
        )}

        {mode !== 'newpass' && (
          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>
        )}

        {mode !== 'reset' && (
          <div className="field">
            <label htmlFor="password">{mode === 'newpass' ? 'Neues Passwort' : 'Passwort'}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
            {mode !== 'signin' && <span className="hint">Mindestens 8 Zeichen.</span>}
          </div>
        )}

        {mode === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="handicap">Handicap draussen</label>
              <input
                id="handicap"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                inputMode="decimal"
                placeholder="z. B. 24.5"
              />
              <span className="hint">
                Dein Platzhandicap. Dein Indoor-Handicap startet bei der Hälfte davon.
              </span>
            </div>

            {!firstAccount && (
              <div className="field">
                <label htmlFor="code">Liga-Code</label>
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  required
                />
              </div>
            )}
          </>
        )}

        {error && <div className="notice notice--error">{error}</div>}
        {done && <div className="notice notice--ok">{done}</div>}

        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {mode === 'signin'
            ? 'Anmelden'
            : mode === 'signup'
              ? 'Konto anlegen'
              : mode === 'newpass'
                ? 'Passwort setzen'
                : 'Link schicken'}
        </button>

        <div className="welcome-switch">
          {mode === 'signin' ? (
            <>
              <button type="button" className="btn btn--quiet" onClick={() => navigate('/registrieren')}>
                Noch kein Konto? Registrieren
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => navigate('/passwort')}>
                Passwort vergessen
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--quiet" onClick={() => navigate('/anmelden')}>
              Zurück zum Anmelden
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
