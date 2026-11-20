import type { CarId } from './cars'

export const TUNING_MAX_LEVEL = 5

export type TuningStat = 'engine' | 'tires' | 'drift' | 'nitro'

export type PaintFinish = 'gloss' | 'matte' | 'pearl' | 'chrome'

export type UnderglowId = 'off' | 'cyan' | 'magenta' | 'lime' | 'gold'

export type CarTuning = {
  engine: number
  tires: number
  drift: number
  nitro: number
}

export type CarVisuals = {
  finish: PaintFinish
  underglow: UnderglowId
  rimHue: number
  windowTint: number
}

export type CarSetup = CarTuning & CarVisuals

export const TUNING_LABELS: Record<TuningStat, { title: string; blurb: string }> = {
  engine: {
    title: 'Engine & Turbo',
    blurb: 'Horsepower, top speed, louder blow-off, bigger exhaust flames.',
  },
  tires: {
    title: 'Tires & Suspension',
    blurb: 'Cornering grip + lower raycast ride height.',
  },
  drift: {
    title: 'Drift Angle Kit',
    blurb: 'Wider steering lock and smoother high-angle drifts.',
  },
  nitro: {
    title: 'Nitrous Tank',
    blurb: 'Capacity, recharge, dual-stage purple/cyan flames.',
  },
}

export const PAINT_FINISHES: { id: PaintFinish; label: string }[] = [
  { id: 'gloss', label: 'Gloss Metallic' },
  { id: 'matte', label: 'Matte Stealth' },
  { id: 'pearl', label: 'Pearlescent' },
  { id: 'chrome', label: 'Chrome' },
]

export const UNDERGLOW_OPTIONS: { id: UnderglowId; label: string; color: string }[] = [
  { id: 'off', label: 'Off', color: '#000000' },
  { id: 'cyan', label: 'Cyan', color: '#22e0ff' },
  { id: 'magenta', label: 'Magenta', color: '#ff2bd6' },
  { id: 'lime', label: 'Electric Lime', color: '#b8ff1a' },
  { id: 'gold', label: 'Gold', color: '#ffc14d' },
]

export function defaultTuning(): CarTuning {
  return { engine: 1, tires: 1, drift: 1, nitro: 1 }
}

export function defaultVisuals(): CarVisuals {
  return { finish: 'gloss', underglow: 'off', rimHue: 0.55, windowTint: 0.15 }
}

export function defaultSetup(): CarSetup {
  return { ...defaultTuning(), ...defaultVisuals() }
}

/** Cash cost to go from `level` → `level + 1` (level is current, 1..4). */
export function upgradeCost(stat: TuningStat, level: number): number {
  if (level >= TUNING_MAX_LEVEL) return 0
  const base: Record<TuningStat, number> = {
    engine: 4200,
    tires: 3600,
    drift: 3800,
    nitro: 4000,
  }
  return Math.round(base[stat] * Math.pow(1.55, level - 1))
}

export function clampLevel(n: unknown): number {
  const v = typeof n === 'number' ? Math.floor(n) : 1
  return Math.min(TUNING_MAX_LEVEL, Math.max(1, v))
}

export function sanitizeSetup(raw: Partial<CarSetup> | undefined): CarSetup {
  const d = defaultSetup()
  if (!raw) return d
  const finishes = new Set(PAINT_FINISHES.map((f) => f.id))
  const glows = new Set(UNDERGLOW_OPTIONS.map((g) => g.id))
  return {
    engine: clampLevel(raw.engine),
    tires: clampLevel(raw.tires),
    drift: clampLevel(raw.drift),
    nitro: clampLevel(raw.nitro),
    finish: finishes.has(raw.finish as PaintFinish) ? (raw.finish as PaintFinish) : d.finish,
    underglow: glows.has(raw.underglow as UnderglowId) ? (raw.underglow as UnderglowId) : d.underglow,
    rimHue: typeof raw.rimHue === 'number' ? Math.min(1, Math.max(0, raw.rimHue)) : d.rimHue,
    windowTint: typeof raw.windowTint === 'number' ? Math.min(0.85, Math.max(0, raw.windowTint)) : d.windowTint,
  }
}

/** Runtime multipliers applied by HeroCar / showroom. */
export function tuningMultipliers(t: CarTuning) {
  const e = (t.engine - 1) / (TUNING_MAX_LEVEL - 1)
  const ti = (t.tires - 1) / (TUNING_MAX_LEVEL - 1)
  const d = (t.drift - 1) / (TUNING_MAX_LEVEL - 1)
  const n = (t.nitro - 1) / (TUNING_MAX_LEVEL - 1)
  return {
    engineForce: 1 + e * 0.55,
    boostForce: 1 + e * 0.45 + n * 0.25,
    topSpeedCap: 1 + e * 0.28,
    flameScale: 1 + e * 0.7 + n * 0.5,
    turboVolume: 1 + e * 1.4,
    frictionSlip: 1 + ti * 0.35,
    restLengthScale: 1 - ti * 0.28,
    maxSteer: 1 + d * 0.4,
    counterSteer: 1 + d * 0.55,
    driftRearSlip: 1 - d * 0.25,
    nitroCapacity: 100 + n * 80,
    nitroDrain: 28 - n * 6,
    nitroRecharge: 8 + n * 14,
    dualStageFlames: t.nitro >= 3,
  }
}

export function emptySetups(): Record<CarId, CarSetup> {
  return {
    starter: defaultSetup(),
    muscle: defaultSetup(),
    super: defaultSetup(),
    hyper: defaultSetup(),
  }
}
