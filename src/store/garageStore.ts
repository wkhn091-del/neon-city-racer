import { create } from 'zustand'
import { CARS, type CarId } from '../garage/cars'
import {
  emptySetups,
  sanitizeSetup,
  TUNING_MAX_LEVEL,
  upgradeCost,
  type CarSetup,
  type CarVisuals,
  type PaintFinish,
  type TuningStat,
  type UnderglowId,
} from '../garage/tuning'

const STORAGE_KEY = 'neon-city-racer-garage-v3'
const VALID = new Set(CARS.map((c) => c.id))

type Persisted = {
  cash: number
  owned: CarId[]
  activeCar: CarId
  setups: Record<CarId, CarSetup>
}

function sanitizeSetups(raw: Partial<Record<CarId, Partial<CarSetup>>> | undefined): Record<CarId, CarSetup> {
  const base = emptySetups()
  if (!raw) return base
  for (const id of Object.keys(base) as CarId[]) {
    base[id] = sanitizeSetup(raw[id])
  }
  return base
}

function sanitize(parsed: Partial<Persisted>): Persisted {
  const owned = (parsed.owned ?? ['starter']).filter((id): id is CarId => VALID.has(id as CarId))
  if (!owned.includes('starter')) owned.unshift('starter')
  let activeCar = parsed.activeCar as CarId
  if (!VALID.has(activeCar) || !owned.includes(activeCar)) activeCar = 'starter'
  const cash = typeof parsed.cash === 'number' ? parsed.cash : 8000
  return { cash, owned, activeCar, setups: sanitizeSetups(parsed.setups) }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Migrate cash/owned from v2 if present
      const v2 = localStorage.getItem('neon-city-racer-garage-v2')
      if (v2) {
        const old = JSON.parse(v2) as Partial<Persisted>
        return sanitize({ ...old, setups: emptySetups() })
      }
      throw new Error('empty')
    }
    return sanitize(JSON.parse(raw) as Partial<Persisted>)
  } catch {
    return { cash: 8000, owned: ['starter'], activeCar: 'starter', setups: emptySetups() }
  }
}

function save(state: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function persistSlice(get: () => GarageState): Persisted {
  return {
    cash: get().cash,
    owned: get().owned,
    activeCar: get().activeCar,
    setups: get().setups,
  }
}

type GarageState = Persisted & {
  previewCar: CarId
  setPreviewCar: (id: CarId) => void
  selectActiveCar: (id: CarId) => void
  buyCar: (id: CarId) => { ok: boolean; reason?: string }
  addCash: (amount: number) => void
  owns: (id: CarId) => boolean
  getSetup: (id?: CarId) => CarSetup
  upgradeStat: (carId: CarId, stat: TuningStat) => { ok: boolean; reason?: string }
  setFinish: (carId: CarId, finish: PaintFinish) => void
  setUnderglow: (carId: CarId, underglow: UnderglowId) => void
  setRimHue: (carId: CarId, rimHue: number) => void
  setWindowTint: (carId: CarId, windowTint: number) => void
  patchVisuals: (carId: CarId, patch: Partial<CarVisuals>) => void
}

export const useGarageStore = create<GarageState>((set, get) => {
  const initial =
    typeof window !== 'undefined'
      ? load()
      : { cash: 8000, owned: ['starter' as CarId], activeCar: 'starter' as CarId, setups: emptySetups() }
  return {
    ...initial,
    previewCar: initial.activeCar,
    setPreviewCar: (id) => set({ previewCar: id }),
    selectActiveCar: (id) => {
      if (!get().owned.includes(id)) return
      const next = persistSlice(get)
      next.activeCar = id
      save(next)
      set({ ...next, previewCar: id })
    },
    buyCar: (id) => {
      const car = CARS.find((c) => c.id === id)
      if (!car) return { ok: false, reason: 'Unknown car' }
      const { cash, owned, activeCar, setups } = get()
      if (owned.includes(id)) return { ok: false, reason: 'Already owned' }
      if (cash < car.price) return { ok: false, reason: 'Not enough cash' }
      const next: Persisted = {
        cash: cash - car.price,
        owned: [...owned, id],
        activeCar,
        setups,
      }
      save(next)
      set({ ...next, previewCar: id })
      return { ok: true }
    },
    addCash: (amount) => {
      const next = persistSlice(get)
      next.cash = Math.max(0, Math.floor(next.cash + amount))
      save(next)
      set(next)
    },
    owns: (id) => get().owned.includes(id),
    getSetup: (id) => {
      const carId = id ?? get().previewCar
      return get().setups[carId] ?? sanitizeSetup(undefined)
    },
    upgradeStat: (carId, stat) => {
      if (!get().owned.includes(carId)) return { ok: false, reason: 'Own the car first' }
      const setups = { ...get().setups }
      const setup = { ...sanitizeSetup(setups[carId]) }
      const level = setup[stat]
      if (level >= TUNING_MAX_LEVEL) return { ok: false, reason: 'Maxed' }
      const cost = upgradeCost(stat, level)
      if (get().cash < cost) return { ok: false, reason: 'Not enough cash' }
      setup[stat] = level + 1
      setups[carId] = setup
      const next: Persisted = {
        cash: get().cash - cost,
        owned: get().owned,
        activeCar: get().activeCar,
        setups,
      }
      save(next)
      set(next)
      return { ok: true }
    },
    setFinish: (carId, finish) => get().patchVisuals(carId, { finish }),
    setUnderglow: (carId, underglow) => get().patchVisuals(carId, { underglow }),
    setRimHue: (carId, rimHue) => get().patchVisuals(carId, { rimHue }),
    setWindowTint: (carId, windowTint) => get().patchVisuals(carId, { windowTint }),
    patchVisuals: (carId, patch) => {
      const setups = { ...get().setups }
      setups[carId] = sanitizeSetup({ ...setups[carId], ...patch })
      const next = { ...persistSlice(get), setups }
      save(next)
      set(next)
    },
  }
})
