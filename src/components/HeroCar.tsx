import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useControls } from '../hooks/useControls'
import { PAINT_COLORS, useGameStore } from '../store/gameStore'
import { useGarageStore } from '../store/garageStore'
import { getCar } from '../garage/cars'
import { fitPlayableCar, sanitizeCarClone } from '../garage/sanitizeCar'
import { EngineAudio } from '../audio/EngineAudio'
import { getStageWaypoints, nearestWaypointIndex } from '../track/waypoints'
import { getCachedWorldMarkers } from '../world/markerCache'
import { getSpawnMarker } from '../world/markers'
import { STREET_WHEELS, useRapierVehicle } from '../physics/useRapierVehicle'

const MAX_STEER = Math.PI / 7
const ENGINE = 2400
const BOOST_ENGINE = 1600
const BRAKE = 18
const DRIFT_REAR_SLIP = 0.55
const NORMAL_REAR_SLIP = 2.0

/** Single player car — remount when activeCar changes. */
export function HeroCar() {
  const activeCarId = useGarageStore((s) => s.activeCar)
  return <HeroCarBody key={activeCarId} activeCarId={activeCarId} />
}

function HeroCarBody({ activeCarId }: { activeCarId: ReturnType<typeof useGarageStore.getState>['activeCar'] }) {
  const carDef = getCar(activeCarId)
  const { scene } = useGLTF(carDef.modelUrl)
  const body = useRef<RapierRigidBody>(null)
  const keys = useControls()
  const audio = useMemo(() => new EngineAudio(), [])
  const { rapier, world } = useRapier()
  const paint = useGameStore((s) => s.paint)
  const stage = useGameStore((s) => s.stage)
  const mode = useGameStore((s) => s.mode)
  const setTelemetry = useGameStore((s) => s.setTelemetry)
  const toggleCamera = useGameStore((s) => s.toggleCamera)
  const cashBanked = useRef(0)
  const nitroRef = useRef(100)
  const driftCombo = useRef(0)
  const skids = useRef<{ pos: THREE.Vector3; life: number }[]>([])
  const skidMesh = useRef<THREE.InstancedMesh>(null)
  const smokeMesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const flameRefs = useRef<THREE.Mesh[]>([])
  const wheelsRef = useRef<(THREE.Object3D | null)[]>([null, null, null, null])
  const visualWheels = useRef<(THREE.Object3D | null)[]>([null, null, null, null])
  const snappedToMarker = useRef(false)

  const { vehicleController } = useRapierVehicle(body, wheelsRef, STREET_WHEELS)

  const car = useMemo(() => {
    const c = sanitizeCarClone(scene.clone(true))
    c.updateMatrixWorld(true)
    fitPlayableCar(c, 4.5)
    const found: (THREE.Object3D | null)[] = [null, null, null, null]
    c.traverse((obj) => {
      const n = obj.name.toUpperCase()
      if (obj.name === 'Wheel_FL' || /EXT_TYRE_LF|TYRE_LF/.test(n)) found[0] = obj
      if (obj.name === 'Wheel_FR' || /EXT_TYRE_RF|TYRE_RF/.test(n)) found[1] = obj
      if (obj.name === 'Wheel_RL' || /EXT_TYRE_LR|TYRE_LR/.test(n)) found[2] = obj
      if (obj.name === 'Wheel_RR' || /EXT_TYRE_RR|TYRE_RR/.test(n)) found[3] = obj
    })
    visualWheels.current = found
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
    const controller = vehicleController.current
    if (!rb || !controller) return
    const clampedDt = Math.min(dt, 1 / 30)

    if (keys.current.camera) {
      toggleCamera()
      keys.current.camera = false
    }

    const steerAxis =
      keys.current.steer !== 0
        ? -keys.current.steer
        : (keys.current.left ? 1 : 0) + (keys.current.right ? -1 : 0)
    const throttle = keys.current.forward ? 1 : 0
    const brake = keys.current.back ? 1 : 0
    const drifting = keys.current.drift
    const boosting = keys.current.boost && nitroRef.current > 0

    if (boosting) nitroRef.current = Math.max(0, nitroRef.current - 28 * clampedDt)
    else nitroRef.current = Math.min(100, nitroRef.current + 8 * clampedDt)

    // Snap once to Blender Empty spawn after Stage extracts markers
    if (!snappedToMarker.current) {
      const markerSpawn = getSpawnMarker(getCachedWorldMarkers())
      if (markerSpawn) {
        snappedToMarker.current = true
        const p = markerSpawn.position
        rb.setTranslation({ x: p.x, y: p.y + 0.55, z: p.z }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
        const yaw = Math.atan2(markerSpawn.forward.x, markerSpawn.forward.z)
        rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
      }
    }

    // Anti-explode / recovery
    const t0 = rb.translation()
    const v0 = rb.linvel()
    if (!Number.isFinite(t0.y) || t0.y > 40 || t0.y < -4 || Math.hypot(v0.x, v0.y, v0.z) > 90) {
      const spawnPt = getStageWaypoints(stage)[0]
      rb.setTranslation({ x: spawnPt.x, y: spawnPt.y + 0.55, z: spawnPt.z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rb.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true)
    }

    const speed = Math.hypot(v0.x, v0.z)
    const speedKmh = Math.hypot(v0.x, v0.y, v0.z) * 3.6
    const engineForce =
      throttle * ENGINE + (boosting ? BOOST_ENGINE : 0) - brake * ENGINE * 0.45

    // RWD drive — isaac-mason pattern
    controller.setWheelEngineForce(2, engineForce)
    controller.setWheelEngineForce(3, engineForce)
    controller.setWheelEngineForce(0, 0)
    controller.setWheelEngineForce(1, 0)

    const brakeForce = brake * BRAKE + (drifting ? 2 : 0)
    for (let i = 0; i < 4; i++) controller.setWheelBrake(i, brakeForce)

    const steerTarget = steerAxis * MAX_STEER * (1 - Math.min(speedKmh / 260, 0.7))
    const curSteer = controller.wheelSteering(0) ?? 0
    const steering = THREE.MathUtils.lerp(curSteer, steerTarget, 0.45)
    controller.setWheelSteering(0, steering)
    controller.setWheelSteering(1, steering)

    // Drift: loosen rear slip (Rapier frictionSlip)
    const rearSlip = drifting && speedKmh > 25 ? DRIFT_REAR_SLIP : NORMAL_REAR_SLIP
    controller.setWheelFrictionSlip(2, rearSlip)
    controller.setWheelFrictionSlip(3, rearSlip)

    // Sync authored wheel meshes to physics wheel transforms (spin/steer only on local)
    for (let i = 0; i < 4; i++) {
      const phys = wheelsRef.current[i]
      const vis = visualWheels.current[i]
      if (!phys || !vis) continue
      const spin = controller.wheelRotation(i) ?? 0
      const st = controller.wheelSteering(i) ?? 0
      if (i < 2) vis.rotation.y = st
      vis.rotation.x = spin
    }

    flameRefs.current.forEach((f, i) => {
      f.visible = boosting
      f.scale.setScalar(boosting ? 0.6 + Math.sin(state.clock.elapsedTime * 40 + i) * 0.25 : 0.01)
    })

    const isDrifting = drifting && speedKmh > 25 && Math.abs(steerAxis) > 0.1
    if (isDrifting) {
      driftCombo.current += clampedDt
      const t = rb.translation()
      skids.current.push({ pos: new THREE.Vector3(t.x, 0.02, t.z), life: 3.5 })
    } else {
      driftCombo.current = Math.max(0, driftCombo.current - clampedDt * 2)
    }
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
      const count = isDrifting ? 8 : 0
      for (let i = 0; i < count; i++) {
        const t = rb.translation()
        dummy.position.set(t.x + (Math.random() - 0.5), t.y + 0.2, t.z + (Math.random() - 0.5))
        dummy.scale.setScalar(0.35 + Math.random() * 0.25)
        dummy.updateMatrix()
        smokeMesh.current.setMatrixAt(i, dummy.matrix)
      }
      smokeMesh.current.count = count
      smokeMesh.current.instanceMatrix.needsUpdate = true
    }

    const waypoints = getStageWaypoints(stage)
    const t = rb.translation()
    const pos = new THREE.Vector3(t.x, t.y, t.z)
    const cp = nearestWaypointIndex(pos, waypoints)
    const store = useGameStore.getState()
    let driftScore = store.driftScore
    let mult = store.driftMultiplier
    if (mode === 'freedrift') {
      if (isDrifting) {
        mult = Math.min(8, mult + clampedDt * 0.4)
        driftScore += Math.floor((8 + driftCombo.current * 14) * (1 + Math.abs(steerAxis)) * mult)
      } else {
        mult = Math.max(1, mult - clampedDt * 1.2)
      }
    }
    let checkpointIndex = store.checkpointIndex
    let lapTime = store.lapTime + clampedDt
    let bestLap = store.bestLap
    if (mode === 'timeattack') {
      const target = Math.floor(checkpointIndex % waypoints.length)
      if (cp === (target + 8) % waypoints.length) checkpointIndex += 1
      if (checkpointIndex > 0 && checkpointIndex % waypoints.length === 0 && cp < 3) {
        if (!bestLap || lapTime < bestLap) bestLap = lapTime
        lapTime = 0
        checkpointIndex = 0
      }
    }

    const floored = Math.floor(driftScore)
    setTelemetry({
      speedKmh,
      rpm: 800 + Math.min(7000, speed * 180 + (boosting ? 900 : 0)),
      nitro: nitroRef.current,
      isDrifting,
      isBoosting: boosting,
      driftScore: floored,
      driftMultiplier: Number(mult.toFixed(1)),
      checkpointIndex,
      lapTime,
      bestLap,
    })

    if (floored > cashBanked.current) {
      const gained = Math.floor((floored - cashBanked.current) / 10)
      if (gained > 0) {
        useGarageStore.getState().addCash(gained)
        cashBanked.current += gained * 10
      }
    }

    audio.update(800 + Math.min(7000, speed * 180), boosting, isDrifting)

    const w = window as unknown as { __playerPos?: THREE.Vector3; __playerQuat?: THREE.Quaternion }
    if (!w.__playerPos) w.__playerPos = new THREE.Vector3()
    if (!w.__playerQuat) w.__playerQuat = new THREE.Quaternion()
    w.__playerPos.set(t.x, t.y, t.z)
    const rot = rb.rotation()
    w.__playerQuat.set(rot.x, rot.y, rot.z, rot.w)

    const cam = state.camera as THREE.PerspectiveCamera
    if (cam.isPerspectiveCamera) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, boosting ? 68 : 55, 0.08)
      cam.updateProjectionMatrix()
    }

    // Ground probe for out-of-bounds (isaac pattern)
    const ray = new rapier.Ray(t, { x: 0, y: -1, z: 0 })
    const hit = world.castRay(ray, 3, false, undefined, undefined, undefined, rb)
    if (!hit && t.y < -1) {
      const spawnPt = getStageWaypoints(stage)[0]
      rb.setTranslation({ x: spawnPt.x, y: spawnPt.y + 0.55, z: spawnPt.z }, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  })

  const spawn = getStageWaypoints(stage)[0]

  return (
    <group>
      <RigidBody
        ref={body}
        colliders={false}
        position={[spawn.x, spawn.y + 0.55, spawn.z]}
        rotation={[0, Math.PI / 2, 0]}
        mass={1450}
        linearDamping={0.25}
        angularDamping={1.6}
        restitution={0}
        friction={1.1}
        ccd
        canSleep={false}
      >
        <CuboidCollider args={[0.95, 0.38, 2.1]} position={[0, 0.52, 0]} friction={1.1} restitution={0} />
        <primitive object={car} />
        {/* Physics wheel anchors (isaac-mason visual sync targets) */}
        {STREET_WHEELS.map((wheel, index) => (
          <group
            key={index}
            ref={(el) => {
              wheelsRef.current[index] = el
            }}
            position={wheel.position.toArray() as [number, number, number]}
          />
        ))}
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
