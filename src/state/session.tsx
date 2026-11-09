import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '@/net/api'
import type { MeResponse, User } from '@/core/types'

/**
 * Wer angemeldet ist, und was gerade läuft.
 *
 * Die App fragt das einmal beim Start und danach nach jeder Änderung, die etwas
 * daran dreht. Alles andere lädt jeder Screen selber.
 */

interface SessionValue {
  state: MeResponse
  loading: boolean
  refresh: () => Promise<void>
  setUser: (user: User) => void
  signOut: () => Promise<void>
}

const empty: MeResponse = { user: null }
const Ctx = createContext<SessionValue>({
  state: empty,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
  signOut: async () => {},
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MeResponse>(empty)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<MeResponse>('/api/auth/me'))
    } catch {
      setState(empty)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Wenn die App aus dem Hintergrund zurückkommt, kann in der Zwischenzeit eine
  // Karte bestätigt oder eine Woche freigeschaltet worden sein.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const value = useMemo<SessionValue>(
    () => ({
      state,
      loading,
      refresh,
      setUser: (user: User) => setState((prev) => ({ ...prev, user })),
      signOut: async () => {
        await api.post('/api/auth/logout')
        setState(empty)
      },
    }),
    [state, loading, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  return useContext(Ctx)
}

/** Kurzform für Screens, die ohne angemeldeten Spieler gar nicht erscheinen. */
export function useUser(): User {
  const { state } = useSession()
  if (!state.user) throw new Error('Dieser Screen erscheint nur angemeldet.')
  return state.user
}
