export type CarId = 'starter' | 'muscle' | 'super' | 'hyper'

export type CarDef = {
  id: CarId
  name: string
  classLabel: string
  price: number
  modelUrl: string
  topSpeed: number
  acceleration: number
  driftGrip: number
  description: string
}

/** Dealership fleet — Sketchfab hunt imports */
export const CARS: CarDef[] = [
  {
    id: 'starter',
    name: '911 GT3',
    classLabel: 'Street',
    price: 0,
    modelUrl: '/models/car_starter.glb',
    topSpeed: 295,
    acceleration: 88,
    driftGrip: 80,
    description: 'Porsche 911 GT3 — free starter weapon with race aero.',
  },
  {
    id: 'muscle',
    name: 'C8 Stingray',
    classLabel: 'Muscle',
    price: 45000,
    modelUrl: '/models/car_muscle.glb',
    topSpeed: 305,
    acceleration: 94,
    driftGrip: 72,
    description: 'Corvette C8 Stingray — mid-engine American muscle.',
  },
  {
    id: 'super',
    name: 'GT-R Bunny',
    classLabel: 'JDM',
    price: 95000,
    modelUrl: '/models/car_super.glb',
    topSpeed: 320,
    acceleration: 96,
    driftGrip: 76,
    description: 'Nissan GT-R Rocket Bunny — widebody JDM legend.',
  },
  {
    id: 'hyper',
    name: 'Aventador',
    classLabel: 'Hyper',
    price: 180000,
    modelUrl: '/models/car_hyper.glb',
    topSpeed: 350,
    acceleration: 98,
    driftGrip: 82,
    description: 'Lamborghini Aventador — V12 hypercar apex predator.',
  },
]

export function getCar(id: CarId) {
  return CARS.find((c) => c.id === id) ?? CARS[0]
}
