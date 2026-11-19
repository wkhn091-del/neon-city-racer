import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'

export function GameCamera({ target }: { target: RefObject<THREE.Vector3> }) {
  const { camera } = useThree()
  const mode = useGameStore((s) => s.camera)
  const look = useRef(new THREE.Vector3())
  const desired = useRef(new THREE.Vector3())
  const vel = useRef(new THREE.Vector3())
  const last = useRef(new THREE.Vector3())

  useFrame((_, dt) => {
    if (!target.current) return
    const p = target.current
    vel.current.copy(p).sub(last.current).multiplyScalar(1 / Math.max(dt, 1 / 60))
    last.current.copy(p)
    const forward = vel.current.lengthSq() > 0.5 ? vel.current.clone().normalize() : new THREE.Vector3(0, 0, 1)
    forward.y = 0
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1)
    forward.normalize()

    if (mode === 'hood') {
      desired.current.copy(p).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(forward, 0.6)
      look.current.copy(p).addScaledVector(forward, 8).add(new THREE.Vector3(0, 0.6, 0))
    } else if (mode === 'cinematic') {
      const side = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      desired.current
        .copy(p)
        .addScaledVector(side, 6)
        .add(new THREE.Vector3(0, 3.5, 0))
        .addScaledVector(forward, -4)
      look.current.copy(p).add(new THREE.Vector3(0, 1, 0))
    } else {
      desired.current
        .copy(p)
        .addScaledVector(forward, -8.5)
        .add(new THREE.Vector3(0, 3.2, 0))
      look.current.copy(p).addScaledVector(forward, 6).add(new THREE.Vector3(0, 1.2, 0))
    }

    camera.position.lerp(desired.current, 1 - Math.pow(0.001, dt))
    camera.lookAt(look.current)
  })

  return null
}
