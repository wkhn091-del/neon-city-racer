import * as THREE from 'three'

/**
 * Spatial markers authored as Blender Empties inside world_map.glb.
 * Runtime NEVER invents spawn/lane coordinates — only parses these nodes.
 */

export type MarkerKind = 'spawn' | 'trafficA' | 'trafficB' | 'pedestrian' | 'dealership'

export type WorldMarker = {
  name: string
  kind: MarkerKind
  index: number
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  /** Lane forward in XZ (derived from Empty +Z after glTF / or local −Y Blender → +Z). */
  forward: THREE.Vector3
}

const RE = {
  spawn: /^Spawn_Player$/,
  trafficA: /^Traffic_Lane_A_(\d{2})$/,
  trafficB: /^Traffic_Lane_B_(\d{2})$/,
  ped: /^Pedestrian_Path_(\d{2})$/,
  dealer: /^Dealership_Spot_(\d{2})$/,
}

function kindOf(name: string): { kind: MarkerKind; index: number } | null {
  if (RE.spawn.test(name)) return { kind: 'spawn', index: 0 }
  let m = name.match(RE.trafficA)
  if (m) return { kind: 'trafficA', index: Number(m[1]) }
  m = name.match(RE.trafficB)
  if (m) return { kind: 'trafficB', index: Number(m[1]) }
  m = name.match(RE.ped)
  if (m) return { kind: 'pedestrian', index: Number(m[1]) }
  m = name.match(RE.dealer)
  if (m) return { kind: 'dealership', index: Number(m[1]) }
  return null
}

/** Extract Empties / marker nodes from a loaded world GLTF scene graph. */
export function extractWorldMarkers(root: THREE.Object3D): WorldMarker[] {
  root.updateMatrixWorld(true)
  const markers: WorldMarker[] = []
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const forward = new THREE.Vector3()

  root.traverse((obj) => {
    const meta = kindOf(obj.name)
    if (!meta) return
    obj.getWorldPosition(pos)
    obj.getWorldQuaternion(quat)
    // glTF: local +Z is forward after our Blender Empty basis (local −Y → +Z)
    forward.set(0, 0, 1).applyQuaternion(quat)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1)
    else forward.normalize()

    markers.push({
      name: obj.name,
      kind: meta.kind,
      index: meta.index,
      position: pos.clone(),
      quaternion: quat.clone(),
      forward: forward.clone(),
    })
    // Hide authoring empties in game view
    obj.visible = false
  })

  markers.sort((a, b) => a.name.localeCompare(b.name))
  return markers
}

export function getSpawnMarker(markers: WorldMarker[]): WorldMarker | undefined {
  return markers.find((m) => m.kind === 'spawn') ?? markers.find((m) => m.kind === 'trafficA')
}

export function getLaneMarkers(markers: WorldMarker[], lane: 'A' | 'B'): WorldMarker[] {
  const kind = lane === 'A' ? 'trafficA' : 'trafficB'
  return markers.filter((m) => m.kind === kind).sort((a, b) => a.index - b.index)
}

export function getPedestrianMarkers(markers: WorldMarker[]): WorldMarker[] {
  return markers.filter((m) => m.kind === 'pedestrian').sort((a, b) => a.index - b.index)
}

export function getDealershipMarkers(markers: WorldMarker[]): WorldMarker[] {
  return markers.filter((m) => m.kind === 'dealership').sort((a, b) => a.index - b.index)
}
