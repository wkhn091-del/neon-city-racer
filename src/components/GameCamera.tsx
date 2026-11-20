import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'

/**
 * Chase cam inspired by isaac-mason dynamic-raycast-vehicle sketch +
 * pmndrs/racing-game — offset in chassis local space, smoothed.
 */
export function GameCamera({ target }: { target: RefObject<THREE.Vector3> }) {
  const { camera } = useThree()
  const mode = useGameStore((s) => s.camera)
  const look = useRef(new THREE.Vector3())
  const desired = useRef(new THREE.Vector3())
  const smoothedPos = useRef(new THREE.Vector3())
  const smoothedLook = useRef(new THREE.Vector3())
  const offset = useRef(new THREE.Vector3(0, 4.2, -11))
  const lookOffset = useRef(new THREE.Vector3(0, 1.2, 10))
  const started = useRef(false)

  useFrame((_, dt) => {
    if (!target.current) return
    const p = target.current
    const win = window as unknown as {
      __playerQuat?: THREE.Quaternion
      __camPos?: THREE.Vector3
      __camLook?: THREE.Vector3
    }
    const quat = win.__playerQuat ?? new THREE.Quaternion()

    if (mode === 'hood') {
      desired.current.set(0, 1.05, 0.55).applyQuaternion(quat).add(p)
      look.current.set(0, 0.7, 8).applyQuaternion(quat).add(p)
    } else if (mode === 'cinematic') {
      desired.current.set(6, 3.2, -3).applyQuaternion(quat).add(p)
      look.current.copy(p).add(new THREE.Vector3(0, 1.1, 0))
    } else {
      desired.current.copy(offset.current).applyQuaternion(quat).add(p)
      desired.current.y = Math.max(desired.current.y, p.y + 2.2)
      look.current.copy(lookOffset.current).applyQuaternion(quat).add(p)
    }

    const t = 1.0 - Math.pow(0.001, dt)
    if (!started.current) {
      smoothedPos.current.copy(desired.current)
      smoothedLook.current.copy(look.current)
      started.current = true
    } else {
      smoothedPos.current.lerp(desired.current, t)
      smoothedLook.current.lerp(look.current, t)
    }
    camera.position.copy(smoothedPos.current)
    camera.lookAt(smoothedLook.current)
    if (!win.__camPos) win.__camPos = new THREE.Vector3()
    if (!win.__camLook) win.__camLook = new THREE.Vector3()
    win.__camPos.copy(camera.position)
    win.__camLook.copy(smoothedLook.current)
  })

  return null
}
