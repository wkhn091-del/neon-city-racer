import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useControls } from '../hooks/useControls'
import { useGameStore } from '../store/gameStore'
import { useGarageStore } from '../store/garageStore'
import { getCar } from '../garage/cars'
import { applyCarVisuals, underglowColor } from '../garage/applyCarVisuals'
import { tuningMultipliers } from '../garage/tuning'
import { fitPlayableCar, sanitizeCarClone } from '../garage/sanitizeCar'
import { EngineAudio } from '../audio/EngineAudio'
import { getStageWaypoints, nearestWaypointIndex } from '../track/waypoints'
import { getCachedWorldMarkers } from '../world/markerCache'
import { getSpawnMarker } from '../world/markers'
import { STREET_WHEELS, useRapierVehicle, type WheelInfo } from '../physics/useRapierVehicle'

const BASE_MAX_STEER = Math.PI / 7
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
  const setup = useGarageStore((s) => s.setups[activeCarId])
  const mult = useMemo(() => tuningMultipliers(setup), [setup])
  const cashBanked = useRef(0)
  const nitroRef = useRef(mult.nitroCapacity)
  const driftCombo = useRef(0)
  const airTime = useRef(0)
  const lastDriftPopup = useRef(0)
  const nearMissCd = useRef(0)
  const lastVy = useRef(0)
  const cameraMode = useGameStore((s) => s.camera)
  const pushCashPopup = useGameStore((s) => s.pushCashPopup)
  const triggerHitStop = useGameStore((s) => s.triggerHitStop)
  const skids = useRef<{ pos: THREE.Vector3; life: number }[]>([])
  const skidMesh = useRef<THREE.InstancedMesh>(null)
  const smokeMesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const flameRefs = useRef<THREE.Mesh[]>([])
  const stageFlameRefs = useRef<THREE.Mesh[]>([])
  const underglowLight = useRef<THREE.PointLight>(null)
  const underglowDisc = useRef<THREE.Mesh>(null)
  const wheelsRef = useRef<(THREE.Object3D | null)[]>([null, null, null, null])
  const visualWheels = useRef<(THREE.Object3D | null)[]>([null, null, null, null])
  const snappedToMarker = useRef(false)

  const tunedWheels = useMemo<WheelInfo[]>(() => {
    return STREET_WHEELS.map((w) => ({
      ...w,
      suspensionRestLength: w.suspensionRestLength * mult.restLengthScale,
      frictionSlip: w.frictionSlip * mult.frictionSlip,
      position: w.position.clone(),
      axleCs: w.axleCs.clone(),
    }))
  }, [mult.restLengthScale, mult.frictionSlip])

  const { vehicleController } = useRapierVehicle(body, wheelsRef, tunedWheels)

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
    applyCarVisuals(car, setup, paint)
  }, [car, setup, paint])

  useEffect(() => {
    nitroRef.current = Math.min(nitroRef.current, mult.nitroCapacity)
    audio.setTurboVolume(mult.turboVolume)
  }, [mult.nitroCapacity, mult.turboVolume, audio])

  useEffect(() => {
    void audio.ensure()
    return () => audio.stop()
  }, [audio])

  useFrame((state, dt) => {
    const rb = body.current
    const controller = vehicleController.current
    if (!rb || !controller) return
    if (cameraMode === 'photo') return
    const hitStop = performance.now() < useGameStore.getState().hitStopUntil
    const clampedDt = Math.min(dt, 1 / 30) * (hitStop ? 0.2 : 1)

    if (keys.current.camera) {
      toggleCamera()
      keys.current.camera = false
    }

    const steerAxis =
      keys.current.steer !== 0
        ? -keys.current.steer
        : (keys.current.left ? 1 : 0) + (keys.current.right ? -1 : 0)
    ;(window as unknown as { __steer?: number }).__steer = steerAxis
    const throttle = keys.current.forward ? 1 : 0
    const brake = keys.current.back ? 1 : 0
    const drifting = keys.current.drift
    const boosting = keys.current.boost && nitroRef.current > 0

    if (boosting) nitroRef.current = Math.max(0, nitroRef.current - mult.nitroDrain * clampedDt)
    else nitroRef.current = Math.min(mult.nitroCapacity, nitroRef.current + mult.nitroRecharge * clampedDt)

    if (!snappedToMarker.current) {
      const markerSpawn = getSpawnMarker(getCachedWorldMarkers())
      if (markerSpawn) {
        snappedToMarker.current = true
        const p = markerSpawn.position
        const origin = { x: p.x, y: p.y + 6, z: p.z }
        const ray = new rapier.Ray(origin, { x: 0, y: -1, z: 0 })
        const hit = world.castRay(ray, 14, true, undefined, undefined, undefined, rb)
        const surfaceY = hit ? origin.y - hit.timeOfImpact : p.y
        const hover = 0.34 + tunedWheels[0].suspensionRestLength
        rb.setTranslation({ x: p.x, y: surfaceY + hover, z: p.z }, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
        const yaw = Math.atan2(markerSpawn.forward.x, markerSpawn.forward.z)
        rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
      }
    }

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
    let engineForce =
      throttle * ENGINE * mult.engineForce +
      (boosting ? BOOST_ENGINE * mult.boostForce : 0) -
      brake * ENGINE * 0.45
    const topCap = 95 * mult.topSpeedCap
    if (speed > topCap && throttle > 0) engineForce *= 0.35

    controller.setWheelEngineForce(2, engineForce)
    controller.setWheelEngineForce(3, engineForce)
    controller.setWheelEngineForce(0, 0)
    controller.setWheelEngineForce(1, 0)

    const brakeForce = brake * BRAKE + (drifting ? 2 : 0)
    for (let i = 0; i < 4; i++) controller.setWheelBrake(i, brakeForce)

    const sideSlip = rb.linvel()
    const rotQ = rb.rotation()
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
      new THREE.Quaternion(rotQ.x, rotQ.y, rotQ.z, rotQ.w),
    )
    const lateral = sideSlip.x * right.x + sideSlip.z * right.z
    const maxSteer = BASE_MAX_STEER * mult.maxSteer
    const counter =
      drifting && speedKmh > 25
        ? THREE.MathUtils.clamp(-lateral * 0.035 * mult.counterSteer, -0.45, 0.45)
        : 0
    const steerTarget =
      (steerAxis * maxSteer + counter) * (1 - Math.min(speedKmh / 260, 0.7))
    const curSteer = controller.wheelSteering(0) ?? 0
    const steering = THREE.MathUtils.lerp(curSteer, steerTarget, 0.45)
    controller.setWheelSteering(0, steering)
    controller.setWheelSteering(1, steering)

    const rearSlip =
      drifting && speedKmh > 25 ? DRIFT_REAR_SLIP * mult.driftRearSlip : NORMAL_REAR_SLIP * mult.frictionSlip
    controller.setWheelFrictionSlip(2, rearSlip)
    controller.setWheelFrictionSlip(3, rearSlip)
    controller.setWheelFrictionSlip(0, STREET_WHEELS[0].frictionSlip * mult.frictionSlip)
    controller.setWheelFrictionSlip(1, STREET_WHEELS[1].frictionSlip * mult.frictionSlip)

    for (let i = 0; i < 4; i++) {
      const phys = wheelsRef.current[i]
      const vis = visualWheels.current[i]
      if (!phys || !vis) continue
      const spin = controller.wheelRotation(i) ?? 0
      const st = controller.wheelSteering(i) ?? 0
      if (i < 2) vis.rotation.y = st
      vis.rotation.x = spin
    }

    const flameScale = mult.flameScale
    flameRefs.current.forEach((f, i) => {
      f.visible = boosting
      f.scale.setScalar(boosting ? (0.55 + Math.sin(state.clock.elapsedTime * 40 + i) * 0.22) * flameScale : 0.01)
    })
    stageFlameRefs.current.forEach((f, i) => {
      const show = boosting && mult.dualStageFlames
      f.visible = show
      f.scale.setScalar(show ? (0.7 + Math.sin(state.clock.elapsedTime * 55 + i) * 0.3) * flameScale : 0.01)
    })

    const glow = underglowColor(setup.underglow)
    if (underglowLight.current) {
      if (glow) {
        underglowLight.current.color.copy(glow)
        underglowLight.current.intensity = 4.8 + Math.sin(state.clock.elapsedTime * 4) * 0.6
      } else {
        underglowLight.current.intensity = 0
      }
    }
    if (underglowDisc.current) {
      underglowDisc.current.visible = !!glow
      if (glow) {
        const mat = underglowDisc.current.material as THREE.MeshBasicMaterial
        mat.color.copy(glow)
        mat.opacity = 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.08
      }
    }

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
    let scoreMult = store.driftMultiplier
    if (mode === 'freedrift') {
      if (isDrifting) {
        scoreMult = Math.min(8, scoreMult + clampedDt * 0.4)
        driftScore += Math.floor((8 + driftCombo.current * 14) * (1 + Math.abs(steerAxis)) * scoreMult)
      } else {
        scoreMult = Math.max(1, scoreMult - clampedDt * 1.2)
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
      nitro: (nitroRef.current / mult.nitroCapacity) * 100,
      isDrifting,
      isBoosting: boosting,
      driftScore: floored,
      driftMultiplier: Number(scoreMult.toFixed(1)),
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

    // Juice: drift king / near miss / air time popups + hit-stop
    if (isDrifting && driftCombo.current > 2.5 && performance.now() - lastDriftPopup.current > 4000) {
      const bonus = 450
      useGarageStore.getState().addCash(bonus)
      pushCashPopup('DRIFT KING +$450')
      lastDriftPopup.current = performance.now()
    }
    nearMissCd.current = Math.max(0, nearMissCd.current - clampedDt)
    const trafficNear = (window as unknown as { __trafficNear?: number }).__trafficNear ?? 999
    if (nearMissCd.current <= 0 && trafficNear > 2.2 && trafficNear < 5.5 && speedKmh > 90) {
      useGarageStore.getState().addCash(150)
      pushCashPopup('NEAR MISS +$150')
      nearMissCd.current = 5
    }
    const grounded = !!world.castRay(new rapier.Ray(t, { x: 0, y: -1, z: 0 }), 1.2, true, undefined, undefined, undefined, rb)
    if (!grounded && v0.y > 0.5) airTime.current += clampedDt
    else {
      if (airTime.current > 0.55) {
        useGarageStore.getState().addCash(300)
        pushCashPopup('AIR TIME +$300')
        triggerHitStop(50)
      }
      airTime.current = 0
    }
    const impact = Math.abs(v0.y - lastVy.current)
    if (impact > 8 && grounded) {
      triggerHitStop(50)
      ;(window as unknown as { __impact?: number }).__impact = Math.min(1, impact / 14)
    }
    lastVy.current = v0.y

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
      if (boosting) {
        cam.position.x += (Math.random() - 0.5) * 0.04
        cam.position.y += (Math.random() - 0.5) * 0.03
      }
    }
    ;(window as unknown as { __boosting?: boolean }).__boosting = boosting

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
  const glowCol = underglowColor(setup.underglow) ?? new THREE.Color('#22e0ff')

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
        {tunedWheels.map((wheel, index) => (
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
            key={`flame-${i}`}
            ref={(el) => {
              if (el) flameRefs.current[i] = el
            }}
            position={p as [number, number, number]}
            visible={false}
          >
            <coneGeometry args={[0.08, 0.45, 8]} />
            <meshStandardMaterial color="#4db8ff" emissive="#1a8cff" emissiveIntensity={10} toneMapped={false} />
          </mesh>
        ))}
        {[
          [-0.22, 0.38, -2.35],
          [0.22, 0.38, -2.35],
        ].map((p, i) => (
          <mesh
            key={`stage-${i}`}
            ref={(el) => {
              if (el) stageFlameRefs.current[i] = el
            }}
            position={p as [number, number, number]}
            visible={false}
          >
            <coneGeometry args={[0.1, 0.55, 8]} />
            <meshStandardMaterial
              color={i === 0 ? '#c44dff' : '#22e0ff'}
              emissive={i === 0 ? '#a020f0' : '#00c8ff'}
              emissiveIntensity={14}
              toneMapped={false}
            />
          </mesh>
        ))}
        <pointLight
          ref={underglowLight}
          position={[0, 0.12, 0]}
          color={glowCol}
          intensity={setup.underglow === 'off' ? 0 : 5}
          distance={6}
          decay={2}
        />
        <mesh ref={underglowDisc} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} visible={setup.underglow !== 'off'}>
          <circleGeometry args={[1.4, 32]} />
          <meshBasicMaterial
            color={glowCol}
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
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
