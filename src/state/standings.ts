import { useCallback, useEffect, useState } from 'react'
import { api } from '@/net/api'
import type { PowerRow, StandingRow } from '@/core/standings'

export interface StandingsData {
  season: {
    id: string
    name: string
    status: string
    weeks: number
    droppedWeeks: number
    countingWeeks: number
    closedWeeks: number[]
    engine: 'whs' | 'congu'
  } | null
  table: StandingRow[]
  power: PowerRow[]
}

/** Tabelle und Power Rankings, gerechnet auf dem Server. */
export function useStandings(userId: string | null) {
  const [data, setData] = useState<StandingsData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) {
      setData(null)
      setLoading(false)
      return
    }
    try {
      setData(await api.get<StandingsData>('/api/standings'))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, reload: load }
}
