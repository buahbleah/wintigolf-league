/** Die Formen, die zwischen Server und App hin und her gehen. */

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  outdoorHandicap: number | null
  avatarUrl: string | null
  colorIndex: number
  clubDistances: Record<string, number>
}

export interface SeasonSummary {
  id: string
  name: string
  status: 'draft' | 'active' | 'playoffs' | 'finished' | 'archived'
  joinCode: string | null
  indoorHandicap: number | null
  joinedWeek: number
}

export interface MeResponse {
  user: User | null
  season?: SeasonSummary | null
  needsFirstAccount?: boolean
  awaitingConfirmation?: number
  unreadNotifications?: number
}

/** Die Schläger, für die man eine Distanz hinterlegen kann. */
export const CLUBS = [
  'Driver',
  '3 Holz',
  '5 Holz',
  '4 Eisen',
  '5 Eisen',
  '6 Eisen',
  '7 Eisen',
  '8 Eisen',
  '9 Eisen',
  'Pitching Wedge',
  'Gap Wedge',
  'Sand Wedge',
  'Lob Wedge',
] as const
