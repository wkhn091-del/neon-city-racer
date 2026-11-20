import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BakeShadows, Environment, PerspectiveCamera, AdaptiveDpr, Preload } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Stage } from './Stage'
import { HeroCar } from './HeroCar'
import { GameCamera } from './GameCamera'
import { OceanWater } from './OceanWater'
import { Traffic } from './Traffic'
import { Pedestrians } from './Pedestrians'
import { PoliceChase } from './PoliceChase'
import { RainFX } from './RainFX'
import { useGameStore, type QualityPreset } from '../store/gameStore'
import { getStageWaypoints } from '../track/waypoints'
import { getAtmosphere } from '../world/atmosphere'

function PlayerPosSync({ playerPos }: { playerPos: React.MutableRefObject<THREE.Vector3> }) {
  useFrame(() => {
    const w = window as unknown as { __playerPos?: THREE.Vector3 }
    if (w.__playerPos) playerPos.current.copy(w.__playerPos)
  })
  return null
}

function qualitySettings(q: QualityPreset) {
  if (q === 'low') return { dpr: [0.85, 1] as [number, number], shadows: false, bloom: false, shadowMap: 512 }
  if (q === 'medium') return { dpr: [1, 1.25] as [number, number], shadows: true, bloom: true, shadowMap: 1024 }
  return { dpr: [1, 1.5] as [number, number], shadows: true, bloom: true, shadowMap: 2048 }
}

class EnvBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() {
    return { err: true }
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children
  }
}

function CityEnvironment() {
  const atmosphere = useGameStore((s) => s.atmosphere)
  const preset = getAtmosphere(atmosphere)
  const fallback = preset.envPreset ?? 'night'
  return (
    <EnvBoundary fallback={<Environment preset={fallback} background={false} environmentIntensity={preset.envIntensity} />}>
      <Suspense fallback={<Environment preset={fallback} background={false} environmentIntensity={preset.envIntensity * 0.9} />}>
        {preset.hdri ? (
          <Environment key={preset.hdri} files={preset.hdri} background={false} environmentIntensity={preset.envIntensity} />
        ) : (
          <Environment key={`preset-${fallback}`} preset={fallback} background={false} environmentIntensity={preset.envIntensity} />
        )}
      </Suspense>
    </EnvBoundary>
  )
}

function AtmosphereLights({ shadows, shadowMap }: { shadows: boolean; shadowMap: number }) {
  const atmosphere = useGameStore((s) => s.atmosphere)
  const preset = getAtmosphere(atmosphere)
  const { gl, scene } = useThree()

  useEffect(() => {
    gl.toneMappingExposure = preset.exposure
    gl.setClearColor(preset.bg, 1)
    scene.background = new THREE.Color(preset.bg)
    scene.fog = new THREE.Fog(preset.bg, preset.fogNear, preset.fogFar)
  }, [preset, gl, scene])

  return (
    <>
      <color attach="background" args={[preset.bg]} />
      <fog attach="fog" args={[preset.bg, preset.fogNear, preset.fogFar]} />
      <ambientLight intensity={preset.ambient} />
      <hemisphereLight args={[preset.hemiSky, preset.hemiGround, preset.hemiIntensity]} />
      <directionalLight
        castShadow={shadows}
        intensity={preset.sunIntensity}
        position={preset.sunPos}
        color={preset.sunColor}
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-camera-far={800}
        shadow-camera-left={-320}
        shadow-camera-right={320}
        shadow-camera-top={320}
        shadow-camera-bottom={-320}
      />
      <directionalLight intensity={preset.fillIntensity} position={[-50, 50, -70]} color={preset.fillColor} />
    </>
  )
}

export function GameCanvas() {
  const stage = useGameStore((s) => s.stage)
  const quality = useGameStore((s) => s.quality)
  const atmosphere = useGameStore((s) => s.atmosphere)
  const heat = useGameStore((s) => s.heat)
  const qs = useMemo(() => qualitySettings(quality), [quality])
  const atm = getAtmosphere(atmosphere)
  const spawn = getStageWaypoints(stage)[0]
  const playerPos = useRef(new THREE.Vector3(spawn.x, spawn.y + 2, spawn.z))
  const bloomIntensity = qs.bloom ? (heat > 0 ? 0.28 : atm.rain ? 0.22 : 0.16) : 0

  return (
    <Canvas
      key={`${stage}-${quality}`}
      shadows={qs.shadows}
      dpr={qs.dpr}
      gl={{
        antialias: quality !== 'low',
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = atm.exposure
        gl.setClearColor(atm.bg, 1)
        scene.background = new THREE.Color(atm.bg)
        ;(window as unknown as { __gl?: THREE.WebGLRenderer }).__gl = gl
      }}
    >
      <PerspectiveCamera
        makeDefault
        fov={55}
        position={[spawn.x - 16, spawn.y + 8, spawn.z + 14]}
        near={0.5}
        far={2500}
      />

      <AtmosphereLights shadows={qs.shadows} shadowMap={qs.shadowMap} />

      <Suspense fallback={null}>
        <CityEnvironment />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} numSolverIterations={8}>
          <Stage key={stage} stage={stage} />
          <HeroCar key={`hero-${stage}`} />
          <Traffic stage={stage} playerPos={playerPos} />
          <Pedestrians />
          <PoliceChase playerPos={playerPos} />
        </Physics>
        <GameCamera target={playerPos} />
        <PlayerPosSync playerPos={playerPos} />
        <RainFX />
        <Suspense fallback={null}>
          <OceanWater />
        </Suspense>
        {qs.shadows ? <BakeShadows /> : null}
        <Preload all />
      </Suspense>

      {qs.bloom ? (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={bloomIntensity} luminanceThreshold={heat > 0 ? 0.72 : 0.88} mipmapBlur />
        </EffectComposer>
      ) : null}
      <AdaptiveDpr />
    </Canvas>
  )
}
