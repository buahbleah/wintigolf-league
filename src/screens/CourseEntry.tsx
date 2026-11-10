import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/net/api'
import { navigate } from '@/state/router'
import { defaultHoles, type ExternalCourse, type SearchHit } from '@/core/externalCourse'
import type { ReadCard, ReadTee } from '@/core/scorecard'
import type { SgtCourse } from '@/core/sgtCourses'
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

  const [cardUrl, setCardUrl] = useState('')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<string | null>(null)
  const cardInput = useRef<HTMLInputElement>(null)

  /* Der gewählte GSPro-Kurs und die Tees seiner Karte — damit sich der gespielte
     Tee nach dem Auslesen noch wechseln lässt, ohne alles neu zu holen. */
  const [sgtQuery, setSgtQuery] = useState('')
  const [sgtHits, setSgtHits] = useState<SgtCourse[] | null>(null)
  const [picked, setPicked] = useState<SgtCourse | null>(null)
  const [cardTees, setCardTees] = useState<ReadTee[]>([])
  const [cardFrom, setCardFrom] = useState<'sgt' | 'image' | null>(null)
  const [sgtSearching, setSgtSearching] = useState(false)

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

  /**
   * Eine ausgelesene Karte ins Formular übernehmen.
   *
   * Sie landet im Formular, nicht in der Datenbank. Jede Zahl steht danach in
   * einer Zeile, die sich ändern lässt, und erst der Knopf unten speichert.
   */
  function applyCard(card: ReadCard, courseName?: string) {
    /* Ein gewählter Kurs bringt seinen Namen mit und setzt ihn durch. Aus einem
       Bild gelesen gilt er nur, solange im Feld noch nichts steht. */
    setHoles(
      card.holes.map((hole) => ({
        par: String(hole.par),
        strokeIndex: String(hole.strokeIndex),
        lengthM: hole.lengthM === null ? '' : String(hole.lengthM),
      })),
    )
    setCardTees(card.tees)

    if (courseName) setName(courseName)
    else if (!name.trim() && card.courseName) setName(card.courseName)

    /* Vorgeschlagen wird der Tee, der zum eingetragenen passt — sonst der
       längste, weil der meistens der gespielte ist. Umstellen geht gleich
       darunter. */
    const match =
      card.tees.find((t) => t.name.toLowerCase() === tee.trim().toLowerCase()) ??
      [...card.tees].sort((a, b) => (b.lengthM ?? 0) - (a.lengthM ?? 0))[0]

    const taken = ['Par und Stroke-Index für achtzehn Löcher']
    if (match) taken.push(...applyReadTee(match))

    setRead(
      `Übernommen: ${taken.join(', ')}${match ? ` — Tee ${match.name}` : ''}. Schau die Zahlen durch, bevor du speicherst.`,
    )
  }

  /** Einen Tee der Karte übernehmen. Gibt zurück, was dabei wirklich ankam. */
  function applyReadTee(picked: ReadTee): string[] {
    const taken: string[] = []
    if (picked.name) setTee(picked.name)
    if (picked.courseRating !== null) {
      setRating(String(picked.courseRating))
      taken.push('Course Rating')
    }
    if (picked.slopeRating !== null) {
      setSlope(String(picked.slopeRating))
      taken.push('Slope')
    }
    if (picked.lengthM !== null) {
      setLength(String(picked.lengthM))
      taken.push('Länge')
    }
    setSource('gspro')
    return taken
  }

  /** Die Scorecard aus einem Bild lesen. */
  async function readCard(payload: { imageUrl?: string; image?: string }) {
    setReading(true)
    setError(null)
    setRead(null)
    try {
      const card = await api.post<ReadCard>('/api/courses/scorecard', payload)
      setCardFrom('image')
      setPicked(null)
      applyCard(card)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das Bild konnte nicht gelesen werden.')
    } finally {
      setReading(false)
    }
  }

  /** In der GSPro-Liste suchen. */
  async function searchSgt() {
    setSgtSearching(true)
    setError(null)
    try {
      const res = await api.get<{ results: SgtCourse[] }>(
        `/api/courses/sgt?q=${encodeURIComponent(sgtQuery.trim())}`,
      )
      setSgtHits(res.results)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die Kursliste war nicht erreichbar.')
    } finally {
      setSgtSearching(false)
    }
  }

  /**
   * Einen Kurs aus der Liste festlegen: der Server holt dessen Scorecard und
   * liest sie aus. Beim zweiten Mal ist derselbe Kurs sofort da.
   */
  async function pickSgt(course: SgtCourse) {
    setReading(true)
    setError(null)
    setRead(null)
    try {
      const res = await api.get<{ course: SgtCourse; card: ReadCard }>(
        `/api/courses/sgt?id=${course.id}`,
      )
      setPicked(res.course)
      setCardFrom('sgt')
      setSgtHits(null)
      applyCard(res.card, res.course.name)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Die Scorecard dieses Kurses war nicht zu lesen.',
      )
    } finally {
      setReading(false)
    }
  }

  async function pickCard(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await readCard({ image: await shrinkCard(file) })
    } catch {
      setError('Dieses Bild konnte nicht gelesen werden.')
    }
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

  /**
   * Die Tees der gelesenen Karte zur Wahl stellen.
   *
   * Eine Scorecard zeigt vier oder fünf Tees, gespielt wird einer — und alle
   * spielen denselben. Was oben vorgeschlagen wurde, ist nur der längste; hier
   * steht, was es sonst gibt, mit Rating und Slope daneben.
   */
  /** Was nach dem Auslesen ankam — dort, wo es ausgelöst wurde. */
  function cardResult() {
    return (
      <>
        {read && <div className="notice notice--ok">{read}</div>}
        {teeChoice()}
      </>
    )
  }

  function teeChoice() {
    if (cardTees.length < 2) return null
    return (
      <div className="stack stack--tight">
        <span className="muted small">Von welchem Tee wird gespielt?</span>
        {cardTees.map((t) => {
          const active = t.name.toLowerCase() === tee.trim().toLowerCase()
          return (
            <button
              key={t.name}
              className="list-item lookup-hit"
              onClick={() => {
                const taken = applyReadTee(t)
                setRead(
                  `Tee ${t.name}${taken.length ? ` übernommen: ${taken.join(', ')}` : ' übernommen'}.`,
                )
              }}
            >
              <span style={{ textAlign: 'left', flex: 1 }}>
                <strong>{t.name}</strong>
                <span className="muted small">
                  {' '}
                  {t.courseRating ?? '—'} / {t.slopeRating ?? '—'}
                  {t.lengthM ? ` · ${t.lengthM} m` : ''}
                </span>
              </span>
              {active && <span className="chip chip--green">gewählt</span>}
            </button>
          )
        })}
      </div>
    )
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

      {/* ------------------------------------------------ Kurs aus GSPro wählen */}
      <div className="card stack">
        <div className="card-title">
          <h3>Kurs aus GSPro wählen</h3>
          <span className="chip chip--green">füllt alles aus</span>
        </div>
        <p className="muted small">
          Such den Platz, der diese Woche gespielt wird. Aus seiner Scorecard kommen Par und
          Stroke-Index für alle achtzehn Löcher, dazu Rating, Slope und Länge pro Tee. Danach
          prüfst du die Zahlen hier im Formular.
        </p>

        <div className="row">
          <input
            value={sgtQuery}
            onChange={(e) => setSgtQuery(e.target.value)}
            placeholder="z. B. Goldenberg"
            aria-label="Kurs in der GSPro-Liste suchen"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && sgtQuery.trim().length >= 3) void searchSgt()
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              padding: '0 12px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
          <button
            className="btn btn--ghost"
            onClick={searchSgt}
            disabled={sgtSearching || reading || sgtQuery.trim().length < 3}
          >
            {sgtSearching ? <span className="spinner" /> : 'Suchen'}
          </button>
        </div>

        {sgtHits && sgtHits.length === 0 && (
          <p className="muted small">
            Kein Kurs dieses Namens. Probier einen Teil des Namens oder den Ort — und wenn er dort
            nicht steht, lies die Scorecard weiter unten aus einem Bild.
          </p>
        )}

        {sgtHits && sgtHits.length > 0 && (
          <div className="list">
            {sgtHits.map((hit) => (
              <button
                key={hit.id}
                className="list-item lookup-hit"
                onClick={() => pickSgt(hit)}
                disabled={reading}
              >
                <span className="stack stack--tight" style={{ gap: 0, textAlign: 'left', flex: 1 }}>
                  <strong>{hit.name}</strong>
                  <span className="muted small">
                    {hit.location || 'Ort unbekannt'}
                    {hit.par ? ` · Par ${hit.par}` : ''}
                    {hit.designer ? ` · ${hit.designer}` : ''}
                  </span>
                </span>
                <span className="chip chip--green">wählen</span>
              </button>
            ))}
          </div>
        )}

        {reading && !sgtHits && (
          <p className="muted small">
            <span className="spinner" /> Die Scorecard wird gelesen — das dauert ein paar Sekunden.
          </p>
        )}

        {picked && (
          <div className="notice notice--ok">
            <strong>{picked.name}</strong>
            {picked.location ? ` · ${picked.location}` : ''}
            {picked.designer ? ` · gebaut von ${picked.designer}` : ''}
          </div>
        )}

        {cardFrom === 'sgt' && cardResult()}
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Kurs</h3>
          <span className="chip">prüfen und ändern</span>
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

      {/* ------------------------------------------------ Karte auslesen */}
      <div className="card stack">
        <div className="card-title">
          <h3>Oder eine Scorecard auslesen</h3>
          <span className="chip">wenn der Kurs nicht in der Liste steht</span>
        </div>
        <p className="muted small">
          Die Scorecard aus GSPro oder von einer Kursseite — als Bildadresse oder als Foto. Daraus
          kommen dieselben Zahlen wie oben: Par und Stroke-Index für alle achtzehn Löcher, und wenn
          Rating und Slope darauf stehen, die auch.
        </p>

        <div className="row">
          <input
            value={cardUrl}
            onChange={(e) => setCardUrl(e.target.value)}
            placeholder="https://… Bild der Scorecard"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cardUrl.trim()) void readCard({ imageUrl: cardUrl.trim() })
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              padding: '0 12px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
          <button
            className="btn btn--ghost"
            onClick={() => readCard({ imageUrl: cardUrl.trim() })}
            disabled={reading || !cardUrl.trim()}
          >
            {reading ? <span className="spinner" /> : 'Auslesen'}
          </button>
        </div>

        <button
          className="btn btn--ghost"
          onClick={() => cardInput.current?.click()}
          disabled={reading}
        >
          Foto der Scorecard
        </button>
        <input ref={cardInput} type="file" accept="image/*" hidden onChange={pickCard} />

        {cardFrom === 'image' && cardResult()}
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Oder in der Kursdatenbank suchen</h3>
        </div>
        <p className="muted small">
          GSPro-Kurse sind meist Nachbauten echter Plätze. Die Datenbank kennt Rating, Slope und
          Par — den Stroke-Index hat sie nicht, der steht nur auf der Scorecard.
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

/**
 * Eine abfotografierte Scorecard verkleinern, bevor sie verschickt wird — aber
 * nicht zu stark: die Ziffern in der INDEX-Spalte sind klein, und was hier
 * verloren geht, lässt sich später nicht mehr lesen.
 */
function shrinkCard(file: File): Promise<string> {
  return new Promise((done, failed) => {
    const reader = new FileReader()
    reader.onerror = () => failed(new Error('unlesbar'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => failed(new Error('kein Bild'))
      image.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return failed(new Error('kein Canvas'))
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        done(canvas.toDataURL('image/jpeg', 0.9))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
