import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { activeWeek, weekState, type LeagueData } from '@/state/league'
import { formatRange, timeLeft, zurichIsoDate } from '@/core/dates'
import { countingWeeks } from '@/core/settings'
import { Mark } from '@/ui/Brand'
import { initials } from '@/screens/Profile'

/**
 * Die Liga — der Startbildschirm.
 *
 * Oben steht, was gerade dran ist: die laufende Woche mit ihrem Kurs und der
 * Zeit, die noch bleibt. Darunter, wer mitspielt und auf welchem Handicap. Die
 * Tabelle selbst kommt, sobald es Runden gibt.
 */
export function Liga({ data, loading }: { data: LeagueData | null; loading: boolean }) {
  const { state } = useSession()
  const user = state.user!

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
  const state_ = current ? weekState(current) : null
  const myWeeks = weeks.filter((w) => w.picker?.id === user.id && !w.course)
  const me = players.find((p) => p.id === user.id)

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">{season.name}</span>
        <h1>Liga</h1>
        <p className="lede">
          {weeks.length} Wochen · die besten {countingWeeks(season.settings)} zählen ·{' '}
          {players.filter((p) => p.status === 'active').length} Spieler
          {season.status === 'draft' && ' · noch nicht gestartet'}
          {season.pausedAt && ' · pausiert'}
        </p>
      </div>

      {myWeeks.length > 0 && (
        <div className="card card--accent stack">
          <div className="card-title">
            <h3>Du bist mit dem Kurs dran</h3>
            <span className="chip chip--green">Woche {myWeeks[0].number}</span>
          </div>
          <p className="muted small">
            Trag Par, Stroke-Index, Rating und Slope aus GSPro ein. Danach sehen alle, worauf
            gespielt wird.
          </p>
          <button className="btn btn--primary" onClick={() => navigate(`/kurs/${myWeeks[0].id}`)}>
            Kurs eintragen
          </button>
        </div>
      )}

      {current && (
        <div className="card stack">
          <div className="card-title">
            <h3>
              Woche {current.number}
              {state_ === 'open' ? '' : ' — kommt noch'}
            </h3>
            <span className={state_ === 'open' ? 'chip chip--green' : 'chip'}>
              {state_ === 'open' ? timeLeft(current.endsAt) : 'ab ' + formatRange(
                zurichIsoDate(new Date(current.startsAt)),
                zurichIsoDate(new Date(current.endsAt)),
              )}
            </span>
          </div>

          {current.course ? (
            <>
              <div className="course-head">
                <div className="stack stack--tight" style={{ gap: 2 }}>
                  <strong>{current.course.name}</strong>
                  <span className="muted small">
                    {current.course.tee} · Par {current.course.par} · {current.course.lengthM} m
                  </span>
                </div>
                {current.course.ratingSource === 'estimate' && (
                  <span className="chip chip--amber">Rating geschätzt</span>
                )}
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <span className="value">{current.course.courseRating.toFixed(1)}</span>
                  <span className="label">Rating</span>
                </div>
                <div className="stat">
                  <span className="value">{current.course.slopeRating}</span>
                  <span className="label">Slope</span>
                </div>
                <div className="stat">
                  <span className="value">{current.submitted}</span>
                  <span className="label">abgegeben</span>
                </div>
              </div>
            </>
          ) : (
            <p className="muted small">
              Noch kein Kurs
              {current.picker ? ` — ${current.picker.name} ist dran.` : ' und niemand zugeteilt.'}
            </p>
          )}
        </div>
      )}

      <div className="card stack">
        <div className="card-title">
          <h3>Spieler</h3>
          <span className="muted small">Indoor-Handicap</span>
        </div>
        <div className="list">
          {players.map((player) => (
            <div className="list-item" key={player.id}>
              <span className="avatar">
                {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : initials(player.name)}
              </span>
              <span className="stack stack--tight" style={{ flex: 1, gap: 0 }}>
                <strong>
                  {player.name}
                  {player.id === user.id && <span className="muted small"> · du</span>}
                </strong>
                {player.status === 'withdrawn' ? (
                  <span className="muted small">ausgeschieden</span>
                ) : (
                  player.joinedWeek > 1 && (
                    <span className="muted small">dabei ab Woche {player.joinedWeek}</span>
                  )
                )}
              </span>
              <span className="num handicap-cell">
                {player.indoorHandicap === null ? '—' : player.indoorHandicap.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        {me && me.indoorHandicap === null && (
          <div className="notice notice--warn">
            Für dich ist noch kein Handicap hinterlegt. Trag im Profil dein Handicap draussen ein —
            daraus ergibt sich dein Startwert.
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Alle Wochen</h3>
        </div>
        <div className="list">
          {data.weeks.map((week) => {
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
