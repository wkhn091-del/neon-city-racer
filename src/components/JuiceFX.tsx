import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'

/** Speed vignette, floating cash popups, photo filter overlay. */
export function JuiceFX() {
  const speed = useGameStore((s) => s.speedKmh)
  const popups = useGameStore((s) => s.cashPopups)
  const prunePopups = useGameStore((s) => s.prunePopups)
  const camera = useGameStore((s) => s.camera)
  const photoFilter = useGameStore((s) => s.photoFilter)
  const hitStopUntil = useGameStore((s) => s.hitStopUntil)

  useEffect(() => {
    const id = window.setInterval(() => prunePopups(), 200)
    return () => clearInterval(id)
  }, [prunePopups])

  const vignette = Math.min(1, Math.max(0, (speed - 220) / 80))
  const hitStop = performance.now() < hitStopUntil

  return (
    <>
      <div
        className="speed-vignette"
        style={{ opacity: vignette * 0.85 }}
        aria-hidden
      />
      {hitStop && <div className="hit-stop-flash" aria-hidden />}
      <div className="cash-popups" aria-live="polite">
        {popups.map((p) => (
          <div key={p.id} className="cash-popup">
            {p.text}
          </div>
        ))}
      </div>
      {camera === 'photo' && photoFilter !== 'none' && (
        <div className={`photo-filter-overlay filter-${photoFilter}`} aria-hidden />
      )}
    </>
  )
}
