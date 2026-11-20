import { create } from 'zustand'
import { DEFAULT_STAGE, type StageId } from '../world/stages'

export type GameMode = 'timeattack' | 'freedrift'
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
  setScreen: (screen: Screen) => void
  setMenuTab: (tab: MenuTab) => void
  setStage: (stage: StageId) => void
  setMode: (mode: GameMode) => void
  setPaint: (paint: PaintId) => void
  setQuality: (quality: QualityPreset) => void
  toggleCamera: () => void
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
  setScreen: (screen) => set({ screen }),
  setMenuTab: (menuTab) => set({ menuTab }),
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  setPaint: (paint) => set({ paint }),
  setQuality: (quality) => set({ quality }),
  toggleCamera: () => {
    const i = cameras.indexOf(get().camera)
    set({ camera: cameras[(i + 1) % cameras.length] })
  },
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
    }),
  startRace: () => {
    get().resetRun()
    set({ screen: 'playing' })
  },
}))
