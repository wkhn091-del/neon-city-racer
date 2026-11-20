import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, PerspectiveCamera, AdaptiveDpr } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { Stage } from './Stage'
import { HeroCar } from './HeroCar'
import { GameCamera } from './GameCamera'
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
  if (q === 'low') return { dpr: [0.85, 1] as [number, number], shadows: false, bloom: false, shadowMap: 512, exposure: 1.5 }
  if (q === 'medium') return { dpr: [1, 1.25] as [number, number], shadows: true, bloom: true, shadowMap: 1024, exposure: 1.4 }
  return { dpr: [1, 1.5] as [number, number], shadows: true, bloom: true, shadowMap: 2048, exposure: 1.35 }
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
    <EnvBoundary fallback={<Environment preset="city" background={false} environmentIntensity={1.15} />}>
      <Suspense fallback={<Environment preset="night" background={false} environmentIntensity={1.05} />}>
        <Environment files="/hdri/modern_buildings_night_2k.hdr" background={false} environmentIntensity={1.15} />
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
        gl.setClearColor('#152238', 1)
        scene.background = new THREE.Color('#152238')
        ;(window as unknown as { __gl?: THREE.WebGLRenderer }).__gl = gl
      }}
    >
      <color attach="background" args={['#152238']} />
      <fog attach="fog" args={['#152238', 80, quality === 'low' ? 420 : 650]} />
      <PerspectiveCamera
        makeDefault
        fov={55}
        position={[spawn.x - 16, spawn.y + 8, spawn.z + 14]}
        near={0.5}
        far={2500}
      />

      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#c8dcff', '#1e2430', 1.5]} />
      <directionalLight
        castShadow={qs.shadows}
        intensity={2.8}
        position={[90, 140, 50]}
        color="#e8f0ff"
        shadow-mapSize={[qs.shadowMap, qs.shadowMap]}
        shadow-camera-far={800}
        shadow-camera-left={-320}
        shadow-camera-right={320}
        shadow-camera-top={320}
        shadow-camera-bottom={-320}
      />
      <directionalLight intensity={0.9} position={[-50, 50, -70]} color="#8aa6ff" />

      <Suspense fallback={null}>
        <CityEnvironment />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} numSolverIterations={8}>
          <Stage key={stage} stage={stage} />
          <HeroCar key={`hero-${stage}`} />
          {/* Traffic / peds paused until map+car skeleton is solid */}
        </Physics>
        <GameCamera target={playerPos} />
        <PlayerPosSync playerPos={playerPos} />
      </Suspense>

      {qs.bloom ? (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.28} luminanceThreshold={0.78} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      ) : null}
      <AdaptiveDpr />
    </Canvas>
  )
}
