import { PAINT_COLORS, useGameStore, type MenuTab, type PaintId, type QualityPreset } from '../store/gameStore'
import { CARS, type CarId } from '../garage/cars'
import { useGarageStore } from '../store/garageStore'
import { STAGE_LIST, getStageDef } from '../world/stages'
import { GarageShowroom } from './GarageShowroom'

const paints = Object.keys(PAINT_COLORS) as PaintId[]
const qualities: QualityPreset[] = ['low', 'medium', 'high']
const TABS: { id: MenuTab; label: string }[] = [
  { id: 'circuits', label: 'Circuits' },
  { id: 'garage', label: 'Garage' },
  { id: 'options', label: 'Setup' },
]

const CIRCUIT_ART: Record<string, string> = {
  eternal_city: '/ui/circuit_eternal_city.jpg',
  eastern_bay: '/ui/circuit_eastern_bay.jpg',
  monza: '/ui/circuit_monza.jpg',
}

export function MainMenu() {
  const stage = useGameStore((s) => s.stage)
  const mode = useGameStore((s) => s.mode)
  const paint = useGameStore((s) => s.paint)
  const quality = useGameStore((s) => s.quality)
  const menuTab = useGameStore((s) => s.menuTab)
  const setStage = useGameStore((s) => s.setStage)
  const setMode = useGameStore((s) => s.setMode)
  const setPaint = useGameStore((s) => s.setPaint)
  const setQuality = useGameStore((s) => s.setQuality)
  const setMenuTab = useGameStore((s) => s.setMenuTab)
  const startRace = useGameStore((s) => s.startRace)

  const cash = useGarageStore((s) => s.cash)
  const owned = useGarageStore((s) => s.owned)
  const activeCar = useGarageStore((s) => s.activeCar)
  const previewCar = useGarageStore((s) => s.previewCar)
  const setPreviewCar = useGarageStore((s) => s.setPreviewCar)
  const selectActiveCar = useGarageStore((s) => s.selectActiveCar)
  const buyCar = useGarageStore((s) => s.buyCar)

  const preview = CARS.find((c) => c.id === previewCar)!
  const ownsPreview = owned.includes(previewCar)
  const stageDef = getStageDef(stage)
  const activeCarDef = CARS.find((c) => c.id === activeCar) ?? preview

  const drive = () => {
    if (ownsPreview) selectActiveCar(previewCar)
    startRace()
  }

  return (
    <div className="menu">
      <GarageShowroom />
      <div className="menu-backdrop" aria-hidden />
      <div className="menu-veil" />

      <header className="shell-top">
        <div className="shell-brand">
          <span className="shell-eyebrow">Night Circuit Series</span>
          <strong>NEON CITY RACER</strong>
        </div>
        <div className="shell-cash">
          <span>BANK</span>
          <b>${cash.toLocaleString()}</b>
        </div>
      </header>

      <nav className="shell-tabs" aria-label="Menu sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={menuTab === tab.id ? 'active' : ''}
            onClick={() => setMenuTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="shell-body">
        {menuTab === 'circuits' && (
          <section className="shell-card" aria-label="Circuits">
            <div className="shell-card-head">
              <h2>Circuits</h2>
              <p>Every map is a stage.</p>
            </div>
            <div className="circuit-list">
              {STAGE_LIST.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`circuit-row ${stage === s.id ? 'active' : ''}`}
                  onClick={() => setStage(s.id)}
                  style={{ ['--circuit-art' as string]: `url(${CIRCUIT_ART[s.id] ?? ''})` }}
                >
                  <span className="circuit-art" />
                  <span className="circuit-copy">
                    <span className="circuit-index">{String(i + 1).padStart(2, '0')}</span>
                    <span className="circuit-series">{s.series}</span>
                    <span className="circuit-name">{s.name}</span>
                    <span className="circuit-sub">{s.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mode-row">
              <button type="button" className={mode === 'freedrift' ? 'active' : ''} onClick={() => setMode('freedrift')}>
                Free Drift
              </button>
              <button type="button" className={mode === 'timeattack' ? 'active' : ''} onClick={() => setMode('timeattack')}>
                Time Attack
              </button>
            </div>
          </section>
        )}

        {menuTab === 'garage' && (
          <section className="shell-card" aria-label="Garage">
            <div className="shell-card-head">
              <h2>Garage</h2>
              <p>Preview left · equip here.</p>
            </div>
            <div className="car-strip">
              {CARS.map((car) => {
                const ownedCar = owned.includes(car.id)
                return (
                  <button
                    key={car.id}
                    type="button"
                    className={`car-chip ${previewCar === car.id ? 'active' : ''} ${activeCar === car.id ? 'equipped' : ''}`}
                    onClick={() => setPreviewCar(car.id as CarId)}
                  >
                    <span className="car-chip-class">{car.classLabel}</span>
                    <span className="car-chip-name">{car.name}</span>
                    <span className="car-chip-meta">
                      {ownedCar ? (activeCar === car.id ? 'ACTIVE' : 'OWNED') : `$${car.price.toLocaleString()}`}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="car-sheet">
              <p>{preview.description}</p>
              <div className="stat-row">
                <span>
                  <i>SPD</i> {preview.topSpeed}
                </span>
                <span>
                  <i>ACC</i> {preview.acceleration}
                </span>
                <span>
                  <i>DRIFT</i> {preview.driftGrip}
                </span>
              </div>
              {ownsPreview ? (
                <button type="button" className="deal-btn" onClick={() => selectActiveCar(previewCar)}>
                  {activeCar === previewCar ? 'READY TO DRIVE' : 'EQUIP / DRIVE'}
                </button>
              ) : (
                <button
                  type="button"
                  className="deal-btn buy"
                  onClick={() => {
                    const res = buyCar(previewCar)
                    if (!res.ok) window.alert(res.reason ?? 'Cannot buy')
                    else selectActiveCar(previewCar)
                  }}
                >
                  BUY / DRIVE · ${preview.price.toLocaleString()}
                </button>
              )}
            </div>
          </section>
        )}

        {menuTab === 'options' && (
          <section className="shell-card" aria-label="Setup">
            <div className="shell-card-head">
              <h2>Setup</h2>
              <p>Paint & graphics quality.</p>
            </div>
            <div className="paint-row">
              {paints.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`swatch ${paint === p ? 'active' : ''}`}
                  style={{ background: PAINT_COLORS[p] }}
                  onClick={() => setPaint(p)}
                  title={p}
                />
              ))}
            </div>
            <div className="mode-row">
              {qualities.map((q) => (
                <button key={q} type="button" className={quality === q ? 'active' : ''} onClick={() => setQuality(q)}>
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="shell-dock">
        <div className="dock-meta">
          <div>
            <span className="dock-label">Circuit</span>
            <strong>{stageDef.name}</strong>
          </div>
          <div>
            <span className="dock-label">Car</span>
            <strong>{ownsPreview ? preview.name : activeCarDef.name}</strong>
          </div>
        </div>
        <button type="button" className="dock-drive" onClick={drive}>
          <span>DRIVE</span>
        </button>
      </footer>
    </div>
  )
}
