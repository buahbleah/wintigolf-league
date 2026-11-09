import { useEffect, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { useSession } from '@/state/session'
import type { LeagueData } from '@/state/league'
import { formatDateTime, zurichIsoDate } from '@/core/dates'
import { initials } from '@/screens/Profile'

interface Slot {
  id: string
  startsAt: string
  durationMin: number
  note: string | null
  createdBy: string
  createdByName: string
  weekNumber: number | null
  players: { id: string; name: string; avatarUrl: string | null }[]
}

/**
 * Termine am Simulator.
 *
 * Jemand schreibt einen Termin aus, die anderen sagen zu — und damit steht der
 * Flight. Die Dauer wächst mit den Zusagen, weil zu viert nun einmal länger
 * gespielt wird als zu zweit, und zwei Termine können sich nicht überschneiden:
 * es gibt einen Simulator.
 */
export function Termine({ data }: { data: LeagueData }) {
  const { state } = useSession()
  const me = state.user!
  const settings = data.season?.settings

  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [date, setDate] = useState(zurichIsoDate(new Date()))
  const [time, setTime] = useState('19:00')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function load() {
    try {
      const res = await api.get<{ slots: Slot[] }>('/api/slots')
      setSlots(res.slots)
    } catch {
      setSlots([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function create() {
    setBusy('create')
    setError(null)
    try {
      // Die Eingabe ist Ortszeit; der Server bekommt den echten Zeitpunkt.
      const startsAt = new Date(`${date}T${time}:00`)
      await api.post('/api/slots', { startsAt: startsAt.toISOString(), note: note || undefined })
      setNote('')
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  async function act(slot: Slot, payload: unknown, method: 'post' | 'del' = 'post') {
    setBusy(slot.id)
    setError(null)
    try {
      if (method === 'del') await api.del(`/api/slots/${slot.id}`)
      else await api.post(`/api/slots/${slot.id}`, payload)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Termine</span>
        <h1>Wer spielt wann</h1>
        <p className="lede">
          Nie allein spielen — hier findet sich, wer zusammen an den Simulator geht.
        </p>
      </div>

      {open ? (
        <div className="card stack">
          <div className="card-title">
            <h3>Termin ausschreiben</h3>
          </div>
          <div className="pair">
            <div className="field">
              <label htmlFor="sdate">Tag</label>
              <input id="sdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="stime">Zeit</label>
              <input id="stime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="snote">Notiz</label>
            <input
              id="snote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. «komme direkt vom Training»"
            />
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <div className="row">
            <button className="btn btn--primary" onClick={create} disabled={busy === 'create'}>
              {busy === 'create' ? <span className="spinner" /> : 'Ausschreiben'}
            </button>
            <button className="btn btn--quiet" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn--primary btn--block" onClick={() => setOpen(true)}>
          Termin ausschreiben
        </button>
      )}

      {error && !open && <div className="notice notice--error">{error}</div>}

      {slots === null ? (
        <span className="spinner" style={{ margin: '0 auto' }} />
      ) : slots.length === 0 ? (
        <div className="empty">
          <p>Noch kein Termin ausgeschrieben.</p>
          <p className="small">Mach den Anfang — die anderen sagen dann zu.</p>
        </div>
      ) : (
        <div className="stack stack--tight">
          {slots.map((slot) => {
            const mine = slot.players.some((p) => p.id === me.id)
            const full = settings ? slot.players.length >= settings.maxPlayersPerSlot : false
            const ends = new Date(new Date(slot.startsAt).getTime() + slot.durationMin * 60_000)
            return (
              <div className="card slot" key={slot.id}>
                <div className="slot-head">
                  <div className="stack stack--tight" style={{ gap: 2 }}>
                    <strong>{formatDateTime(slot.startsAt)}</strong>
                    <span className="muted small">
                      bis {formatDateTime(ends).split(' ')[1]} · {Math.round(slot.durationMin / 60)} h
                      {slot.weekNumber ? ` · Woche ${slot.weekNumber}` : ''}
                    </span>
                  </div>
                  <span className={mine ? 'chip chip--green' : full ? 'chip chip--amber' : 'chip'}>
                    {slot.players.length}/{settings?.maxPlayersPerSlot ?? 4}
                    {full && !mine ? ' voll' : ''}
                  </span>
                </div>

                {slot.note && <p className="muted small">{slot.note}</p>}

                <div className="slot-players">
                  {slot.players.map((player) => (
                    <span className="avatar" key={player.id} title={player.name}>
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt="" />
                      ) : (
                        initials(player.name)
                      )}
                    </span>
                  ))}
                  {slot.players.length === 0 && <span className="muted small">noch niemand</span>}
                </div>

                <div className="slot-foot">
                  {mine ? (
                    <button
                      className="btn btn--quiet"
                      onClick={() => act(slot, { leave: true })}
                      disabled={busy === slot.id}
                    >
                      Absagen
                    </button>
                  ) : (
                    <button
                      className="btn btn--ghost"
                      onClick={() => act(slot, { join: true })}
                      disabled={busy === slot.id || full}
                    >
                      {full ? 'Voll' : 'Bin dabei'}
                    </button>
                  )}

                  <a
                    className="btn btn--quiet"
                    href={calendarLink(slot, ends)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Kalender
                  </a>
                  <button className="btn btn--quiet" onClick={() => downloadIcs(slot, ends)}>
                    .ics
                  </button>

                  {(slot.createdBy === me.id || me.role === 'admin') && (
                    <button
                      className="btn btn--quiet"
                      onClick={() => act(slot, null, 'del')}
                      disabled={busy === slot.id}
                      style={{ color: 'var(--red)' }}
                    >
                      Termin absagen
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function title(slot: Slot): string {
  return slot.weekNumber ? `Wintigolf Woche ${slot.weekNumber}` : 'Wintigolf League'
}

/** Ein Klick, und der Termin steht im Google-Kalender. */
function calendarLink(slot: Slot, ends: Date): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(slot),
    dates: `${stamp(new Date(slot.startsAt))}/${stamp(ends)}`,
    details: slot.note ?? 'Runde in der Wintigolf League',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Und für alle anderen Kalender eine .ics-Datei. */
function downloadIcs(slot: Slot, ends: Date) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wintigolf League//DE',
    'BEGIN:VEVENT',
    `UID:${slot.id}@wintigolf`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(slot.startsAt))}`,
    `DTEND:${stamp(ends)}`,
    `SUMMARY:${title(slot)}`,
    slot.note ? `DESCRIPTION:${slot.note}` : 'DESCRIPTION:Runde in der Wintigolf League',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'wintigolf.ics'
  link.click()
  URL.revokeObjectURL(url)
}
