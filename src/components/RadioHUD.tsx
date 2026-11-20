import { useEffect, useMemo } from 'react'
import { CarRadio } from '../audio/CarRadio'
import { RADIO_LABELS, useGameStore } from '../store/gameStore'

export function RadioHUD() {
  const radio = useGameStore((s) => s.radio)
  const setRadio = useGameStore((s) => s.setRadio)
  const rpm = useGameStore((s) => s.rpm)
  const deck = useMemo(() => new CarRadio(), [])

  useEffect(() => {
    void deck.ensure().then(() => deck.setStation(radio))
    return () => deck.stop()
  }, [deck])

  useEffect(() => {
    void deck.ensure().then(() => deck.setStation(radio))
  }, [radio, deck])

  useEffect(() => {
    const id = window.setInterval(() => {
      const impact = (window as unknown as { __impact?: number }).__impact ?? 0
      deck.update(useGameStore.getState().rpm, impact)
      ;(window as unknown as { __impact?: number }).__impact = Math.max(0, impact - 0.08)
    }, 50)
    return () => clearInterval(id)
  }, [deck, rpm])

  return (
    <div className="radio-hud" aria-label="Car radio">
      <div className="radio-head">
        <span>STEREO</span>
        <b>{RADIO_LABELS.find((r) => r.id === radio)?.label ?? 'OFF'}</b>
      </div>
      <div className="radio-stations">
        {RADIO_LABELS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={radio === s.id ? 'active' : ''}
            onClick={() => {
              void deck.ensure().then(() => setRadio(s.id))
            }}
          >
            {s.id === 'off' ? 'OFF' : s.label.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  )
}
