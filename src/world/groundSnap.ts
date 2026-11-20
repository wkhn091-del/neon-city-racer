import * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import type { WorldMarker } from './markers'

export type SnapPose = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  surfaceY: number
  hit: boolean
}

type RapierLike = {
  Ray: new (origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }) => unknown
}

type WorldLike = {
  castRay: (
    ray: unknown,
    maxToi: number,
    solid: boolean,
    filterFlags?: unknown,
    filterGroups?: unknown,
    filterExcludeCollider?: unknown,
    filterExcludeRigidBody?: RapierRigidBody | undefined,
  ) => { timeOfImpact: number } | null
}

/**
 * AAA ground-snap (Context7 / Rapier castRay):
 * origin = marker + (0,3,0), dir = (0,-1,0), exclude self body.
 * spawnY = surfaceY + hoverHeight (wheelRadius + restLength).
 */
export function snapToGround(
  rapier: RapierLike,
  world: WorldLike,
  marker: WorldMarker,
  hoverHeight: number,
  exclude?: RapierRigidBody | null,
  maxDrop = 16,
): SnapPose {
  const origin = {
    x: marker.position.x,
    y: marker.position.y + 3,
    z: marker.position.z,
  }
  const ray = new rapier.Ray(origin, { x: 0, y: -1, z: 0 })
  const hit = world.castRay(ray, maxDrop, true, undefined, undefined, undefined, exclude ?? undefined)

  let surfaceY = marker.position.y
  let didHit = false
  if (hit) {
    surfaceY = origin.y - hit.timeOfImpact
    didHit = true
  }

  return {
    position: new THREE.Vector3(marker.position.x, surfaceY + hoverHeight, marker.position.z),
    quaternion: marker.quaternion.clone(),
    surfaceY,
    hit: didHit,
  }
}

/** Normalized cars: tires at Y=0, suspension rest ≈ 0.28–0.35 m above surface. */
export const DEFAULT_CAR_HOVER = 0.32
export const DEFAULT_PED_HOVER = 0.02
