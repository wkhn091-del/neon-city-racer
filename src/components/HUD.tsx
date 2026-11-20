import { useGameStore, CAMERA_LABELS, type PhotoFilter } from '../store/gameStore'
import { useGarageStore } from '../store/garageStore'
import { getCar } from '../garage/cars'
import { getStageDef } from '../world/stages'
import { ATMOSPHERES } from '../world/atmosphere'
import { ESCAPE_SECONDS, HEAT_MAX } from '../systems/heatSystem'
import { MobileTouchControls } from './MobileTouchControls'
import { RadioHUD } from './RadioHUD'
import { JuiceFX } from './JuiceFX'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2).padStart(5, '0')
  return `${m}:${sec}`
}

function modeLabel(mode: string) {
  if (mode === 'freedrift') return 'FREE DRIFT'
  if (mode === 'policechase') return 'POLICE CHASE'
  return 'TIME ATTACK'
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
  const heat = useGameStore((s) => s.heat)
  const heatEscape = useGameStore((s) => s.heatEscape)
  const escapePayout = useGameStore((s) => s.escapePayout)
  const atmosphere = useGameStore((s) => s.atmosphere)
  const photoFilter = useGameStore((s) => s.photoFilter)
  const photoDof = useGameStore((s) => s.photoDof)
  const setAtmosphere = useGameStore((s) => s.setAtmosphere)
  const setCamera = useGameStore((s) => s.setCamera)
  const toggleCamera = useGameStore((s) => s.toggleCamera)
  const setPhotoFilter = useGameStore((s) => s.setPhotoFilter)
  const setPhotoDof = useGameStore((s) => s.setPhotoDof)
  const setScreen = useGameStore((s) => s.setScreen)
  const cash = useGarageStore((s) => s.cash)
  const activeCar = useGarageStore((s) => s.activeCar)
  const car = getCar(activeCar)
  const stageDef = getStageDef(stage)

  const rpmPct = Math.min(100, (rpm / 8000) * 100)
  const nitroPct = Math.max(0, Math.min(100, nitro))
  const escapePct = Math.min(100, (heatEscape / ESCAPE_SECONDS) * 100)
  const filters: PhotoFilter[] = ['none', 'neon', 'noir', 'warm']

  return (
    <div className="hud">
      <JuiceFX />
      <div className="hud-top">
        <div className="pill">{stageDef.name.toUpperCase()}</div>
        <div className="pill">{modeLabel(mode)}</div>
        <div className="pill">{car.name}</div>
        <div className="pill">${cash.toLocaleString()}</div>
        <button type="button" className="pill btn cam-btn" onClick={() => toggleCamera()} title="Cycle camera (C)">
          CAM {CAMERA_LABELS[camera]}
        </button>
        <button type="button" className="pill btn" onClick={() => setScreen('menu')}>
          MENU
        </button>
      </div>

      {(mode === 'freedrift' || mode === 'policechase') && (
        <div className="heat-panel" aria-label={`Heat level ${heat}`}>
          <span className="heat-label">HEAT</span>
          <div className="heat-stars">
            {Array.from({ length: HEAT_MAX }, (_, i) => (
              <i key={i} className={i < heat ? 'on' : ''} />
            ))}
          </div>
          {heat > 0 && (
            <div className="escape-meter">
              <span>ESCAPE</span>
              <div className="bar">
                <div className="bar-fill escape" style={{ width: `${escapePct}%` }} />
              </div>
            </div>
          )}
          {escapePayout > 0 && heat === 0 && <div className="escape-toast">+${escapePayout.toLocaleString()} ESCAPE</div>}
        </div>
      )}

      <div className="atm-hud">
        {ATMOSPHERES.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`atm-chip ${atmosphere === a.id ? 'active' : ''}`}
            onClick={() => setAtmosphere(a.id)}
          >
            {a.label}
          </button>
        ))}
        <button type="button" className="atm-chip" onClick={() => setCamera('chase')}>
          Chase
        </button>
        <button type="button" className={`atm-chip ${camera === 'drift' ? 'active' : ''}`} onClick={() => setCamera('drift')}>
          Drift Cam
        </button>
        <button type="button" className={`atm-chip ${camera === 'hood' ? 'active' : ''}`} onClick={() => setCamera('hood')}>
          Hood
        </button>
        <button type="button" className={`atm-chip ${camera === 'photo' ? 'active' : ''}`} onClick={() => setCamera('photo')}>
          Photo
        </button>
      </div>

      {camera === 'photo' && (
        <div className="photo-toolbar" aria-label="Photo mode">
          <span>PHOTO MODE — drag to orbit</span>
          <div className="photo-row">
            {filters.map((f) => (
              <button key={f} type="button" className={photoFilter === f ? 'active' : ''} onClick={() => setPhotoFilter(f)}>
                {f.toUpperCase()}
              </button>
            ))}
            <button type="button" className={photoDof ? 'active' : ''} onClick={() => setPhotoDof(!photoDof)}>
              DOF {photoDof ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}

      <RadioHUD />

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
          {mode === 'timeattack' ? (
            <>
              <div className="score-label">LAP</div>
              <div className="score-value">{formatTime(lapTime)}</div>
              <div className="mult">BEST {bestLap ? formatTime(bestLap) : '--'}</div>
              <div className="mult">CP {checkpoint}</div>
            </>
          ) : mode === 'policechase' ? (
            <>
              <div className="score-label">WANTED</div>
              <div className={`score-value ${heat > 0 ? 'hot' : ''}`}>{heat}★</div>
              <div className="mult">{heat > 0 ? 'LOSE THE TAIL' : 'CLEAN'}</div>
            </>
          ) : (
            <>
              <div className="score-label">DRIFT SCORE</div>
              <div className={`score-value ${drifting ? 'hot' : ''}`}>{driftScore.toLocaleString()}</div>
              <div className="mult">x{mult.toFixed(1)}</div>
            </>
          )}
        </div>

        <div className="minimap">
          <div className="minimap-ring" />
          <div className="minimap-dot" />
          <span>MAP</span>
        </div>
      </div>

      <div className="hints">WASD drive · SPACE drift · SHIFT nitro · C camera · touch HUD on mobile</div>
      <MobileTouchControls />
    </div>
  )
}
