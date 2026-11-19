import * as THREE from 'three'

/** Parametric centerline matching Blender stage generators (Y-up after glTF). */
export function stage1Waypoints(count = 120): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const x = Math.cos(t) * 62 + 8 * Math.cos(2 * t)
    const z = Math.sin(t) * 42 + 6 * Math.sin(3 * t)
    const y = 0.8 * Math.sin(2 * t) + 0.4 * Math.cos(3 * t) + 0.5
    pts.push(new THREE.Vector3(x, y, z))
  }
  return pts
}

export function stage2Waypoints(count = 160): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const start = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < count; i++) {
    const t = i / count
    const progress = t * Math.PI * 2 * 1.5
    let x = Math.sin(progress) * 48 + Math.sin(progress * 2.2) * 18
    const z = t * 220 - 110
    const y = 18 * Math.sin(t * Math.PI) + 4 * Math.sin(t * Math.PI * 4) + 0.5
    if ((t > 0.28 && t < 0.38) || (t > 0.62 && t < 0.72)) {
      x += Math.sin((t - 0.28) * 40) * 12
    }
    if (i === 0) {
      start.x = x
      start.y = y
      start.z = z
    }
    // Match Blender root offset that grounded start at origin
    pts.push(new THREE.Vector3(x - start.x, y - start.y + 0.5, z - start.z))
  }
  return pts
}

export function getStageWaypoints(stage: 'stage1' | 'stage2') {
  return stage === 'stage1' ? stage1Waypoints() : stage2Waypoints()
}

export function nearestWaypointIndex(pos: THREE.Vector3, waypoints: THREE.Vector3[]) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < waypoints.length; i++) {
    const d = pos.distanceToSquared(waypoints[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
