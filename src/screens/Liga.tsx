import { useSession } from '@/state/session'
import { navigate } from '@/state/router'
import { Mark } from '@/ui/Brand'

/**
 * Die Liga — der Startbildschirm.
 *
 * Steht hier noch keine Saison, zeigt der Screen genau das und was als Nächstes
 * zu tun ist. Tabelle, Wochenstand und Power Rankings kommen in Etappe 4.
 */
export function Liga() {
  const { state } = useSession()
  const user = state.user!
  const season = state.season

  if (!season) {
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

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">{season.name}</span>
        <h1>Tabelle</h1>
        <p className="lede">Kommt in der nächsten Etappe.</p>
      </div>
      {season.joinCode && (
        <div className="card stack">
          <div className="card-title">
            <h3>Liga-Code</h3>
            <span className="chip chip--green">zum Weitergeben</span>
          </div>
          <div className="join-code">{season.joinCode}</div>
          <p className="muted small">
            Damit meldet sich jemand an. Der Link dazu:{' '}
            <code>{window.location.origin}/#/beitreten/{season.joinCode}</code>
          </p>
        </div>
      )}
    </div>
  )
}
