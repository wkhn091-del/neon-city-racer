import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { getStageWaypoints } from '../track/waypoints'
import type { StageId } from '../store/gameStore'

useGLTF.preload('/models/pedestrian.glb')

export function Pedestrians({ stage }: { stage: StageId }) {
  const { scene, animations } = useGLTF('/models/pedestrian.glb')
  const waypoints = useMemo(() => getStageWaypoints(stage), [stage])

  const people = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const clone = scene.clone(true)
      const idx = Math.floor((i / 6) * waypoints.length)
      const p = waypoints[idx]
      const next = waypoints[(idx + 3) % waypoints.length]
      const dir = next.clone().sub(p).normalize()
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      const pos = p.clone().add(side.multiplyScalar(11 + (i % 2) * 1.5))
      return { clone, pos, dir: side.clone().multiplyScalar(i % 2 === 0 ? 1 : -1), phase: i * 0.7 }
    })
  }, [scene, waypoints])

  return (
    <group>
      {people.map((p, i) => (
        <PedOne key={i} object={p.clone} base={p.pos} phase={p.phase} animations={animations} />
      ))}
    </group>
  )
}

function PedOne({
  object,
  base,
  phase,
  animations,
}: {
  object: THREE.Object3D
  base: THREE.Vector3
  phase: number
  animations: THREE.AnimationClip[]
}) {
  const ref = useRef<THREE.Group>(null)
  const { actions, names } = useAnimations(animations, ref)

  useEffect(() => {
    const name = names[0]
    if (name && actions[name]) {
      actions[name]!.reset().fadeIn(0.2).play()
      actions[name]!.setLoop(THREE.LoopRepeat, Infinity)
    }
  }, [actions, names])

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime + phase
    ref.current.position.set(base.x + Math.sin(t * 0.4) * 2.5, base.y, base.z + Math.cos(t * 0.35) * 2.5)
    ref.current.rotation.y = t * 0.4
  })

  return (
    <group ref={ref} scale={1.05}>
      <primitive object={object} />
    </group>
  )
}
