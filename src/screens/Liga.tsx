import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { activeWeek, weekState, type LeagueData } from '@/state/league'
import { useStandings } from '@/state/standings'
import { formatRange, timeLeft, zurichIsoDate } from '@/core/dates'
import { Mark } from '@/ui/Brand'
import { initials } from '@/screens/Profile'
import { Trend } from '@/ui/Trend'

/**
 * Die Liga — der Startbildschirm.
 *
 * Oben steht, was gerade dran ist, darunter die Tabelle. Beides auf einem
 * Schirm, weil das die zwei Fragen sind, mit denen jemand die App öffnet: was
 * muss ich spielen, und wo stehe ich.
 */
export function Liga({ data, loading }: { data: LeagueData | null; loading: boolean }) {
  const { state } = useSession()
  const user = state.user!
  const { data: ranks } = useStandings(user.id)

  if (loading) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  if (!data?.season) {
    return (
      <div className="page">
        <div className="page-head">
          <span className="eyebrow">Liga</span>
          <h1>Noch keine Saison</h1>
        </div>
        <div className="card card--accent stack">
          <Mark size={40} />
          {user.role === 'admin' ? (
            <>
              <h3>Du bist Admin</h3>
              <p className="muted small">
                Als Nächstes wird die Saison angelegt: zehn Wochen, die Spieler bekommen den
                Liga-Code, und jeder bestimmt eine Woche den Kurs.
              </p>
              <button className="btn btn--primary" onClick={() => navigate('/admin/saison')}>
                Saison anlegen
              </button>
            </>
          ) : (
            <>
              <h3>Gleich geht es los</h3>
              <p className="muted small">
                Sobald der Admin die Saison angelegt hat, erscheinen hier die Tabelle und die
                Woche, die gerade läuft.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const { season, weeks, players } = data
  const current = activeWeek(weeks)
  const currentState = current ? weekState(current) : null
  const myOpenWeeks = weeks.filter((w) => w.picker?.id === user.id && !w.course)
  const table = ranks?.table ?? []
  const power = ranks?.power ?? []
  const mine = table.find((row) => row.userId === user.id)

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">{season.name}</span>
        <h1>Liga</h1>
        <p className="lede">
          {season.settings.weeks} Wochen · die besten{' '}
          {Math.max(1, season.settings.weeks - season.settings.droppedWeeks)} zählen ·{' '}
          {players.filter((p) => p.status === 'active').length} Spieler
          {season.status === 'draft' && ' · noch nicht gestartet'}
          {season.pausedAt && ' · pausiert'}
        </p>
      </div>

      {myOpenWeeks.length > 0 && (
        <div className="card card--accent stack">
          <div className="card-title">
            <h3>Du bist mit dem Kurs dran</h3>
            <span className="chip chip--green">Woche {myOpenWeeks[0].number}</span>
          </div>
          <p className="muted small">
            Trag Par, Stroke-Index, Rating und Slope aus GSPro ein. Danach sehen alle, worauf
            gespielt wird.
          </p>
          <button className="btn btn--primary" onClick={() => navigate(`/kurs/${myOpenWeeks[0].id}`)}>
            Kurs eintragen
          </button>
        </div>
      )}

      {current && (
        <button className="card week-teaser" onClick={() => navigate('/woche')}>
          <span className="week-no">{current.number}</span>
          <span className="stack stack--tight" style={{ flex: 1, gap: 2, textAlign: 'left' }}>
            <strong>{current.course ? current.course.name : 'Kurs noch offen'}</strong>
            <span className="muted small">
              {currentState === 'open'
                ? timeLeft(current.endsAt)
                : formatRange(
                    zurichIsoDate(new Date(current.startsAt)),
                    zurichIsoDate(new Date(current.endsAt)),
                  )}
              {' · '}
              {current.submitted} abgegeben
            </span>
          </span>
          <span className={currentState === 'open' ? 'chip chip--green' : 'chip'}>
            {currentState === 'open' ? 'läuft' : 'kommt'}
          </span>
        </button>
      )}

      {/* ------------------------------------------------------- Tabelle */}
      <div className="card">
        <div className="card-title">
          <h3>Tabelle</h3>
          <span className="muted small">Netto-Stableford</span>
        </div>

        {table.length === 0 ? (
          <p className="muted small">Noch keine Runde gespielt.</p>
        ) : (
          <div className="table">
            {table.map((row) => (
              <button
                key={row.userId}
                className={`table-row${row.userId === user.id ? ' is-me' : ''}`}
                onClick={() => navigate(`/spieler/${row.userId}`)}
              >
                <span className="rank">{row.rank}</span>
                <span className="avatar">
                  {row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : initials(row.name)}
                </span>
                <span className="table-name">
                  <strong>{row.name}</strong>
                  <span className="muted small">
                    {row.indoorHandicap === null ? 'kein Handicap' : `HCP ${row.indoorHandicap.toFixed(1)}`}
                    {row.played > 0 && ` · ${row.played} ${row.played === 1 ? 'Runde' : 'Runden'}`}
                    {row.unconfirmed > 0 && ' · unbestätigt'}
                    {row.status === 'withdrawn' && ' · ausgeschieden'}
                  </span>
                </span>
                <span className="table-total num">{row.total}</span>
              </button>
            ))}
          </div>
        )}

        {mine && mine.droppedWeeks.length > 0 && (
          <p className="muted small">
            Bei dir gestrichen: Woche {mine.droppedWeeks.join(' und ')}.
          </p>
        )}
      </div>

      {/* ------------------------------------------------ Power Rankings */}
      {power.length > 1 && (
        <div className="card">
          <div className="card-title">
            <h3>Power Rankings</h3>
            <button className="btn btn--quiet" onClick={() => navigate('/power')}>
              alle
            </button>
          </div>
          <p className="muted small">Form der letzten drei Runden, nicht die Saisonsumme.</p>
          <div className="table">
            {power.slice(0, 3).map((row) => (
              <button
                key={row.userId}
                className="table-row"
                onClick={() => navigate(`/spieler/${row.userId}`)}
              >
                <span className="rank">{row.rank}</span>
                <span className="avatar">
                  {row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : initials(row.name)}
                </span>
                <span className="table-name">
                  <strong>{row.name}</strong>
                  <span className="muted small">
                    Form {row.form.toFixed(1)} · Schnitt {row.average.toFixed(1)}
                  </span>
                </span>
                <Trend value={row.trend} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <h3>Alle Wochen</h3>
        </div>
        <div className="list">
          {weeks.map((week) => {
            const s = weekState(week)
            return (
              <div className="list-item" key={week.id}>
                <span className="week-no">{week.number}</span>
                <span className="stack stack--tight" style={{ flex: 1, gap: 0 }}>
                  <strong>{week.course ? week.course.name : 'Kurs offen'}</strong>
                  <span className="muted small">
                    {formatRange(
                      zurichIsoDate(new Date(week.startsAt)),
                      zurichIsoDate(new Date(week.endsAt)),
                    )}
                    {week.picker && ` · ${week.picker.name}`}
                  </span>
                </span>
                {s === 'open' && <span className="chip chip--green">läuft</span>}
                {s === 'closed' && <span className="chip">vorbei</span>}
              </div>
            )
          })}
        </div>
      </div>

      {season.joinCode && (
        <div className="card stack">
          <div className="card-title">
            <h3>Liga-Code</h3>
            <span className="chip chip--green">zum Weitergeben</span>
          </div>
          <div className="join-code">{season.joinCode}</div>
          <p className="muted small">
            Einladungslink: <code>{window.location.origin}/#/beitreten/{season.joinCode}</code>
          </p>
          <div className="row">
            <button className="btn btn--ghost" onClick={() => navigate('/admin/wochen')}>
              Wochen
            </button>
            <button className="btn btn--ghost" onClick={() => navigate('/admin/einstellungen')}>
              Einstellungen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
