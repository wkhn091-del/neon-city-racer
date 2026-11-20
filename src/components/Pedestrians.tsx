import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { getCachedWorldMarkers } from '../world/markerCache'
import { getPedestrianMarkers } from '../world/markers'

useGLTF.preload('/models/pedestrian.glb')

export function Pedestrians() {
  const { scene, animations } = useGLTF('/models/pedestrian.glb')
  const [ready, setReady] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      if (getPedestrianMarkers(getCachedWorldMarkers()).length > 0) {
        setReady((n) => n + 1)
        window.clearInterval(id)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const people = useMemo(() => {
    const markers = getPedestrianMarkers(getCachedWorldMarkers())
    const slots = markers.length > 0 ? markers.slice(0, 10) : []
    return slots.map((m, i) => {
      const clone = SkeletonUtils.clone(scene) as THREE.Object3D
      return {
        clone,
        pos: m.position.clone(),
        phase: i * 0.7,
      }
    })
  }, [scene, ready])

  if (people.length === 0) return null

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
    const walk = names.find((n) => /walk/i.test(n)) ?? names[0]
    if (walk && actions[walk]) {
      actions[walk]!.reset().fadeIn(0.2).play()
      actions[walk]!.setLoop(THREE.LoopRepeat, Infinity)
    }
  }, [actions, names])

  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime + phase
    ref.current.position.set(base.x + Math.sin(t * 0.4) * 1.2, base.y, base.z + Math.cos(t * 0.35) * 1.2)
    ref.current.rotation.y = t * 0.35
  })

  return (
    <group ref={ref} scale={1.05}>
      <primitive object={object} />
    </group>
  )
}
