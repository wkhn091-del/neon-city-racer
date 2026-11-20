import { create } from 'zustand'
import { CARS, type CarId } from '../garage/cars'

const STORAGE_KEY = 'neon-city-racer-garage-v2'
const VALID = new Set(CARS.map((c) => c.id))

type Persisted = {
  cash: number
  owned: CarId[]
  activeCar: CarId
}

function sanitize(parsed: Partial<Persisted>): Persisted {
  const owned = (parsed.owned ?? ['starter']).filter((id): id is CarId => VALID.has(id as CarId))
  if (!owned.includes('starter')) owned.unshift('starter')
  let activeCar = parsed.activeCar as CarId
  if (!VALID.has(activeCar) || !owned.includes(activeCar)) activeCar = 'starter'
  const cash = typeof parsed.cash === 'number' ? parsed.cash : 8000
  return { cash, owned, activeCar }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('empty')
    return sanitize(JSON.parse(raw) as Persisted)
  } catch {
    return { cash: 8000, owned: ['starter'], activeCar: 'starter' }
  }
}

function save(state: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

type GarageState = Persisted & {
  previewCar: CarId
  setPreviewCar: (id: CarId) => void
  selectActiveCar: (id: CarId) => void
  buyCar: (id: CarId) => { ok: boolean; reason?: string }
  addCash: (amount: number) => void
  owns: (id: CarId) => boolean
}

export const useGarageStore = create<GarageState>((set, get) => {
  const initial =
    typeof window !== 'undefined' ? load() : { cash: 8000, owned: ['starter' as CarId], activeCar: 'starter' as CarId }
  return {
    ...initial,
    previewCar: initial.activeCar,
    setPreviewCar: (id) => set({ previewCar: id }),
    selectActiveCar: (id) => {
      if (!get().owned.includes(id)) return
      const next = { cash: get().cash, owned: get().owned, activeCar: id }
      save(next)
      set({ ...next, previewCar: id })
    },
    buyCar: (id) => {
      const car = CARS.find((c) => c.id === id)
      if (!car) return { ok: false, reason: 'Unknown car' }
      const { cash, owned, activeCar } = get()
      if (owned.includes(id)) return { ok: false, reason: 'Already owned' }
      if (cash < car.price) return { ok: false, reason: 'Not enough cash' }
      const next = {
        cash: cash - car.price,
        owned: [...owned, id],
        activeCar,
      }
      save(next)
      set({ ...next, previewCar: id })
      return { ok: true }
    },
    addCash: (amount) => {
      const next = {
        cash: Math.max(0, Math.floor(get().cash + amount)),
        owned: get().owned,
        activeCar: get().activeCar,
      }
      save(next)
      set(next)
    },
    owns: (id) => get().owned.includes(id),
  }
})
