import { create } from 'zustand'
import { DEFAULT_STAGE, type StageId } from '../world/stages'
import type { AtmosphereId } from '../world/atmosphere'
import { HEAT_MAX } from '../systems/heatSystem'
import type { RadioStation } from '../audio/CarRadio'

export type GameMode = 'timeattack' | 'freedrift' | 'policechase'
export type CameraMode = 'chase' | 'drift' | 'hood' | 'photo'
export type PhotoFilter = 'none' | 'neon' | 'noir' | 'warm'
export type Screen = 'menu' | 'playing'
export type QualityPreset = 'low' | 'medium' | 'high'
export type PaintId = 'crimson' | 'midnight' | 'pearl' | 'lime'
export type MenuTab = 'circuits' | 'garage' | 'tuning' | 'options'

export type CashPopup = { id: number; text: string; born: number }

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
  radio: RadioStation
  photoFilter: PhotoFilter
  photoDof: boolean
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
  hitStopUntil: number
  cashPopups: CashPopup[]
  setScreen: (screen: Screen) => void
  setMenuTab: (tab: MenuTab) => void
  setStage: (stage: StageId) => void
  setMode: (mode: GameMode) => void
  setPaint: (paint: PaintId) => void
  setQuality: (quality: QualityPreset) => void
  setAtmosphere: (atmosphere: AtmosphereId) => void
  setRadio: (radio: RadioStation) => void
  setCamera: (camera: CameraMode) => void
  setPhotoFilter: (filter: PhotoFilter) => void
  setPhotoDof: (on: boolean) => void
  toggleCamera: () => void
  bumpHeat: (amount?: number) => void
  clearHeat: () => void
  triggerHitStop: (ms?: number) => void
  pushCashPopup: (text: string) => void
  prunePopups: () => void
  setTelemetry: (partial: Partial<GameState>) => void
  resetRun: () => void
  startRace: () => void
}

const cameras: CameraMode[] = ['chase', 'drift', 'hood', 'photo']
let popupSeq = 1

export const PAINT_COLORS: Record<PaintId, string> = {
  crimson: '#8a0610',
  midnight: '#0a1630',
  pearl: '#d8d5cf',
  lime: '#6cff3a',
}

export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'DYNAMIC CHASE',
  drift: 'DRIFT CAM',
  hood: 'HOOD CAM',
  photo: 'PHOTO MODE',
}

export const RADIO_LABELS: { id: RadioStation; label: string }[] = [
  { id: 'off', label: 'OFF' },
  { id: 'phonk', label: 'NIGHT PHONK BASS' },
  { id: 'synthwave', label: 'SYNTHWAVE DRIVE' },
  { id: 'lofi', label: 'LO-FI CRUISE' },
]

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  menuTab: 'circuits',
  stage: DEFAULT_STAGE,
  mode: 'freedrift',
  camera: 'chase',
  paint: 'crimson',
  quality: 'medium',
  atmosphere: 'midnight',
  radio: 'off',
  photoFilter: 'none',
  photoDof: true,
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
  hitStopUntil: 0,
  cashPopups: [],
  setScreen: (screen) => set({ screen }),
  setMenuTab: (menuTab) => set({ menuTab }),
  setStage: (stage) => set({ stage }),
  setMode: (mode) => set({ mode }),
  setPaint: (paint) => set({ paint }),
  setQuality: (quality) => set({ quality }),
  setAtmosphere: (atmosphere) => set({ atmosphere }),
  setRadio: (radio) => set({ radio }),
  setCamera: (camera) => set({ camera }),
  setPhotoFilter: (photoFilter) => set({ photoFilter }),
  setPhotoDof: (photoDof) => set({ photoDof }),
  toggleCamera: () => {
    const i = cameras.indexOf(get().camera)
    set({ camera: cameras[(i + 1) % cameras.length] })
  },
  bumpHeat: (amount = 1) => set({ heat: Math.min(HEAT_MAX, get().heat + amount) }),
  clearHeat: () => set({ heat: 0, heatEscape: 0 }),
  triggerHitStop: (ms = 50) => set({ hitStopUntil: performance.now() + ms }),
  pushCashPopup: (text) =>
    set({
      cashPopups: [...get().cashPopups.slice(-8), { id: popupSeq++, text, born: performance.now() }],
    }),
  prunePopups: () => {
    const now = performance.now()
    set({ cashPopups: get().cashPopups.filter((p) => now - p.born < 2200) })
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
      heat: get().mode === 'policechase' ? 2 : 0,
      heatEscape: 0,
      escapePayout: 0,
      hitStopUntil: 0,
      cashPopups: [],
      camera: 'chase',
    }),
  startRace: () => {
    get().resetRun()
    set({ screen: 'playing' })
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __mode?: GameMode; __heat?: number; __radio?: RadioStation }
      w.__mode = get().mode
      w.__heat = get().heat
      w.__radio = get().radio
    }
  },
}))

if (typeof window !== 'undefined') {
  const w = window as unknown as {
    __mode?: GameMode
    __heat?: number
    __camera?: CameraMode
    __radio?: RadioStation
    __setCamera?: (camera: CameraMode) => void
    __setRadio?: (radio: RadioStation) => void
  }
  w.__setCamera = (camera) => useGameStore.getState().setCamera(camera)
  w.__setRadio = (radio) => useGameStore.getState().setRadio(radio)
  useGameStore.subscribe((s) => {
    w.__mode = s.mode
    w.__heat = s.heat
    w.__camera = s.camera
    w.__radio = s.radio
  })
}
