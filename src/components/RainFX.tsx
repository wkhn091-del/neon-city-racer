import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'
import { getAtmosphere } from '../world/atmosphere'

const COUNT = 900

/** GPU-instanced rain streaks that follow the camera. */
export function RainFX() {
  const atmosphere = useGameStore((s) => s.atmosphere)
  const active = getAtmosphere(atmosphere).rain
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const { camera } = useThree()
  const drops = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 28,
        z: (Math.random() - 0.5) * 40,
        v: 18 + Math.random() * 22,
      })),
    [],
  )

  useFrame((_, dt) => {
    if (!mesh.current || !active) {
      if (mesh.current) mesh.current.count = 0
      return
    }
    const origin = camera.position
    for (let i = 0; i < COUNT; i++) {
      const d = drops[i]
      d.y -= d.v * dt
      if (d.y < -2) {
        d.y = 14 + Math.random() * 12
        d.x = (Math.random() - 0.5) * 40
        d.z = (Math.random() - 0.5) * 40
      }
      dummy.position.set(origin.x + d.x, origin.y + d.y, origin.z + d.z)
      dummy.scale.set(0.02, 0.55 + Math.random() * 0.35, 0.02)
      dummy.rotation.set(0.15, 0, 0.05)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.count = COUNT
    mesh.current.instanceMatrix.needsUpdate = true
  })

  if (!active) return null

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#a8c4e0" transparent opacity={0.35} depthWrite={false} />
    </instancedMesh>
  )
}
