import { create } from 'zustand'

export type GameMode = 'timeattack' | 'freedrift'
export type CameraMode = 'chase' | 'hood' | 'cinematic'
export type StageId = 'stage1' | 'stage2'
export type Screen = 'menu' | 'playing'

export type PaintId = 'crimson' | 'midnight' | 'pearl' | 'lime'

type GameState = {
  screen: Screen
  stage: StageId
  mode: GameMode
  camera: CameraMode
  paint: PaintId
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
  setStage: (stage: StageId) => void
  setMode: (mode: GameMode) => void
  setPaint: (paint: PaintId) => void
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
  stage: 'stage1',
  mode: 'freedrift',
  camera: 'chase',
  paint: 'crimson',
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
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  setPaint: (paint) => set({ paint }),
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
