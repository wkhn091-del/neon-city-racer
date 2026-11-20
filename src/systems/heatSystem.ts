import * as THREE from 'three'

export const HEAT_MAX = 5
export const ESCAPE_SECONDS = 15
export const RADAR_RADIUS = 48

/** Cash payout for clearing heat at a given star level. */
export function escapePayout(heat: number): number {
  const h = Math.max(1, Math.min(HEAT_MAX, Math.floor(heat)))
  return 3500 * h * h
}

export function copsForHeat(heat: number): number {
  if (heat <= 0) return 0
  if (heat === 1) return 1
  if (heat === 2) return 2
  if (heat === 3) return 3
  if (heat === 4) return 4
  return 5
}

/** Flank offsets relative to player forward/right for boxing. */
export function flankOffset(index: number, total: number): THREE.Vector3 {
  if (total <= 1) return new THREE.Vector3(0, 0, -18)
  const slots = [
    new THREE.Vector3(0, 0, -16),
    new THREE.Vector3(-10, 0, -8),
    new THREE.Vector3(10, 0, -8),
    new THREE.Vector3(-12, 0, 6),
    new THREE.Vector3(12, 0, 6),
  ]
  return slots[index % slots.length].clone()
}
