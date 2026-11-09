import { useEffect, useState } from 'react'

/**
 * Ein kleiner Router auf dem Hash.
 *
 * Kein Server muss dafür etwas umschreiben, und die App funktioniert auch dann,
 * wenn sie als PWA vom Startbildschirm aus geöffnet wird.
 */

export function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

export function navigate(to: string, replace = false) {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`
  if (replace) window.location.replace(target)
  else window.location.hash = target
}

export function useRoute(): { path: string; segments: string[] } {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onChange = () => {
      setPath(currentPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return { path, segments: path.split('/').filter(Boolean) }
}
