import { useSession } from '@/state/session'
import { useLeague } from '@/state/league'
import { navigate, useRoute } from '@/state/router'
import { Welcome } from '@/screens/Welcome'
import { Liga } from '@/screens/Liga'
import { Profile, initials } from '@/screens/Profile'
import { CourseEntry } from '@/screens/CourseEntry'
import { Week } from '@/screens/Week'
import { ScoreEntry } from '@/screens/ScoreEntry'
import { Card } from '@/screens/Card'
import { Player } from '@/screens/Player'
import { Power } from '@/screens/Power'
import { Termine } from '@/screens/Termine'
import { Clubhaus, Thema } from '@/screens/Clubhaus'
import { Mitteilungen } from '@/screens/Mitteilungen'
import { SeasonSetup } from '@/screens/admin/SeasonSetup'
import { SettingsScreen } from '@/screens/admin/SettingsScreen'
import { WeeksScreen } from '@/screens/admin/WeeksScreen'
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
  const league = useLeague(state.user?.id ?? null)
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
  const isAdmin = state.user.role === 'admin'

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" aria-label="Zur Liga">
          <Wordmark />
        </a>
        <div className="spacer" />
        {isAdmin && (
          <button className="icon-btn" onClick={() => navigate('/admin')} aria-label="Verwaltung">
            <IconCard />
          </button>
        )}
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

      {renderScreen()}

      <nav className="nav">
        <Tab to="/" icon={<IconFlag />} label="Liga" active={path === '/'} />
        <Tab to="/woche" icon={<IconCard />} label="Woche" active={screen === 'woche'} />
        <Tab to="/termine" icon={<IconCalendar />} label="Termine" active={screen === 'termine'} />
        <Tab to="/clubhaus" icon={<IconChat />} label="Clubhaus" active={screen === 'clubhaus'} />
        <Tab to="/profil" icon={<IconUser />} label="Profil" active={screen === 'profil'} />
      </nav>
    </div>
  )

  function renderScreen() {
    if (screen === 'profil') return <Profile />

    if (screen === 'kurs' && segments[1]) {
      return <CourseEntry weekId={segments[1]} data={league.data ?? { season: null, weeks: [], players: [] }} onSaved={league.reload} />
    }

    if (screen === 'admin') {
      if (!isAdmin) return <Soon title="Verwaltung" text="Das sieht nur der Admin." />
      const area = segments[1] ?? ''
      if (area === 'saison') return <SeasonSetup onDone={league.reload} />
      if (!league.data?.season) return <SeasonSetup onDone={league.reload} />
      if (area === 'einstellungen') {
        return <SettingsScreen season={league.data.season} onSaved={league.reload} />
      }
      if (area === 'wochen') return <WeeksScreen data={league.data} onChange={league.reload} />
      return <AdminHome />
    }

    const empty = { season: null, weeks: [], players: [] }

    if (screen === 'woche') {
      if (league.loading && !league.data) return <Loading />
      return <Week data={league.data ?? empty} />
    }
    if (screen === 'runde' && segments[1]) {
      if (league.loading && !league.data) return <Loading />
      return <ScoreEntry weekId={segments[1]} data={league.data ?? empty} />
    }
    if (screen === 'karte' && segments[1]) {
      return <Card roundId={segments[1]} />
    }
    if (screen === 'spieler' && segments[1]) {
      return <Player playerId={segments[1]} />
    }
    if (screen === 'power') {
      return <Power />
    }
    if (screen === 'termine') {
      if (league.loading && !league.data) return <Loading />
      return <Termine data={league.data ?? empty} />
    }
    if (screen === 'clubhaus') {
      return <Clubhaus />
    }
    if (screen === 'thema' && segments[1]) {
      return <Thema topicId={segments[1]} />
    }
    if (screen === 'mitteilungen') {
      return <Mitteilungen />
    }

    return <Liga data={league.data} loading={league.loading && !league.data} />
  }
}

function AdminHome() {
  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">Verwaltung</span>
        <h1>Was willst du tun?</h1>
      </div>
      <div className="stack stack--tight">
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/admin/wochen')}>
          Wochen und Kurszuteilung
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => navigate('/admin/einstellungen')}>
          Einstellungen der Liga
        </button>
      </div>
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

function Loading() {
  return (
    <div className="page center">
      <span className="spinner" style={{ margin: '0 auto' }} />
    </div>
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
