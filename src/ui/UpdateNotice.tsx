import { useEffect, useState } from 'react'

/**
 * «Eine neue Fassung ist da.»
 *
 * Die App bringt sich im Hintergrund auf den neuesten Stand, zeigt ihn aber
 * erst nach dem nächsten Laden. Ohne Hinweis merkt das niemand: man sieht
 * weiter die alte Fassung und hält sie für die aktuelle.
 *
 * Geladen wird trotzdem nicht von allein. Wer gerade Loch dreizehn eintippt,
 * verliert durch ein Neuladen achtzehn mühsam getippte Zahlen — das ist
 * schlimmer als eine Fassung Rückstand. Also sagt die App Bescheid und
 * überlässt den Moment dem, der davorsitzt.
 */

const STUNDE = 60 * 60 * 1000

export function UpdateNotice() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    /* Beim allerersten Besuch übernimmt der Service Worker zum ersten Mal.
       Das ist kein Update, sondern der Normalfall — und kein Grund, jemandem
       beim ersten Öffnen ein Neuladen vorzuschlagen. */
    const hadController = Boolean(navigator.serviceWorker.controller)

    let cancelled = false
    let timer: number | undefined

    function onControllerChange() {
      if (hadController) setReady(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    /* Ein Tab, der tagelang offen steht, fragt sonst nie nach. */
    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration || cancelled) return
      timer = window.setInterval(() => {
        void registration.update().catch(() => {})
      }, STUNDE)
    })

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [])

  if (!ready) return null

  return (
    <div className="update-notice" role="status">
      <span>Eine neue Fassung der App ist bereit.</span>
      <button className="btn btn--ghost" onClick={() => window.location.reload()}>
        Neu laden
      </button>
    </div>
  )
}
