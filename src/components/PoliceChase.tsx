import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'
import { useGarageStore } from '../store/garageStore'
import { getCachedWorldMarkers } from '../world/markerCache'
import { getLaneMarkers } from '../world/markers'
import { PoliceSiren } from '../audio/PoliceSiren'
import {
  ESCAPE_SECONDS,
  HEAT_MAX,
  RADAR_RADIUS,
  copsForHeat,
  escapePayout,
  flankOffset,
} from '../systems/heatSystem'

useGLTF.preload('/models/police_car.glb')

function fitPolice(root: THREE.Object3D, targetLen = 4.6) {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.z, 0.001)
  root.scale.multiplyScalar(targetLen / longest)
  root.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(root)
  root.position.y -= box2.min.y
}

type CopState = {
  pos: THREE.Vector3
  yaw: number
  speed: number
  role: 'chase' | 'flankL' | 'flankR' | 'box'
}

export function PoliceChase({ playerPos }: { playerPos: React.MutableRefObject<THREE.Vector3> }) {
  const { scene } = useGLTF('/models/police_car.glb')
  const mode = useGameStore((s) => s.mode)
  const setTelemetry = useGameStore((s) => s.setTelemetry)
  const bumpHeat = useGameStore((s) => s.bumpHeat)
  const clearHeat = useGameStore((s) => s.clearHeat)
  const siren = useMemo(() => new PoliceSiren(), [])
  const group = useRef<THREE.Group>(null)
  const lightL = useRef<THREE.PointLight[]>([])
  const lightR = useRef<THREE.PointLight[]>([])
  const escapeTimer = useRef(0)
  const trapCooldown = useRef(0)
  const trafficHitCd = useRef(0)
  const announced = useRef(0)
  const placed = useRef(false)

  const clones = useMemo(() => {
    return Array.from({ length: HEAT_MAX }, () => {
      const c = scene.clone(true)
      fitPolice(c, 4.55)
      c.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.castShadow = false
          m.receiveShadow = true
          m.frustumCulled = true
        }
      })
      return c
    })
  }, [scene])

  const cops = useRef<CopState[]>(
    Array.from({ length: HEAT_MAX }, (_, i) => ({
      pos: new THREE.Vector3(20 + i * 4, 0.2, -30 - i * 6),
      yaw: 0,
      speed: 22 + i * 2,
      role: i === 0 ? 'chase' : i % 2 === 0 ? 'flankL' : 'flankR',
    })),
  )

  useEffect(() => {
    void siren.ensure()
    return () => siren.stop()
  }, [siren])

  useEffect(() => {
    placed.current = false
    escapeTimer.current = 0
    if (mode === 'policechase' && useGameStore.getState().heat < 2) {
      bumpHeat(2 - useGameStore.getState().heat)
    }
  }, [mode, bumpHeat])

  useFrame((state, dt) => {
    const clamped = Math.min(dt, 1 / 20)
    const player = playerPos.current
    const store = useGameStore.getState()
    const speed = store.speedKmh

    // Speed traps from Traffic_Lane markers (Rule 3 — no invented points)
    trapCooldown.current = Math.max(0, trapCooldown.current - clamped)
    if (trapCooldown.current <= 0 && speed > 115 && (mode === 'freedrift' || mode === 'policechase')) {
      const lanes = [...getLaneMarkers(getCachedWorldMarkers(), 'A'), ...getLaneMarkers(getCachedWorldMarkers(), 'B')]
      for (const m of lanes) {
        if (player.distanceTo(m.position) < 9) {
          bumpHeat(1)
          trapCooldown.current = 8
          break
        }
      }
    }

    // Soft traffic proximity "hit" while hot / chasing
    trafficHitCd.current = Math.max(0, trafficHitCd.current - clamped)
    if (trafficHitCd.current <= 0 && speed > 60) {
      const w = window as unknown as { __trafficNear?: number }
      if (w.__trafficNear && w.__trafficNear < 5.5) {
        bumpHeat(1)
        trafficHitCd.current = 6
      }
    }

    // Police chase mode keeps baseline heat
    if (mode === 'policechase' && store.heat < 2) {
      bumpHeat(2 - store.heat)
    }

    const activeCount = copsForHeat(useGameStore.getState().heat)
    const playerFwd = new THREE.Vector3(0, 0, 1)
    const pq = (window as unknown as { __playerQuat?: THREE.Quaternion }).__playerQuat
    if (pq) playerFwd.set(0, 0, 1).applyQuaternion(pq).normalize()
    const playerRight = new THREE.Vector3().crossVectors(playerFwd, new THREE.Vector3(0, 1, 0)).normalize()

    // Place cops once behind/flanking the player so they don't spawn in a pile-up
    if (!placed.current && activeCount > 0 && Number.isFinite(player.x)) {
      for (let i = 0; i < HEAT_MAX; i++) {
        const local = flankOffset(i, Math.max(activeCount, 1))
        local.multiplyScalar(1.8)
        cops.current[i].pos
          .copy(player)
          .add(playerFwd.clone().multiplyScalar(local.z - 8))
          .add(playerRight.clone().multiplyScalar(local.x))
        cops.current[i].pos.y = player.y
        cops.current[i].yaw = Math.atan2(playerFwd.x, playerFwd.z)
      }
      placed.current = true
    }

    let nearest = Infinity
    for (let i = 0; i < HEAT_MAX; i++) {
      const node = group.current?.children[i]
      const lit = !!node
      if (!node) continue
      node.visible = i < activeCount
      if (i >= activeCount) continue

      const cop = cops.current[i]
      const local = flankOffset(i, activeCount)
      const target = player
        .clone()
        .add(playerFwd.clone().multiplyScalar(local.z))
        .add(playerRight.clone().multiplyScalar(local.x))
      target.y = player.y

      // Box-in at high heat: lead car cuts ahead
      if (useGameStore.getState().heat >= 4 && i === activeCount - 1) {
        target.copy(player).add(playerFwd.clone().multiplyScalar(14))
      }

      const to = target.clone().sub(cop.pos)
      to.y = 0
      const dist = to.length()
      nearest = Math.min(nearest, player.distanceTo(cop.pos))
      if (dist > 0.1) {
        const desiredYaw = Math.atan2(to.x, to.z)
        let dy = desiredYaw - cop.yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        cop.yaw += dy * Math.min(1, 4 * clamped)
        const haste = 18 + useGameStore.getState().heat * 4 + Math.min(12, speed * 0.08)
        const step = Math.min(dist, haste * clamped)
        cop.pos.add(new THREE.Vector3(Math.sin(cop.yaw), 0, Math.cos(cop.yaw)).multiplyScalar(step))
      }
      cop.pos.y = player.y
      node.position.copy(cop.pos)
      node.rotation.set(0, cop.yaw, 0)

      // Flashing lightbars + emissive pulse on lightbar meshes
      const flash = Math.sin(state.clock.elapsedTime * 14 + i) > 0
      const l = lightL.current[i]
      const r = lightR.current[i]
      if (l) {
        l.intensity = flash ? 28 : 4
        l.visible = lit && i < activeCount
      }
      if (r) {
        r.intensity = flash ? 4 : 28
        r.visible = lit && i < activeCount
      }
      node.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh || !mesh.material) return
        if (!/light|bar|roof/i.test(mesh.name)) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach((raw) => {
          const mat = raw as THREE.MeshStandardMaterial
          if (!mat?.emissive) return
          mat.emissiveIntensity = flash ? 12 : 3
          mat.emissive.set(flash ? '#ff2040' : '#2060ff')
          mat.needsUpdate = true
        })
      })
    }

    const heatNow = useGameStore.getState().heat
    const inRadar = heatNow > 0 && nearest < RADAR_RADIUS
    if (heatNow > 0 && placed.current) {
      if (inRadar) escapeTimer.current = 0
      else escapeTimer.current += clamped

      if (escapeTimer.current >= ESCAPE_SECONDS) {
        const payout = escapePayout(heatNow)
        useGarageStore.getState().addCash(payout)
        clearHeat()
        escapeTimer.current = 0
        announced.current = payout
        setTelemetry({ escapePayout: payout, heatEscape: 0 })
      } else {
        setTelemetry({ heatEscape: escapeTimer.current, escapePayout: announced.current })
      }
    } else if (heatNow <= 0) {
      escapeTimer.current = 0
      setTelemetry({ heatEscape: 0 })
    }

    siren.update(activeCount > 0, 0.6 + heatNow * 0.15)
    siren.setRain(useGameStore.getState().atmosphere === 'rain')
    ;(window as unknown as { __heat?: number; __cops?: number }).__heat = heatNow
    ;(window as unknown as { __cops?: number }).__cops = activeCount
  })

  return (
    <group ref={group}>
      {clones.map((c, i) => (
        <group key={i} visible={false}>
          <primitive object={c} />
          <pointLight
            ref={(el) => {
              if (el) lightL.current[i] = el
            }}
            position={[-0.45, 1.35, 0.1]}
            color="#ff2040"
            intensity={0}
            distance={14}
            decay={2}
          />
          <pointLight
            ref={(el) => {
              if (el) lightR.current[i] = el
            }}
            position={[0.45, 1.35, 0.1]}
            color="#2060ff"
            intensity={0}
            distance={14}
            decay={2}
          />
        </group>
      ))}
    </group>
  )
}
