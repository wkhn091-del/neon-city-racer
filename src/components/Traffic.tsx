import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { getStageWaypoints } from '../track/waypoints'
import type { StageId } from '../store/gameStore'

useGLTF.preload('/models/traffic_sedan.glb')
useGLTF.preload('/models/traffic_suv.glb')

type CarAI = {
  offset: number
  speed: number
  model: 'sedan' | 'suv'
  lane: number
}

export function Traffic({ stage, playerPos }: { stage: StageId; playerPos: RefObject<THREE.Vector3> }) {
  const sedan = useGLTF('/models/traffic_sedan.glb')
  const suv = useGLTF('/models/traffic_suv.glb')
  const waypoints = useMemo(() => getStageWaypoints(stage), [stage])
  const group = useRef<THREE.Group>(null)

  const cars = useMemo<CarAI[]>(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        offset: (i / 8) * waypoints.length,
        speed: 12 + (i % 3) * 3,
        model: i % 2 === 0 ? 'sedan' : 'suv',
        lane: i % 2 === 0 ? -2.2 : 2.2,
      })),
    [waypoints.length],
  )

  const clones = useMemo(
    () =>
      cars.map((c) => {
        const src = c.model === 'sedan' ? sedan.scene : suv.scene
        return src.clone(true)
      }),
    [cars, sedan.scene, suv.scene],
  )

  useFrame((_, dt) => {
    if (!group.current) return
    cars.forEach((car, i) => {
      let speed = car.speed
      const idx = Math.floor(car.offset) % waypoints.length
      const a = waypoints[idx]
      const b = waypoints[(idx + 1) % waypoints.length]
      const dir = b.clone().sub(a).normalize()
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      const pos = a.clone().add(right.multiplyScalar(car.lane))

      if (playerPos.current) {
        const d = pos.distanceTo(playerPos.current)
        if (d < 14) speed *= Math.max(0.15, (d - 4) / 10)
      }

      car.offset = (car.offset + (speed * dt) / Math.max(a.distanceTo(b), 0.1)) % waypoints.length
      const node = group.current!.children[i]
      if (!node) return
      const t = car.offset % 1
      const idx2 = Math.floor(car.offset) % waypoints.length
      const p0 = waypoints[idx2]
      const p1 = waypoints[(idx2 + 1) % waypoints.length]
      const forward = p1.clone().sub(p0).normalize()
      const side = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      const p = p0.clone().lerp(p1, t).add(side.multiplyScalar(car.lane))
      node.position.copy(p)
      node.position.y += 0.35
      const look = p.clone().add(forward)
      node.lookAt(look)
    })
  })

  return (
    <group ref={group}>
      {clones.map((c, i) => (
        <primitive key={i} object={c} />
      ))}
    </group>
  )
}
