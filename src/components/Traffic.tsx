import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { getCachedWorldMarkers } from '../world/markerCache'
import { getLaneMarkers } from '../world/markers'
import { getStageWaypoints } from '../track/waypoints'
import type { StageId } from '../store/gameStore'

useGLTF.preload('/models/traffic_sedan.glb')
useGLTF.preload('/models/traffic_suv.glb')

type CarAI = {
  offset: number
  speed: number
  model: 'sedan' | 'suv'
  lane: 'A' | 'B'
}

function lanePoints(stage: StageId, lane: 'A' | 'B'): THREE.Vector3[] {
  const markers = getLaneMarkers(getCachedWorldMarkers(), lane)
  if (markers.length >= 4) return markers.map((m) => m.position.clone())
  // Fallback oval only if empties missing — should not fire for world_map
  return getStageWaypoints(stage)
}

export function Traffic({ stage, playerPos }: { stage: StageId; playerPos: RefObject<THREE.Vector3> }) {
  const sedan = useGLTF('/models/traffic_sedan.glb')
  const suv = useGLTF('/models/traffic_suv.glb')
  const group = useRef<THREE.Group>(null)
  const [ready, setReady] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      if (getCachedWorldMarkers().length >= 20) {
        setReady((n) => n + 1)
        window.clearInterval(id)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [stage])

  const pathA = useMemo(() => lanePoints(stage, 'A'), [stage, ready])
  const pathB = useMemo(() => lanePoints(stage, 'B'), [stage, ready])

  const cars = useMemo<CarAI[]>(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        offset: (i / 8) * Math.max(pathA.length, 8),
        speed: 11 + (i % 3) * 2.5,
        model: (i % 2 === 0 ? 'sedan' : 'suv') as 'sedan' | 'suv',
        lane: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
      })),
    [pathA.length],
  )

  const clones = useMemo(
    () =>
      cars.map((c) => {
        const src = c.model === 'sedan' ? sedan.scene : suv.scene
        const clone = src.clone(true)
        clone.scale.setScalar(1)
        return clone
      }),
    [cars, sedan.scene, suv.scene],
  )

  useFrame((_, dt) => {
    if (!group.current) return
    cars.forEach((car, i) => {
      const path = car.lane === 'A' ? pathA : pathB
      if (path.length < 2) return
      let speed = car.speed
      const idx = Math.floor(car.offset) % path.length
      const a = path[idx]
      const b = path[(idx + 1) % path.length]
      const t = car.offset % 1
      const pos = a.clone().lerp(b, t)

      if (playerPos.current) {
        const d = pos.distanceTo(playerPos.current)
        if (d < 14) speed *= Math.max(0.12, (d - 4) / 10)
      }

      const seg = Math.max(a.distanceTo(b), 0.1)
      car.offset = (car.offset + (speed * dt) / seg) % path.length
      const node = group.current!.children[i]
      if (!node) return
      const idx2 = Math.floor(car.offset) % path.length
      const p0 = path[idx2]
      const p1 = path[(idx2 + 1) % path.length]
      const forward = p1.clone().sub(p0).normalize()
      const p = p0.clone().lerp(p1, car.offset % 1)
      node.position.copy(p)
      node.position.y += 0.2
      node.lookAt(p.clone().add(forward))
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
