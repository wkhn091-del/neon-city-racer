import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Mobile "Install App / Play Offline" prompt for PWA installability. */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('ncr-install-dismissed') === '1')
  const [isStandalone, setStandalone] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    setStandalone(mq.matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (hidden || isStandalone) return null
  const show = deferred || /iPhone|iPad|Android/i.test(navigator.userAgent)
  if (!show) return null

  return (
    <div className="install-banner" role="dialog" aria-label="Install app">
      <div className="install-copy">
        <strong>Install App / Play Offline</strong>
        <span>Add Neon City Racer to your home screen — full-screen, offline-ready.</span>
      </div>
      <div className="install-actions">
        {deferred && (
          <button
            type="button"
            className="install-go"
            onClick={async () => {
              await deferred.prompt()
              await deferred.userChoice
              setDeferred(null)
              setHidden(true)
              localStorage.setItem('ncr-install-dismissed', '1')
            }}
          >
            Install
          </button>
        )}
        {!deferred && (
          <button type="button" className="install-go" onClick={() => setHidden(true)}>
            Got it
          </button>
        )}
        <button
          type="button"
          className="install-dismiss"
          onClick={() => {
            setHidden(true)
            localStorage.setItem('ncr-install-dismissed', '1')
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
