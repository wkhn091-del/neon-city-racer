import { useEffect, useRef } from 'react'
import type { KeyState } from './useKeyboard'
import { useKeyboard } from './useKeyboard'

export type TouchControls = {
  steer: number
  forward: boolean
  back: boolean
  drift: boolean
  boost: boolean
}

const defaultTouch = (): TouchControls => ({
  steer: 0,
  forward: false,
  back: false,
  drift: false,
  boost: false,
})

/** Shared mutable touch state — MobileTouchControls writes, vehicles read. */
export const touchState: TouchControls = defaultTouch()

export function useControls() {
  const keys = useKeyboard()
  const merged = useRef<KeyState & { steer: number }>({
    forward: false,
    back: false,
    left: false,
    right: false,
    drift: false,
    boost: false,
    camera: false,
    steer: 0,
  })

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const k = keys.current
      const t = touchState
      merged.current.forward = k.forward || t.forward
      merged.current.back = k.back || t.back
      merged.current.drift = k.drift || t.drift
      merged.current.boost = k.boost || t.boost
      merged.current.camera = k.camera
      merged.current.left = k.left || t.steer < -0.15
      merged.current.right = k.right || t.steer > 0.15
      merged.current.steer = k.left ? -1 : k.right ? 1 : t.steer
      if (k.camera) keys.current.camera = false
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [keys])

  return merged
}
