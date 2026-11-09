import { useSession } from '@/state/session'
import { navigate, useRoute } from '@/state/router'
import { Welcome } from '@/screens/Welcome'
import { Liga } from '@/screens/Liga'
import { Profile, initials } from '@/screens/Profile'
import { Wordmark } from '@/ui/Brand'
import { IconBell, IconCalendar, IconCard, IconChat, IconFlag, IconUser } from '@/ui/Icons'

/**
 * Die Hülle: Kopfzeile, Screen, Navigation.
 *
 * Welcher Screen erscheint, hängt an zwei Dingen — ob jemand angemeldet ist und
 * was im Hash steht. Mehr Routing braucht eine App mit fünf Reitern nicht.
 */
export default function App() {
  const { state, loading } = useSession()
  const { path, segments } = useRoute()

  if (loading) {
    return (
      <div className="app">
        <div className="page page--plain center" style={{ justifyContent: 'center' }}>
          <span className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  if (!state.user) {
    return (
      <div className="app">
        <div className="page page--plain">
          <Welcome />
        </div>
      </div>
    )
  }

  const screen = segments[0] ?? ''

  return (
    <div className="app">
      <header className="topbar">
        <Wordmark />
        <div className="spacer" />
        <button
          className="icon-btn"
          onClick={() => navigate('/mitteilungen')}
          aria-label="Mitteilungen"
        >
          <IconBell />
          {(state.unreadNotifications ?? 0) > 0 && <span className="dot" />}
        </button>
        <button className="avatar" onClick={() => navigate('/profil')} aria-label="Profil">
          {state.user.avatarUrl ? <img src={state.user.avatarUrl} alt="" /> : initials(state.user.name)}
        </button>
      </header>

      {screen === 'profil' ? (
        <Profile />
      ) : screen === 'woche' ? (
        <Soon title="Die Woche" text="Kurs, Score eintragen, Screenshot hochladen, bestätigen." />
      ) : screen === 'termine' ? (
        <Soon title="Termine" text="Termin ausschreiben, zusagen, Flight steht." />
      ) : screen === 'clubhaus' ? (
        <Soon title="Clubhaus" text="Themen eröffnen, mitreden, Karten kommentieren." />
      ) : screen === 'mitteilungen' ? (
        <Soon title="Mitteilungen" text="Zusagen, Bestätigungen, Antworten." />
      ) : screen === 'admin' ? (
        <Soon title="Verwaltung" text="Saison anlegen, Wochen setzen, Kurse zuteilen." />
      ) : (
        <Liga />
      )}

      <nav className="nav">
        <Tab to="/" icon={<IconFlag />} label="Liga" active={path === '/'} />
        <Tab to="/woche" icon={<IconCard />} label="Woche" active={screen === 'woche'} />
        <Tab to="/termine" icon={<IconCalendar />} label="Termine" active={screen === 'termine'} />
        <Tab to="/clubhaus" icon={<IconChat />} label="Clubhaus" active={screen === 'clubhaus'} />
        <Tab to="/profil" icon={<IconUser />} label="Profil" active={screen === 'profil'} />
      </nav>
    </div>
  )
}

function Tab({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <a
      href={`#${to}`}
      className={active ? 'is-active' : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {label}
    </a>
  )
}

/** Platzhalter für das, was in einer späteren Etappe kommt. */
function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Bald</span>
        <h1>{title}</h1>
      </div>
      <div className="empty">
        <p>{text}</p>
        <p className="small">Dieser Teil wird als Nächstes gebaut.</p>
      </div>
    </div>
  )
}
