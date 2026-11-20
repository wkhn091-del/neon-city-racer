import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getStageDef, type StageId } from '../world/stages'
import { useGameStore } from '../store/gameStore'
import { extractWorldMarkers } from '../world/markers'
import { setWorldMarkers } from '../world/markerCache'

/**
 * Orient → scale → center XZ → sit tires/roads on y=0.
 * Burnout maps need rotX=π or they render upside-down in the sky.
 */
function normalizeWorld(root: THREE.Object3D, targetSize: number, rotX: number) {
  if (rotX !== 0) {
    root.rotation.x = rotX
    root.updateMatrixWorld(true)
  }

  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.z, 0.001)
  root.scale.multiplyScalar(targetSize / longest)
  root.updateMatrixWorld(true)

  const box2 = new THREE.Box3().setFromObject(root)
  const c2 = box2.getCenter(new THREE.Vector3())
  root.position.x -= c2.x
  root.position.z -= c2.z
  root.position.y -= box2.min.y
  root.updateMatrixWorld(true)
}

export function Stage({ stage }: { stage: StageId }) {
  const def = getStageDef(stage)
  const quality = useGameStore((s) => s.quality)
  const { scene } = useGLTF(def.modelUrl)

  const prepared = useMemo(() => {
    const visual = scene.clone(true)
    normalizeWorld(visual, def.targetSize, def.rotX)

    let meshIndex = 0
    visual.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      meshIndex++
      mesh.castShadow = quality === 'high' && meshIndex % 10 === 0
      mesh.receiveShadow = quality !== 'low'
      mesh.frustumCulled = true

      const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const out = srcMats.map((m) => {
        const src = m as THREE.MeshStandardMaterial
        const mat = src.clone()
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace
          mat.map.anisotropy = 4
          mat.map.needsUpdate = true
          // Photogrammetry night tiles read dark — lift via emissive map
          if ('emissiveMap' in mat) {
            mat.emissiveMap = mat.map
            mat.emissive = new THREE.Color('#ffffff')
            mat.emissiveIntensity = 0.55
          }
        }
        if (mat.color) mat.color.set('#ffffff')
        if ('envMapIntensity' in mat) mat.envMapIntensity = 1.6
        if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 1, 0.92)
        mat.needsUpdate = true
        return mat
      })
      mesh.material = out.length === 1 ? out[0] : out
    })

    let markers = extractWorldMarkers(visual)
    // Prefer a near-center spawn so chase cam isn't staring off the photogrammetry tile
    const spawn = markers.find((m) => m.kind === 'spawn')
    if (spawn) {
      const dist = Math.hypot(spawn.position.x, spawn.position.z)
      if (dist > 120) {
        const better =
          markers
            .filter((m) => m.kind === 'trafficA' || m.kind === 'dealership')
            .sort((a, b) => Math.hypot(a.position.x, a.position.z) - Math.hypot(b.position.x, b.position.z))[0] ?? spawn
        spawn.position.copy(better.position)
        spawn.quaternion.copy(better.quaternion)
        spawn.forward.copy(better.forward)
      }
    }
    setWorldMarkers(markers)
    ;(window as unknown as { __worldMarkers?: typeof markers }).__worldMarkers = markers

    const worldBox = new THREE.Box3().setFromObject(visual)
    return { visual, worldBox, markers }
  }, [scene, def.targetSize, def.rotX, quality])

  const size = prepared.worldBox.getSize(new THREE.Vector3())
  const groundSize = Math.max(160, size.x, size.z) * 1.2
  const { rx, rz } = def.track
  const ringOuter = Math.max(rx, rz) * 1.15
  const ringInner = Math.min(rx, rz) * 0.62

  return (
    <group>
      {/* Driveable deck ONLY — no inverted trimesh colliders that bounce the car */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -0.35, 0]} friction={1.6} restitution={0}>
        <mesh visible={false}>
          <boxGeometry args={[groundSize, 0.7, groundSize]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* Subtle road ring under the circuit (visual cue, not the whole void disc) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <ringGeometry args={[ringInner, ringOuter, 72]} />
        <meshStandardMaterial color="#3d4450" roughness={0.9} metalness={0.06} />
      </mesh>

      <primitive object={prepared.visual} />
    </group>
  )
}
