import { useEffect, useRef } from 'react'

export type KeyState = {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  drift: boolean
  boost: boolean
  camera: boolean
}

const defaultKeys = (): KeyState => ({
  forward: false,
  back: false,
  left: false,
  right: false,
  drift: false,
  boost: false,
  camera: false,
})

export function useKeyboard() {
  const keys = useRef<KeyState>(defaultKeys())

  useEffect(() => {
    const map: Record<string, keyof KeyState> = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'back',
      ArrowDown: 'back',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      Space: 'drift',
      ShiftLeft: 'boost',
      ShiftRight: 'boost',
      KeyC: 'camera',
    }

    const onDown = (e: KeyboardEvent) => {
      const k = map[e.code]
      if (!k) return
      if (k === 'camera') {
        if (!e.repeat) keys.current.camera = true
        return
      }
      e.preventDefault()
      keys.current[k] = true
    }
    const onUp = (e: KeyboardEvent) => {
      const k = map[e.code]
      if (!k || k === 'camera') return
      keys.current[k] = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  return keys
}
