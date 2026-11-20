import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
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
import { useGameStore, type QualityPreset } from '../store/gameStore'
import { getStageWaypoints } from '../track/waypoints'

function PlayerPosSync({ playerPos }: { playerPos: React.MutableRefObject<THREE.Vector3> }) {
  useFrame(() => {
    const w = window as unknown as { __playerPos?: THREE.Vector3 }
    if (w.__playerPos) playerPos.current.copy(w.__playerPos)
  })
  return null
}

function qualitySettings(q: QualityPreset) {
  if (q === 'low') return { dpr: [0.85, 1] as [number, number], shadows: false, bloom: false, shadowMap: 512, exposure: 1.0 }
  if (q === 'medium') return { dpr: [1, 1.25] as [number, number], shadows: true, bloom: true, shadowMap: 1024, exposure: 0.95 }
  return { dpr: [1, 1.5] as [number, number], shadows: true, bloom: true, shadowMap: 2048, exposure: 0.9 }
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
  return (
    <EnvBoundary fallback={<Environment preset="city" background={false} environmentIntensity={0.45} />}>
      <Suspense fallback={<Environment preset="night" background={false} environmentIntensity={0.4} />}>
        <Environment files="/hdri/modern_buildings_night_2k.hdr" background={false} environmentIntensity={0.5} />
      </Suspense>
    </EnvBoundary>
  )
}

export function GameCanvas() {
  const stage = useGameStore((s) => s.stage)
  const quality = useGameStore((s) => s.quality)
  const qs = useMemo(() => qualitySettings(quality), [quality])
  const spawn = getStageWaypoints(stage)[0]
  const playerPos = useRef(new THREE.Vector3(spawn.x, spawn.y + 2, spawn.z))

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
        gl.toneMappingExposure = qs.exposure
        gl.setClearColor('#0d1524', 1)
        scene.background = new THREE.Color('#0d1524')
        ;(window as unknown as { __gl?: THREE.WebGLRenderer }).__gl = gl
      }}
    >
      <color attach="background" args={['#0d1524']} />
      <fog attach="fog" args={['#0d1524', 120, quality === 'low' ? 480 : 700]} />
      <PerspectiveCamera
        makeDefault
        fov={55}
        position={[spawn.x - 16, spawn.y + 8, spawn.z + 14]}
        near={0.5}
        far={2500}
      />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#a8c4e8', '#121820', 0.55]} />
      <directionalLight
        castShadow={qs.shadows}
        intensity={1.35}
        position={[90, 140, 50]}
        color="#e8f0ff"
        shadow-mapSize={[qs.shadowMap, qs.shadowMap]}
        shadow-camera-far={800}
        shadow-camera-left={-320}
        shadow-camera-right={320}
        shadow-camera-top={320}
        shadow-camera-bottom={-320}
      />
      <directionalLight intensity={0.35} position={[-50, 50, -70]} color="#7a94c8" />

      <Suspense fallback={null}>
        <CityEnvironment />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} numSolverIterations={8}>
          <Stage key={stage} stage={stage} />
          <HeroCar key={`hero-${stage}`} />
          <Traffic stage={stage} playerPos={playerPos} />
          <Pedestrians />
        </Physics>
        <GameCamera target={playerPos} />
        <PlayerPosSync playerPos={playerPos} />
        <Suspense fallback={null}>
          <OceanWater />
        </Suspense>
        {qs.shadows ? <BakeShadows /> : null}
        <Preload all />
      </Suspense>

      {qs.bloom ? (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={0.16} luminanceThreshold={0.88} mipmapBlur />
        </EffectComposer>
      ) : null}
      <AdaptiveDpr />
    </Canvas>
  )
}
