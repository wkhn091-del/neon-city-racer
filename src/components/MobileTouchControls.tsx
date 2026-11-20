import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { touchState } from '../hooks/useControls'

function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches)
  )
}

export function MobileTouchControls() {
  const [forceShow, setForceShow] = useState(false)
  const [autoTouch] = useState(() => isTouchDevice())
  const show = autoTouch || forceShow

  useEffect(() => {
    if (!show) {
      touchState.steer = 0
      touchState.forward = false
      touchState.back = false
      touchState.drift = false
      touchState.boost = false
    }
  }, [show])

  const hold = (key: keyof typeof touchState, value: boolean | number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      ;(touchState as Record<string, boolean | number>)[key] = value
    },
    onPointerUp: () => {
      if (typeof value === 'boolean') (touchState as Record<string, boolean | number>)[key] = false
      else touchState.steer = 0
    },
    onPointerCancel: () => {
      if (typeof value === 'boolean') (touchState as Record<string, boolean | number>)[key] = false
      else touchState.steer = 0
    },
  })

  return (
    <>
      <button
        type="button"
        className="touch-toggle"
        onClick={() => setForceShow((v) => !v)}
        aria-label="Toggle touch controls"
      >
        {show ? 'HIDE TOUCH' : 'TOUCH CONTROLS'}
      </button>

      {show && (
        <div className="touch-hud" aria-hidden={!show}>
          <div className="touch-left">
            <button type="button" className="touch-btn steer" {...hold('steer', -1)}>
              ◀
            </button>
            <button type="button" className="touch-btn steer" {...hold('steer', 1)}>
              ▶
            </button>
          </div>
          <div className="touch-right">
            <button type="button" className="touch-btn nitro" {...hold('boost', true)}>
              N2O
            </button>
            <button type="button" className="touch-btn drift" {...hold('drift', true)}>
              DRIFT
            </button>
            <button type="button" className="touch-btn brake" {...hold('back', true)}>
              BRAKE
            </button>
            <button type="button" className="touch-btn gas" {...hold('forward', true)}>
              GAS
            </button>
          </div>
        </div>
      )}
    </>
  )
}
