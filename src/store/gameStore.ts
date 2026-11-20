import { create } from 'zustand'
import { DEFAULT_STAGE, type StageId } from '../world/stages'
import type { AtmosphereId } from '../world/atmosphere'
import { HEAT_MAX } from '../systems/heatSystem'

export type GameMode = 'timeattack' | 'freedrift' | 'policechase'
export type CameraMode = 'chase' | 'hood' | 'cinematic'
export type Screen = 'menu' | 'playing'
export type QualityPreset = 'low' | 'medium' | 'high'
export type PaintId = 'crimson' | 'midnight' | 'pearl' | 'lime'
export type MenuTab = 'circuits' | 'garage' | 'tuning' | 'options'

export type { StageId }

type GameState = {
  screen: Screen
  menuTab: MenuTab
  stage: StageId
  mode: GameMode
  camera: CameraMode
  paint: PaintId
  quality: QualityPreset
  atmosphere: AtmosphereId
  speedKmh: number
  rpm: number
  nitro: number
  driftScore: number
  driftMultiplier: number
  isDrifting: boolean
  isBoosting: boolean
  checkpointIndex: number
  lapTime: number
  bestLap: number
  heat: number
  heatEscape: number
  escapePayout: number
  setScreen: (screen: Screen) => void
  setMenuTab: (tab: MenuTab) => void
  setStage: (stage: StageId) => void
  setMode: (mode: GameMode) => void
  setPaint: (paint: PaintId) => void
  setQuality: (quality: QualityPreset) => void
  setAtmosphere: (atmosphere: AtmosphereId) => void
  toggleCamera: () => void
  bumpHeat: (amount?: number) => void
  clearHeat: () => void
  setTelemetry: (partial: Partial<GameState>) => void
  resetRun: () => void
  startRace: () => void
}

const cameras: CameraMode[] = ['chase', 'hood', 'cinematic']

export const PAINT_COLORS: Record<PaintId, string> = {
  crimson: '#8a0610',
  midnight: '#0a1630',
  pearl: '#d8d5cf',
  lime: '#6cff3a',
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  menuTab: 'circuits',
  stage: DEFAULT_STAGE,
  mode: 'freedrift',
  camera: 'chase',
  paint: 'crimson',
  quality: 'medium',
  atmosphere: 'midnight',
  speedKmh: 0,
  rpm: 800,
  nitro: 100,
  driftScore: 0,
  driftMultiplier: 1,
  isDrifting: false,
  isBoosting: false,
  checkpointIndex: 0,
  lapTime: 0,
  bestLap: 0,
  heat: 0,
  heatEscape: 0,
  escapePayout: 0,
  setScreen: (screen) => set({ screen }),
  setMenuTab: (menuTab) => set({ menuTab }),
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  setPaint: (paint) => set({ paint }),
  setQuality: (quality) => set({ quality }),
  setAtmosphere: (atmosphere) => set({ atmosphere }),
  toggleCamera: () => {
    const i = cameras.indexOf(get().camera)
    set({ camera: cameras[(i + 1) % cameras.length] })
  },
  bumpHeat: (amount = 1) => set({ heat: Math.min(HEAT_MAX, get().heat + amount) }),
  clearHeat: () => set({ heat: 0, heatEscape: 0 }),
  setTelemetry: (partial) => set(partial),
  resetRun: () =>
    set({
      driftScore: 0,
      driftMultiplier: 1,
      checkpointIndex: 0,
      lapTime: 0,
      nitro: 100,
      speedKmh: 0,
      rpm: 800,
      isDrifting: false,
      isBoosting: false,
      heat: get().mode === 'policechase' ? 2 : 0,
      heatEscape: 0,
      escapePayout: 0,
    }),
  startRace: () => {
    get().resetRun()
    set({ screen: 'playing' })
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __mode?: GameMode; __heat?: number }
      w.__mode = get().mode
      w.__heat = get().heat
    }
  },
}))

if (typeof window !== 'undefined') {
  useGameStore.subscribe((s) => {
    const w = window as unknown as { __mode?: GameMode; __heat?: number }
    w.__mode = s.mode
    w.__heat = s.heat
  })
}
