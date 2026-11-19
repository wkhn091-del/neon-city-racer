import { useGameStore } from '../store/gameStore'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2).padStart(5, '0')
  return `${m}:${sec}`
}

export function HUD() {
  const speed = useGameStore((s) => s.speedKmh)
  const rpm = useGameStore((s) => s.rpm)
  const nitro = useGameStore((s) => s.nitro)
  const driftScore = useGameStore((s) => s.driftScore)
  const mult = useGameStore((s) => s.driftMultiplier)
  const drifting = useGameStore((s) => s.isDrifting)
  const mode = useGameStore((s) => s.mode)
  const stage = useGameStore((s) => s.stage)
  const camera = useGameStore((s) => s.camera)
  const lapTime = useGameStore((s) => s.lapTime)
  const bestLap = useGameStore((s) => s.bestLap)
  const checkpoint = useGameStore((s) => s.checkpointIndex)
  const setScreen = useGameStore((s) => s.setScreen)

  const rpmPct = Math.min(100, (rpm / 8000) * 100)
  const nitroPct = Math.max(0, Math.min(100, nitro))

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="pill">{stage === 'stage1' ? 'NEON CITY' : 'MOUNTAIN TOUGE'}</div>
        <div className="pill">{mode === 'freedrift' ? 'FREE DRIFT' : 'TIME ATTACK'}</div>
        <div className="pill">CAM {camera.toUpperCase()}</div>
        <button className="pill btn" onClick={() => setScreen('menu')}>
          MENU
        </button>
      </div>

      <div className="hud-bottom">
        <div className="speedo">
          <div className="speed-num">{Math.round(speed)}</div>
          <div className="speed-unit">KM/H</div>
          <div className="bar">
            <div className="bar-fill rpm" style={{ width: `${rpmPct}%` }} />
          </div>
          <div className="bar-label">RPM</div>
          <div className="bar">
            <div className="bar-fill nitro" style={{ width: `${nitroPct}%` }} />
          </div>
          <div className="bar-label">NITRO</div>
        </div>

        <div className="score-panel">
          {mode === 'freedrift' ? (
            <>
              <div className="score-label">DRIFT SCORE</div>
              <div className={`score-value ${drifting ? 'hot' : ''}`}>{driftScore.toLocaleString()}</div>
              <div className="mult">x{mult.toFixed(1)}</div>
            </>
          ) : (
            <>
              <div className="score-label">LAP</div>
              <div className="score-value">{formatTime(lapTime)}</div>
              <div className="mult">BEST {bestLap ? formatTime(bestLap) : '--'}</div>
              <div className="mult">CP {checkpoint}</div>
            </>
          )}
        </div>

        <div className="minimap">
          <div className="minimap-ring" />
          <div className="minimap-dot" />
          <span>MAP</span>
        </div>
      </div>

      <div className="hints">WASD drive · SPACE drift · SHIFT nitro · C camera</div>
    </div>
  )
}
