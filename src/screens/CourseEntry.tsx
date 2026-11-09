import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { defaultHoles, type ExternalCourse, type SearchHit } from '@/core/externalCourse'
import { formatRange, zurichIsoDate } from '@/core/dates'
import type { LeagueData } from '@/state/league'

interface HoleRow {
  par: string
  strokeIndex: string
  lengthM: string
}

/**
 * Den Kurs einer Woche eintragen.
 *
 * Die Zahlen aus GSPro gelten. Die Suche in der echten Kursdatenbank füllt nur
 * vor — GSPro-Kurse sind fast immer Nachbauten, und Par und Stroke-Index von
 * Hand achtzehnmal abzutippen ist der sicherste Weg zu einem Tippfehler.
 *
 * Gespeichert wird erst, wenn die Karte in sich stimmt: achtzehn Löcher, jeder
 * Stroke-Index genau einmal, Länge in der erlaubten Spanne, ein echtes Rating.
 */
export function CourseEntry({
  weekId,
  matchId,
  data,
  onSaved,
}: {
  weekId?: string
  /** Im Playoff hängt der Kurs am Match, nicht an der Woche. */
  matchId?: string
  data: LeagueData
  onSaved: () => void
}) {
  const [matchWeekId, setMatchWeekId] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<string | null>(null)

  /* Beim Playoff-Kurs steht die Woche im Match — also einmal nachschauen. */
  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    void api
      .get<{ matches: { id: string; weekId: string; home: any; away: any; pickerId: string }[] }>(
        '/api/playoffs',
      )
      .then((res) => {
        if (cancelled) return
        const match = res.matches.find((m) => m.id === matchId)
        if (!match) return
        setMatchWeekId(match.weekId)
        const other = match.pickerId === match.home?.id ? match.away : match.home
        setOpponent(other?.name ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [matchId])

  const effectiveWeekId = weekId ?? matchWeekId
  const week = data.weeks.find((w) => w.id === effectiveWeekId)
  const settings = data.season?.settings

  const [name, setName] = useState(week?.course?.name ?? '')
  const [tee, setTee] = useState(week?.course?.tee ?? 'Gelb')
  const [rating, setRating] = useState(week?.course ? String(week.course.courseRating) : '')
  const [slope, setSlope] = useState(week?.course ? String(week.course.slopeRating) : '')
  const [length, setLength] = useState(week?.course ? String(week.course.lengthM) : '')
  const [source, setSource] = useState<'gspro' | 'api' | 'estimate'>(
    week?.course?.ratingSource ?? 'gspro',
  )
  const [holes, setHoles] = useState<HoleRow[]>(() =>
    defaultHoles().map((h) => ({ par: String(h.par), strokeIndex: String(h.strokeIndex), lengthM: '' })),
  )

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [found, setFound] = useState<ExternalCourse | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const par = useMemo(
    () => holes.reduce((sum, h) => sum + (Number(h.par) || 0), 0),
    [holes],
  )
  const indexProblem = useMemo(() => {
    const seen = new Set<number>()
    for (const [i, hole] of holes.entries()) {
      const value = Number(hole.strokeIndex)
      if (!Number.isInteger(value) || value < 1 || value > 18) return `Loch ${i + 1}: Stroke-Index fehlt`
      if (seen.has(value)) return `Stroke-Index ${value} kommt zweimal vor`
      seen.add(value)
    }
    return null
  }, [holes])

  const lengthNumber = Number(length)
  const lengthProblem =
    settings && Number.isFinite(lengthNumber) && lengthNumber > 0
      ? lengthNumber < settings.minLengthM || lengthNumber > settings.maxLengthM
        ? `Erlaubt sind ${settings.minLengthM} bis ${settings.maxLengthM} Meter`
        : null
      : 'Länge in Metern fehlt'

  const ready =
    name.trim() !== '' && tee.trim() !== '' && rating !== '' && slope !== '' && !indexProblem && !lengthProblem

  function setHole(index: number, patch: Partial<HoleRow>) {
    setHoles((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  async function search() {
    setSearching(true)
    setError(null)
    setFound(null)
    try {
      const res = await api.get<{ results: SearchHit[] }>(
        `/api/courses/lookup?q=${encodeURIComponent(query)}`,
      )
      setHits(res.results)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die Suche hat nicht geklappt.')
    } finally {
      setSearching(false)
    }
  }

  async function openCourse(id: string) {
    setSearching(true)
    setError(null)
    try {
      const res = await api.get<{ course: ExternalCourse }>(`/api/courses/lookup?id=${id}`)
      setFound(res.course)
      setHits(null)
      if (!name.trim()) setName(res.course.name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Der Kurs liess sich nicht laden.')
    } finally {
      setSearching(false)
    }
  }

  /** Einen Tee aus der Datenbank übernehmen — als Vorschlag, nicht als Wahrheit. */
  function applyTee(teeId: string) {
    const picked = found?.tees.find((t) => t.id === teeId)
    if (!picked) return
    setTee(picked.name)
    if (picked.courseRating) setRating(String(picked.courseRating))
    if (picked.slopeRating) setSlope(String(picked.slopeRating))
    if (picked.lengthM) setLength(String(picked.lengthM))
    if (picked.holes.length === 18) {
      setHoles(
        picked.holes.map((h) => ({
          par: String(h.par),
          strokeIndex: String(h.strokeIndex),
          lengthM: h.lengthM === null ? '' : String(h.lengthM),
        })),
      )
    }
    setSource('api')
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/courses', {
        weekId: matchId ? undefined : effectiveWeekId,
        matchId,
        name,
        tee,
        courseRating: rating,
        slopeRating: slope,
        lengthM: length,
        ratingSource: source,
        holes: holes.map((h, i) => ({
          number: i + 1,
          par: Number(h.par),
          strokeIndex: Number(h.strokeIndex),
          lengthM: h.lengthM === '' ? null : Number(h.lengthM),
        })),
      })
      onSaved()
      navigate(matchId ? '/playoffs' : '/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  if (!week) {
    return (
      <div className="page">
        <div className="empty">Diese Woche gibt es nicht.</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">
          Woche {week.number}
          {opponent ? ' · gegen ' + opponent : ''}
        </span>
        <h1>Kurs eintragen</h1>
        <p className="lede">
          {formatRange(zurichIsoDate(new Date(week.startsAt)), zurichIsoDate(new Date(week.endsAt)))}
          {week.picker && ` · gewählt von ${week.picker.name}`}
        </p>
      </div>

      {settings && (
        <div className="notice">
          Alle spielen vom selben Tee · Gimmie {settings.gimmieMetres} m · Wind {settings.wind} ·
          Greens {settings.greenSpeed} · {settings.mulligans ? 'Mulligans erlaubt' : 'keine Mulligans'}
        </div>
      )}

      <div className="card stack">
        <div className="card-title">
          <h3>Kurs</h3>
          <span className="chip">aus GSPro abtippen</span>
        </div>

        <div className="field">
          <label htmlFor="cname">Name</label>
          <input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Pebble Beach" />
        </div>

        <div className="pair">
          <div className="field">
            <label htmlFor="ctee">Tee</label>
            <input id="ctee" value={tee} onChange={(e) => setTee(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="clength">Länge (m)</label>
            <input
              id="clength"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="pair">
          <div className="field">
            <label htmlFor="crating">Course Rating</label>
            <input
              id="crating"
              value={rating}
              onChange={(e) => setRating(e.target.value.replace(',', '.'))}
              inputMode="decimal"
              placeholder="z. B. 71.4"
            />
          </div>
          <div className="field">
            <label htmlFor="cslope">Slope</label>
            <input
              id="cslope"
              value={slope}
              onChange={(e) => setSlope(e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 128"
            />
          </div>
        </div>

        {lengthProblem && <div className="notice notice--warn">{lengthProblem}</div>}

        <div className="field">
          <label htmlFor="csource">Woher kommen Rating und Slope?</label>
          <select id="csource" value={source} onChange={(e) => setSource(e.target.value as any)}>
            <option value="gspro">Aus GSPro abgelesen</option>
            <option value="api">Aus der Kursdatenbank</option>
            <option value="estimate">Geschätzt</option>
          </select>
          {source === 'estimate' && (
            <span className="hint">
              Die Woche wird für alle als «geschätztes Rating» gekennzeichnet.
            </span>
          )}
        </div>
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Karte vorausfüllen</h3>
        </div>
        <p className="muted small">
          GSPro-Kurse sind meist Nachbauten echter Plätze. Such den echten Kurs, übernimm Par und
          Stroke-Index, und korrigier danach, was GSPro anders anzeigt.
        </p>
        <div className="row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kurs suchen"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim().length >= 3) void search()
            }}
            style={{ flex: 1, minHeight: 48, padding: '0 12px', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <button className="btn btn--ghost" onClick={search} disabled={searching || query.trim().length < 3}>
            {searching ? <span className="spinner" /> : 'Suchen'}
          </button>
        </div>

        {hits && hits.length === 0 && <p className="muted small">Nichts gefunden.</p>}
        {hits && hits.length > 0 && (
          <div className="list">
            {hits.slice(0, 8).map((hit) => (
              <button key={hit.id} className="list-item lookup-hit" onClick={() => openCourse(hit.id)}>
                <span className="stack stack--tight" style={{ gap: 0, textAlign: 'left' }}>
                  <strong>{hit.name}</strong>
                  {hit.location && <span className="muted small">{hit.location}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {found && (
          <div className="stack stack--tight">
            <strong>{found.name}</strong>
            {found.tees.length === 0 && <p className="muted small">Für diesen Kurs sind keine Tees verzeichnet.</p>}
            {found.tees.map((t) => (
              <button key={t.id} className="list-item lookup-hit" onClick={() => applyTee(t.id)}>
                <span style={{ textAlign: 'left', flex: 1 }}>
                  <strong>{t.name}</strong>
                  <span className="muted small">
                    {' '}
                    {t.courseRating ?? '—'} / {t.slopeRating ?? '—'}
                    {t.lengthM ? ` · ${t.lengthM} m` : ''}
                    {t.holes.length === 18 ? ' · mit Karte' : ' · ohne Karte'}
                  </span>
                </span>
                <span className="chip chip--green">übernehmen</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Die achtzehn Löcher</h3>
          <span className={par === 0 ? 'chip' : 'chip chip--green'}>Par {par}</span>
        </div>

        <div className="hole-table">
          <div className="hole-head">
            <span>Loch</span>
            <span>Par</span>
            <span>SI</span>
            <span>Meter</span>
          </div>
          {holes.map((hole, i) => (
            <div className="hole-row" key={i}>
              <span className="hole-no">{i + 1}</span>
              <input
                value={hole.par}
                onChange={(e) => setHole(i, { par: e.target.value })}
                inputMode="numeric"
                aria-label={`Par Loch ${i + 1}`}
              />
              <input
                value={hole.strokeIndex}
                onChange={(e) => setHole(i, { strokeIndex: e.target.value })}
                inputMode="numeric"
                aria-label={`Stroke-Index Loch ${i + 1}`}
              />
              <input
                value={hole.lengthM}
                onChange={(e) => setHole(i, { lengthM: e.target.value })}
                inputMode="numeric"
                aria-label={`Länge Loch ${i + 1}`}
              />
            </div>
          ))}
        </div>

        {indexProblem && <div className="notice notice--warn">{indexProblem}</div>}
      </div>

      {error && <div className="notice notice--error">{error}</div>}

      <button className="btn btn--primary btn--block" onClick={save} disabled={!ready || busy}>
        {busy ? <span className="spinner" /> : null}
        Kurs für Woche {week.number} festlegen
      </button>
      <button className="btn btn--quiet" onClick={() => navigate('/')}>
        Abbrechen
      </button>
    </div>
  )
}
