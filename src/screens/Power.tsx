import { navigate } from '@/state/router'
import { useSession } from '@/state/session'
import { useStandings } from '@/state/standings'
import { initials } from '@/screens/Profile'
import { Trend } from '@/ui/Trend'

/**
 * Power Rankings in voller Länge.
 *
 * Die Tabelle sagt, wer die Saison führt. Das hier sagt, wer gerade gefährlich
 * ist — und vor den Playoffs ist das die interessantere Frage.
 */
export function Power() {
  const { state } = useSession()
  const { data, loading } = useStandings(state.user!.id)

  if (loading) {
    return (
      <div className="page center">
        <span className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  const power = data?.power ?? []

  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Form</span>
        <h1>Power Rankings</h1>
        <p className="lede">
          Drei Viertel Form aus den letzten drei Runden, ein Viertel Saisonschnitt. Der Pfeil
          vergleicht mit den drei Runden davor.
        </p>
      </div>

      {power.length === 0 ? (
        <div className="empty">
          <p>Dafür braucht es ein paar gespielte Runden.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table">
            {power.map((row) => (
              <button
                key={row.userId}
                className={`table-row${row.userId === state.user!.id ? ' is-me' : ''}`}
                onClick={() => navigate(`/spieler/${row.userId}`)}
              >
                <span className="rank">{row.rank}</span>
                <span className="avatar">
                  {row.avatarUrl ? <img src={row.avatarUrl} alt="" /> : initials(row.name)}
                </span>
                <span className="table-name">
                  <strong>{row.name}</strong>
                  <span className="muted small">
                    Form {row.form.toFixed(1)} · Schnitt {row.average.toFixed(1)} · Streuung ±
                    {row.spread.toFixed(1)}
                  </span>
                </span>
                <Trend value={row.trend} />
                <span className="table-total num">{row.score.toFixed(1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="card-title">
          <h3>Was die Zahlen heissen</h3>
        </div>
        <p className="muted small">
          <strong>Form</strong> ist der Punkteschnitt der letzten drei Runden. <strong>Streuung</strong>{' '}
          sagt, wie verlässlich jemand spielt: ±2 heisst, die Runden liegen eng beieinander, ±10
          heisst Achterbahn. Für die Playoffs ist beides von Belang — Form gewinnt ein Match, die
          Streuung sagt, ob man sich darauf verlassen kann.
        </p>
      </div>

      <button className="btn btn--quiet" onClick={() => navigate('/')}>
        Zurück zur Liga
      </button>
    </div>
  )
}
