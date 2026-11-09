import { useCallback, useEffect, useState } from 'react'
import { api } from '@/net/api'
import type { LeagueSettings } from '@/core/settings'

/**
 * Die Saison, wie die App sie sieht.
 *
 * Ein Aufruf liefert alles, was für Liga-, Wochen- und Adminansicht gebraucht
 * wird — Saison, Wochen, Spieler. Das ist bewusst ein Aufruf und nicht drei:
 * die Ansichten zeigen dieselben Zahlen, und drei Abfragen wären drei Stände.
 */

export interface WeekCourse {
  id: string
  name: string
  tee: string
  par: number
  courseRating: number
  slopeRating: number
  lengthM: number
  ratingSource: 'gspro' | 'api' | 'estimate'
}

export interface Week {
  id: string
  number: number
  kind: 'regular' | 'playoff'
  playoffRound: string | null
  startsAt: string
  endsAt: string
  status: 'upcoming' | 'open' | 'closed'
  submitted: number
  picker: { id: string; name: string } | null
  course: WeekCourse | null
}

export interface LeaguePlayer {
  id: string
  name: string
  avatarUrl: string | null
  colorIndex: number
  role: 'admin' | 'member'
  indoorHandicap: number | null
  startingHandicap: number | null
  joinedWeek: number
  status: 'active' | 'withdrawn'
}

export interface Season {
  id: string
  name: string
  status: 'draft' | 'active' | 'playoffs' | 'finished' | 'archived'
  joinCode: string | null
  startedAt: string | null
  pausedAt: string | null
  settings: LeagueSettings
}

export interface LeagueData {
  season: Season | null
  weeks: Week[]
  players: LeaguePlayer[]
}

export function useLeague() {
  const [data, setData] = useState<LeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<LeagueData>('/api/seasons')
      setData({ season: res.season, weeks: res.weeks ?? [], players: res.players ?? [] })
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, reload: load }
}

/** Der Zustand einer Woche ergibt sich aus der Uhr, nicht aus einer Spalte. */
export function weekState(week: Week, now = Date.now()): 'upcoming' | 'open' | 'closed' {
  if (week.status === 'closed') return 'closed'
  if (now < new Date(week.startsAt).getTime()) return 'upcoming'
  if (now > new Date(week.endsAt).getTime()) return 'closed'
  return 'open'
}

/** Die Woche, die gerade läuft — oder die nächste, die kommt. */
export function activeWeek(weeks: Week[], now = Date.now()): Week | null {
  const open = weeks.find((w) => weekState(w, now) === 'open')
  if (open) return open
  return weeks.find((w) => weekState(w, now) === 'upcoming') ?? null
}
