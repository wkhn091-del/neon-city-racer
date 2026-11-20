import * as THREE from 'three'
import { getStageDef, type StageId } from '../world/stages'
import { getLaneMarkers, getSpawnMarker } from '../world/markers'
import { getCachedWorldMarkers } from '../world/markerCache'

function oval(cx: number, cz: number, rx: number, rz: number, y: number, count: number) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    pts.push(new THREE.Vector3(cx + Math.cos(t) * rx, y, cz - Math.sin(t) * rz))
  }
  return pts
}

/** Prefer Blender Empty markers from world_map; fall back to catalog oval. */
export function getStageWaypoints(stage: StageId, count = 160): THREE.Vector3[] {
  const markers = getCachedWorldMarkers()
  if (markers.length > 0) {
    const spawn = getSpawnMarker(markers)
    const laneA = getLaneMarkers(markers, 'A')
    const laneB = getLaneMarkers(markers, 'B')
    const lane = [...laneA, ...laneB]
    if (spawn) {
      // Always start the path at the Blender Empty spawn
      if (lane.length >= 2) {
        const pts: THREE.Vector3[] = [spawn.position.clone()]
        for (let i = 1; i < count; i++) {
          const f = ((i - 1) / (count - 1)) * lane.length
          const i0 = Math.floor(f) % lane.length
          const i1 = (i0 + 1) % lane.length
          const t = f - Math.floor(f)
          pts.push(new THREE.Vector3().lerpVectors(lane[i0].position, lane[i1].position, t))
        }
        return pts
      }
      const { track } = getStageDef(stage)
      return oval(spawn.position.x, spawn.position.z, track.rx * 0.35, track.rz * 0.35, spawn.position.y, count)
    }
  }
  const { track } = getStageDef(stage)
  return oval(track.cx, track.cz, track.rx, track.rz, track.y, count)
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
