import { PAINT_COLORS, useGameStore, type PaintId } from '../store/gameStore'

const paints = Object.keys(PAINT_COLORS) as PaintId[]

export function MainMenu() {
  const stage = useGameStore((s) => s.stage)
  const mode = useGameStore((s) => s.mode)
  const paint = useGameStore((s) => s.paint)
  const setStage = useGameStore((s) => s.setStage)
  const setMode = useGameStore((s) => s.setMode)
  const setPaint = useGameStore((s) => s.setPaint)
  const startRace = useGameStore((s) => s.startRace)

  return (
    <div className="menu">
      <div className="menu-bg" />
      <div className="menu-panel">
        <p className="eyebrow">OPEN DISTRICT DRIVING</p>
        <h1>NEON CITY RACER</h1>
        <p className="tagline">Raycast physics · dual stages · free drift & time attack</p>

        <section>
          <h2>Stage</h2>
          <div className="row">
            <button className={stage === 'stage1' ? 'active' : ''} onClick={() => setStage('stage1')}>
              Stage 1 — Neon Downtown
            </button>
            <button className={stage === 'stage2' ? 'active' : ''} onClick={() => setStage('stage2')}>
              Stage 2 — Mountain Touge
            </button>
          </div>
        </section>

        <section>
          <h2>Mode</h2>
          <div className="row">
            <button className={mode === 'freedrift' ? 'active' : ''} onClick={() => setMode('freedrift')}>
              Free Drift
            </button>
            <button className={mode === 'timeattack' ? 'active' : ''} onClick={() => setMode('timeattack')}>
              Time Attack
            </button>
          </div>
        </section>

        <section>
          <h2>Car Paint</h2>
          <div className="paint-row">
            {paints.map((p) => (
              <button
                key={p}
                className={`swatch ${paint === p ? 'active' : ''}`}
                style={{ background: PAINT_COLORS[p] }}
                onClick={() => setPaint(p)}
                title={p}
              />
            ))}
          </div>
        </section>

        <button className="start" onClick={startRace}>
          START ENGINE
        </button>
      </div>
    </div>
  )
}
