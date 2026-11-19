import { create } from 'zustand'

export type GameMode = 'timeattack' | 'freedrift'
export type CameraMode = 'chase' | 'hood'

type GameState = {
  speedKmh: number
  rpm: number
  nitro: number
  driftScore: number
  driftMultiplier: number
  isDrifting: boolean
  isBoosting: boolean
  mode: GameMode
  camera: CameraMode
  checkpointIndex: number
  lapTime: number
  bestLap: number
  setTelemetry: (partial: Partial<GameState>) => void
  toggleCamera: () => void
  setMode: (mode: GameMode) => void
  resetRun: () => void
}

export const useGameStore = create<GameState>((set, get) => ({
  speedKmh: 0,
  rpm: 800,
  nitro: 100,
  driftScore: 0,
  driftMultiplier: 1,
  isDrifting: false,
  isBoosting: false,
  mode: 'freedrift',
  camera: 'chase',
  checkpointIndex: 0,
  lapTime: 0,
  bestLap: 0,
  setTelemetry: (partial) => set(partial),
  toggleCamera: () => set({ camera: get().camera === 'chase' ? 'hood' : 'chase' }),
  setMode: (mode) => set({ mode }),
  resetRun: () =>
    set({
      driftScore: 0,
      driftMultiplier: 1,
      checkpointIndex: 0,
      lapTime: 0,
      nitro: 100,
    }),
}))
