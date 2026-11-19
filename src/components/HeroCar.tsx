import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import {
  DEFAULT_WHEELS,
  VehicleController,
  type WheelId,
} from '../physics/VehicleController'
import { useKeyboard } from '../hooks/useKeyboard'
import { PAINT_COLORS, useGameStore } from '../store/gameStore'
import { EngineAudio } from '../audio/EngineAudio'
import { getStageWaypoints, nearestWaypointIndex } from '../track/waypoints'

useGLTF.preload('/models/hero_car.glb')

type Skid = { pos: THREE.Vector3; life: number }

export function HeroCar() {
  const { scene } = useGLTF('/models/hero_car.glb')
  const body = useRef<RapierRigidBody>(null)
  const group = useRef<THREE.Group>(null)
  const keys = useKeyboard()
  const controller = useMemo(() => new VehicleController(), [])
  const audio = useMemo(() => new EngineAudio(), [])
  const { rapier, world } = useRapier()
  const paint = useGameStore((s) => s.paint)
  const stage = useGameStore((s) => s.stage)
  const mode = useGameStore((s) => s.mode)
  const setTelemetry = useGameStore((s) => s.setTelemetry)
  const toggleCamera = useGameStore((s) => s.toggleCamera)
  const skids = useRef<Skid[]>([])
  const skidMesh = useRef<THREE.InstancedMesh>(null)
  const smokeMesh = useRef<THREE.InstancedMesh>(null)
  const wheelNodes = useRef<Partial<Record<WheelId, THREE.Object3D>>>({})
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const flameRefs = useRef<THREE.Mesh[]>([])

  const car = useMemo(() => {
    const c = scene.clone(true)
    const wheels: Partial<Record<WheelId, THREE.Object3D>> = {}
    c.traverse((obj) => {
      const name = obj.name
      ;(['FL', 'FR', 'RL', 'RR'] as WheelId[]).forEach((id) => {
        if (name === `Wheel_${id}` || name.startsWith(`Wheel_${id}`)) {
          // Prefer empty/parent named exactly Wheel_XX
          if (name === `Wheel_${id}` || !wheels[id]) wheels[id] = obj
        }
      })
    })
    // If only tire/rim children exist, parent them under synthetic pivots
    ;(['FL', 'FR', 'RL', 'RR'] as WheelId[]).forEach((id) => {
      if (!wheels[id]) {
        const parts: THREE.Object3D[] = []
        c.traverse((o) => {
          if (o.name.startsWith(`Wheel_${id}`)) parts.push(o)
        })
        if (parts.length) {
          const pivot = new THREE.Group()
          pivot.name = `Wheel_${id}`
          const cfg = DEFAULT_WHEELS.find((w) => w.id === id)!
          pivot.position.copy(cfg.localPosition)
          c.add(pivot)
          parts.forEach((p) => {
            const worldPos = p.getWorldPosition(new THREE.Vector3())
            p.parent?.remove(p)
            pivot.add(p)
            p.position.copy(pivot.worldToLocal(worldPos))
          })
          wheels[id] = pivot
        }
      }
    })
    wheelNodes.current = wheels
    return c
  }, [scene])

  useEffect(() => {
    const color = new THREE.Color(PAINT_COLORS[paint])
    car.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => {
        const mat = m as THREE.MeshStandardMaterial
        if (!mat?.isMeshStandardMaterial && !(mat as THREE.MeshPhysicalMaterial)?.isMeshPhysicalMaterial) return
        if (mesh.name === 'Body' || mat.name?.toLowerCase().includes('paint')) {
          mat.color.copy(color)
          mat.metalness = 0.85
          mat.roughness = 0.22
          if ('clearcoat' in mat) {
            ;(mat as THREE.MeshPhysicalMaterial).clearcoat = 1
            ;(mat as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.12
          }
          mat.needsUpdate = true
        }
      })
    })
  }, [car, paint])

  useEffect(() => {
    void audio.ensure()
    return () => audio.stop()
  }, [audio])

  useFrame((state, dt) => {
    const rb = body.current
    if (!rb) return
    const clampedDt = Math.min(dt, 1 / 30)

    if (keys.current.camera) {
      toggleCamera()
      keys.current.camera = false
    }

    const input = {
      throttle: keys.current.forward ? 1 : 0,
      brake: keys.current.back ? 1 : 0,
      steer: (keys.current.left ? 1 : 0) + (keys.current.right ? -1 : 0),
      drift: keys.current.drift,
      boost: keys.current.boost,
    }

    const raycast = (origin: THREE.Vector3, dir: THREE.Vector3, maxToi: number, exclude?: RapierRigidBody | null) => {
      const ray = new rapier.Ray(origin, dir)
      const hit = world.castRay(ray, maxToi, true, undefined, undefined, undefined, exclude ?? undefined)
      return hit ? { timeOfImpact: hit.timeOfImpact } : null
    }

    // Anti-explode / recovery
    const t0 = rb.translation()
    const v0 = rb.linvel()
    if (!Number.isFinite(t0.y) || t0.y > 40 || t0.y < -10 || Math.hypot(v0.x, v0.y, v0.z) > 120) {
      const spawnPt = getStageWaypoints(stage)[0]
      rb.setTranslation({ x: spawnPt.x, y: spawnPt.y + 1.4, z: spawnPt.z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    }

    const tel = controller.step(rb, raycast, input, clampedDt)

    // Bind wheels
    ;(['FL', 'FR', 'RL', 'RR'] as WheelId[]).forEach((id) => {
      const node = wheelNodes.current[id]
      if (!node) return
      const cfg = DEFAULT_WHEELS.find((w) => w.id === id)!
      node.position.set(
        cfg.localPosition.x,
        cfg.localPosition.y - tel.wheelTravel[id] * 0.85,
        cfg.localPosition.z,
      )
      node.rotation.set(tel.wheelSpin[id], tel.wheelSteer[id], 0)
    })

    // Exhaust flames
    flameRefs.current.forEach((f, i) => {
      f.visible = tel.isBoosting
      f.scale.setScalar(tel.isBoosting ? 0.6 + Math.sin(state.clock.elapsedTime * 40 + i) * 0.25 : 0.01)
    })

    // Skids / smoke
    tel.skidPoints.forEach((p) => skids.current.push({ pos: p.clone(), life: 4 }))
    skids.current = skids.current
      .map((s) => ({ ...s, life: s.life - clampedDt }))
      .filter((s) => s.life > 0)
      .slice(-200)
    if (skidMesh.current) {
      skids.current.forEach((s, i) => {
        dummy.position.copy(s.pos)
        dummy.scale.set(0.35, 0.02, 0.7)
        dummy.updateMatrix()
        skidMesh.current!.setMatrixAt(i, dummy.matrix)
      })
      skidMesh.current.count = skids.current.length
      skidMesh.current.instanceMatrix.needsUpdate = true
    }
    if (smokeMesh.current) {
      tel.smokePoints.forEach((p, i) => {
        dummy.position.copy(p)
        dummy.scale.setScalar(0.4 + Math.random() * 0.3)
        dummy.updateMatrix()
        smokeMesh.current!.setMatrixAt(i, dummy.matrix)
      })
      smokeMesh.current.count = tel.smokePoints.length
      smokeMesh.current.instanceMatrix.needsUpdate = true
    }

    // Checkpoints / scoring
    const waypoints = getStageWaypoints(stage)
    const t = rb.translation()
    const pos = new THREE.Vector3(t.x, t.y, t.z)
    const cp = nearestWaypointIndex(pos, waypoints)
    const store = useGameStore.getState()
    let driftScore = store.driftScore
    let mult = store.driftMultiplier
    if (mode === 'freedrift') {
      if (tel.isDrifting) {
        mult = Math.min(8, mult + clampedDt * 0.4)
        driftScore += tel.driftScoreDelta * mult
      } else {
        mult = Math.max(1, mult - clampedDt * 1.2)
      }
    }
    let checkpointIndex = store.checkpointIndex
    let lapTime = store.lapTime + clampedDt
    let bestLap = store.bestLap
    if (mode === 'timeattack') {
      const target = Math.floor((checkpointIndex % waypoints.length))
      if (cp === (target + 8) % waypoints.length) {
        checkpointIndex += 1
      }
      if (checkpointIndex > 0 && checkpointIndex % waypoints.length === 0 && cp < 3) {
        if (!bestLap || lapTime < bestLap) bestLap = lapTime
        lapTime = 0
        checkpointIndex = 0
      }
    }

    setTelemetry({
      speedKmh: tel.speedKmh,
      rpm: tel.rpm,
      nitro: tel.nitro,
      isDrifting: tel.isDrifting,
      isBoosting: tel.isBoosting,
      driftScore: Math.floor(driftScore),
      driftMultiplier: Number(mult.toFixed(1)),
      checkpointIndex,
      lapTime,
      bestLap,
    })

    audio.update(tel.rpm, tel.isBoosting, tel.isDrifting)

    const w = window as unknown as { __playerPos?: THREE.Vector3 }
    if (!w.__playerPos) w.__playerPos = new THREE.Vector3()
    w.__playerPos.set(t.x, t.y, t.z)

    // Camera FOV kick
    const cam = state.camera as THREE.PerspectiveCamera
    if (cam.isPerspectiveCamera) {
      const targetFov = tel.isBoosting ? 68 : 55
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, 0.08)
      cam.updateProjectionMatrix()
    }
  })

  const spawn = getStageWaypoints(stage)[0]

  return (
    <group>
      <RigidBody
        ref={body}
        colliders="cuboid"
        position={[spawn.x, spawn.y + 1.2, spawn.z]}
        rotation={[0, 0, 0]}
        mass={1450}
        linearDamping={0.15}
        angularDamping={0.6}
        canSleep={false}
      >
        <group ref={group}>
          <primitive object={car} />
          {[
            [-0.35, 0.35, -2.15],
            [0.35, 0.35, -2.15],
          ].map((p, i) => (
            <mesh
              key={i}
              ref={(el) => {
                if (el) flameRefs.current[i] = el
              }}
              position={p as [number, number, number]}
              visible={false}
            >
              <coneGeometry args={[0.08, 0.45, 8]} />
              <meshStandardMaterial color="#ff6a00" emissive="#ff3b00" emissiveIntensity={8} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </RigidBody>

      <instancedMesh ref={skidMesh} args={[undefined, undefined, 200]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#111" transparent opacity={0.55} />
      </instancedMesh>
      <instancedMesh ref={smokeMesh} args={[undefined, undefined, 32]}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color="#bbbbbb" transparent opacity={0.25} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
