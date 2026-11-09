import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import type { LeagueData } from '@/state/league'
import type { HoleResult } from '@/core/scoring'

interface RoundPayload {
  id: string
  weekId: string
  weekNumber: number
  userId: string
  status: 'draft' | 'submitted' | 'confirmed' | 'rejected'
  markerId: string | null
  rejectedReason: string | null
  screenshotId: string | null
  handicapIndex: number
  playingHandicap: number
  points: number
  gross: number
  played: number
  toPar: number
  courseName: string
  tee: string
  holes: HoleResult[]
}

/**
 * Die Karte eintragen.
 *
 * Loch für Loch, mit dem Daumen bedienbar: minus, Zahl, plus. Aus einem leeren
 * Feld macht das Plus zuerst Par — das ist der häufigste Wert und spart auf
 * einer Par-72-Runde ein paar Dutzend Tipper.
 *
 * Gespeichert wird im Hintergrund, während man tippt. Wer mitten in der Runde
 * das Handy weglegt, findet die halbe Karte wieder.
 */
export function ScoreEntry({ weekId, data }: { weekId: string; data: LeagueData }) {
  const { state } = useSession()
  const me = state.user!
  const week = data.weeks.find((w) => w.id === weekId)
  const settings = data.season?.settings

  const [round, setRound] = useState<RoundPayload | null>(null)
  const [strokes, setStrokes] = useState<Record<number, number | null>>({})
  const [markerId, setMarkerId] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Die Karte holen oder anfangen. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.post<{ round: RoundPayload }>('/api/rounds', { weekId })
        if (cancelled) return
        setRound(res.round)
        setMarkerId(res.round.markerId ?? '')
        const filled: Record<number, number | null> = {}
        for (const hole of res.round.holes) filled[hole.number] = hole.strokes
        setStrokes(filled)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [weekId])

  const card = useMemo(() => {
    if (!round || !week?.course) return null
    const holes = round.holes.map((hole) => {
      const value = strokes[hole.number] ?? null
      const net = value === null ? null : value - hole.received
      const points = value === null ? 0 : Math.max(0, hole.par - net! + 2)
      return { ...hole, strokes: value, net, points }
    })
    return {
      holes,
      gross: holes.reduce((sum, h) => sum + (h.strokes ?? 0), 0),
      points: holes.reduce((sum, h) => sum + h.points, 0),
      played: holes.filter((h) => h.strokes !== null).length,
    }
  }, [round, strokes, week])

  /** Speichert kurz nach dem letzten Tipper, nicht bei jedem einzelnen. */
  function scheduleSave(next: Record<number, number | null>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (!round) return
      try {
        await api.patch(`/api/rounds/${round.id}`, { holes: next })
        setSavedAt(Date.now())
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Das Speichern hat nicht geklappt.')
      }
    }, 700)
  }

  function change(hole: HoleResult, delta: number) {
    setStrokes((prev) => {
      const current = prev[hole.number]
      let next: number | null
      if (current === null || current === undefined) next = delta > 0 ? hole.par : hole.par
      else next = current + delta
      if (next !== null && next < 1) next = null
      if (next !== null && next > 20) next = 20
      const updated = { ...prev, [hole.number]: next }
      scheduleSave(updated)
      return updated
    })
    setSavedAt(null)
  }

  async function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !round) return
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await shrink(file, 1400)
      await api.post(`/api/rounds/${round.id}/screenshot`, { image: dataUrl })
      setImage(dataUrl)
      setRound({ ...round, screenshotId: 'neu' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das Bild konnte nicht geladen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!round) return
    setBusy(true)
    setError(null)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await api.patch(`/api/rounds/${round.id}`, { holes: strokes })
      await api.patch(`/api/rounds/${round.id}`, { markerId: markerId || null, submit: true })
      navigate(`/karte/${round.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das Abgeben hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (!week?.course) {
    return (
      <div className="page">
        <div className="empty">Für diese Woche steht der Kurs noch nicht fest.</div>
      </div>
    )
  }

  if (!round || !card) {
    return (
      <div className="page center">
        {error ? <div className="notice notice--error">{error}</div> : <span className="spinner" style={{ margin: '0 auto' }} />}
      </div>
    )
  }

  const mates = data.players.filter((p) => p.id !== me.id && p.status === 'active')

  return (
    <div className="page page--entry">
      <div className="page-head">
        <span className="eyebrow">Woche {week.number}</span>
        <h1>{week.course.name}</h1>
        <p className="lede">
          {week.course.tee} · Par {week.course.par} · du spielst {round.playingHandicap} Schläge vor
          {round.handicapIndex !== null && ` (Handicap ${round.handicapIndex.toFixed(1)})`}
        </p>
      </div>

      {round.rejectedReason && (
        <div className="notice notice--warn">
          Abgelehnt: {round.rejectedReason}. Trag die Runde bitte neu ein.
        </div>
      )}

      <div className="card stack stack--tight">
        {card.holes.map((hole) => (
          <div className={`score-row${hole.strokes === null ? '' : ' is-filled'}`} key={hole.number}>
            <span className="score-hole">
              <strong>{hole.number}</strong>
              <span className="muted">Par {hole.par}</span>
            </span>
            <span className="score-dots" aria-label={`${hole.received} Schläge erhalten`}>
              {hole.received > 0 ? '•'.repeat(Math.min(hole.received, 3)) : ''}
            </span>
            <button
              className="step"
              onClick={() => change(hole, -1)}
              aria-label={`Loch ${hole.number} ein Schlag weniger`}
            >
              −
            </button>
            <span className="score-value num">{hole.strokes ?? '–'}</span>
            <button
              className="step"
              onClick={() => change(hole, 1)}
              aria-label={`Loch ${hole.number} ein Schlag mehr`}
            >
              +
            </button>
            {/* Ohne Ergebnis bleibt das Feld leer statt null Punkte zu behaupten. */}
            {hole.strokes === null ? (
              <span className="score-points" />
            ) : (
              <span className={`score-points pts-${Math.min(hole.points, 5)}`}>{hole.points}</span>
            )}
          </div>
        ))}
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Beleg</h3>
          {round.screenshotId && <span className="chip chip--green">liegt vor</span>}
        </div>
        <p className="muted small">
          Fotografier den Abschlussbildschirm ab, auf dem alle Namen stehen. Ohne Beleg lässt sich
          die Karte nicht abgeben.
        </p>
        {image && <img className="proof-preview" src={image} alt="Beleg" />}
        <button className="btn btn--ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
          {round.screenshotId ? 'Anderes Foto' : 'Foto aufnehmen'}
        </button>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={pickImage} />
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Zähler</h3>
        </div>
        <p className="muted small">
          Wer hat mitgespielt und bestätigt deine Karte? Die Person sieht Karte und Foto und gibt
          sie frei — oder lehnt sie ab, dann wird neu eingetragen.
        </p>
        <select
          value={markerId}
          onChange={(e) => setMarkerId(e.target.value)}
          aria-label="Zähler wählen"
        >
          <option value="">Wer war dabei?</option>
          {mates.map((mate) => (
            <option key={mate.id} value={mate.id}>
              {mate.name}
            </option>
          ))}
        </select>
        {mates.length === 0 && (
          <p className="muted small">
            Es ist sonst niemand in der Liga.
            {settings?.soloRoundsAllowed && ' Der Admin kann eine Einzelrunde freigeben.'}
          </p>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      <div className="score-bar">
        <div className="stat">
          <span className="value">{card.points}</span>
          <span className="label">Punkte</span>
        </div>
        <div className="stat">
          <span className="value">{card.gross || '–'}</span>
          <span className="label">Brutto</span>
        </div>
        <div className="stat">
          <span className="value">{card.played}/18</span>
          <span className="label">Löcher</span>
        </div>
        <button
          className="btn btn--primary"
          onClick={submit}
          disabled={busy || card.played === 0 || !round.screenshotId || !markerId}
        >
          {busy ? <span className="spinner" /> : 'Abgeben'}
        </button>
      </div>

      <p className="muted small center">
        {savedAt ? 'Gespeichert.' : 'Wird automatisch gespeichert.'}
      </p>
    </div>
  )
}

/**
 * Das Foto auf dem Gerät verkleinern, bevor es verschickt wird. Ein Handyfoto
 * wiegt vier Megabyte; 1400 Pixel reichen, um eine Scorecard zu lesen.
 */
function shrink(file: File, maxEdge: number): Promise<string> {
  return new Promise((done, failed) => {
    const reader = new FileReader()
    reader.onerror = () => failed(new Error('unlesbar'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => failed(new Error('kein Bild'))
      image.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return failed(new Error('kein Canvas'))
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        done(canvas.toDataURL('image/jpeg', 0.78))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
