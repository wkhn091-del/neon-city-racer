import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getStageDef, type StageId } from '../world/stages'
import { useGameStore } from '../store/gameStore'
import { extractWorldMarkers } from '../world/markers'
import { setWorldMarkers } from '../world/markerCache'

/**
 * Orient → scale → center XZ → drop so asphalt (Spawn_Player / TRACK) sits on y=0.
 * Prefer road meshes over shoreline props so coastal cities don't float the circuit.
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

  // Drop until Spawn_Player / TRACK surface ≈ y=0 (ignore deep water/terrain under city)
  root.updateMatrixWorld(true)
  let roadY = Number.POSITIVE_INFINITY
  root.traverse((obj) => {
    if (/^Spawn_Player$/i.test(obj.name)) {
      const wp = new THREE.Vector3()
      obj.getWorldPosition(wp)
      roadY = Math.min(roadY, wp.y)
    }
    if (obj instanceof THREE.Mesh && /TRACK|Collider_Road|PARKING/i.test(obj.name)) {
      const b = new THREE.Box3().setFromObject(obj)
      if (!b.isEmpty()) roadY = Math.min(roadY, b.min.y)
    }
  })
  if (Number.isFinite(roadY)) {
    root.position.y -= roadY
    root.updateMatrixWorld(true)
  }
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
      // Invisible physics helpers stay in the GLB but must not render
      if (/^Collider_/i.test(obj.name)) {
        obj.visible = false
        return
      }

      // Coastal city import sits inside the circuit after normalize — hide entire dirtroad
      // kit so chase cam isn't trapped in beige interiors. Keep TRACK + barriers only.
      if (/^(dirtroad27_|Plane\.|Cube_)/i.test(obj.name)) {
        obj.visible = false
        return
      }

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
        }
        if ('envMapIntensity' in mat) mat.envMapIntensity = 0.55
        if ('roughness' in mat) mat.roughness = Math.min(Math.max(mat.roughness ?? 0.8, 0.55), 0.95)
        if (mat.color && /TRACK|PARKING|BARRIER/i.test(mesh.name)) {
          // Keep asphalt readable under ACES + HDR
          mat.color.multiplyScalar(0.85)
        }
        mat.needsUpdate = true
        return mat
      })
      mesh.material = out.length === 1 ? out[0] : out
    })

    const markers = extractWorldMarkers(visual)
    setWorldMarkers(markers)
    ;(window as unknown as { __worldMarkers?: typeof markers }).__worldMarkers = markers

    const worldBox = new THREE.Box3().setFromObject(visual)
    return { visual, worldBox, markers }
  }, [scene, def.targetSize, def.rotX, quality])

  const size = prepared.worldBox.getSize(new THREE.Vector3())
  const groundSize = Math.max(160, size.x, size.z) * 1.2

  return (
    <group>
      {/* Explicit cuboid deck — top at y=0 (half-height 0.5 → center -0.5) */}
      <RigidBody type="fixed" colliders={false} position={[0, -0.5, 0]} friction={1.8} restitution={0}>
        <CuboidCollider args={[groundSize / 2, 0.5, groundSize / 2]} friction={1.8} restitution={0} />
      </RigidBody>

      <primitive object={prepared.visual} />
    </group>
  )
}
