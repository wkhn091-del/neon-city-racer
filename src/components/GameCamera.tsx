import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'

function PhotoOrbit({ target }: { target: RefObject<THREE.Vector3> }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { gl } = useThree()

  useFrame(() => {
    if (!controls.current || !target.current) return
    controls.current.target.set(target.current.x, target.current.y + 1.05, target.current.z)
    controls.current.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={3}
      maxDistance={22}
      maxPolarAngle={Math.PI * 0.48}
      enableDamping
      dampingFactor={0.08}
      domElement={gl.domElement}
    />
  )
}

/**
 * Dynamic Chase / Close Drift / Hood / Photo orbit.
 */
export function GameCamera({ target }: { target: RefObject<THREE.Vector3> }) {
  const { camera } = useThree()
  const mode = useGameStore((s) => s.camera)
  const drifting = useGameStore((s) => s.isDrifting)
  const look = useRef(new THREE.Vector3())
  const desired = useRef(new THREE.Vector3())
  const smoothedPos = useRef(new THREE.Vector3())
  const smoothedLook = useRef(new THREE.Vector3())
  const offset = useRef(new THREE.Vector3(0, 4.2, -11))
  const lookOffset = useRef(new THREE.Vector3(0, 1.2, 10))
  const driftSide = useRef(1)
  const started = useRef(false)

  useEffect(() => {
    started.current = false
  }, [mode])

  useFrame((_, dt) => {
    if (!target.current) return
    if (mode === 'photo') return

    const p = target.current
    const win = window as unknown as {
      __playerQuat?: THREE.Quaternion
      __camPos?: THREE.Vector3
      __camLook?: THREE.Vector3
      __steer?: number
    }
    const quat = win.__playerQuat ?? new THREE.Quaternion()
    const hitStop = performance.now() < useGameStore.getState().hitStopUntil
    const scaleDt = hitStop ? dt * 0.15 : dt

    if (mode === 'hood') {
      desired.current.set(0, 1.05, 0.55).applyQuaternion(quat).add(p)
      look.current.set(0, 0.7, 8).applyQuaternion(quat).add(p)
    } else if (mode === 'drift') {
      const steer = win.__steer ?? 0
      if (Math.abs(steer) > 0.15) driftSide.current = steer > 0 ? -1 : 1
      const side = drifting ? driftSide.current * 7.5 : driftSide.current * 4.5
      const back = drifting ? -5.5 : -8
      desired.current.set(side, drifting ? 2.4 : 3.2, back).applyQuaternion(quat).add(p)
      desired.current.y = Math.max(desired.current.y, p.y + 1.6)
      look.current.set(0, 0.9, 2).applyQuaternion(quat).add(p)
    } else {
      desired.current.copy(offset.current).applyQuaternion(quat).add(p)
      desired.current.y = Math.max(desired.current.y, p.y + 2.2)
      look.current.copy(lookOffset.current).applyQuaternion(quat).add(p)
    }

    const t = 1.0 - Math.pow(0.001, scaleDt)
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

  if (mode === 'photo') return <PhotoOrbit target={target} />
  return null
}
