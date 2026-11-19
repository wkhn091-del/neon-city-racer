import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, PerspectiveCamera, AdaptiveDpr } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { Stage } from './Stage'
import { HeroCar } from './HeroCar'
import { Traffic } from './Traffic'
import { Pedestrians } from './Pedestrians'
import { GameCamera } from './GameCamera'
import { useGameStore } from '../store/gameStore'

function PlayerPosSync({ playerPos }: { playerPos: React.MutableRefObject<THREE.Vector3> }) {
  useFrame(() => {
    const w = window as unknown as { __playerPos?: THREE.Vector3 }
    if (w.__playerPos) playerPos.current.copy(w.__playerPos)
  })
  return null
}

export function GameCanvas() {
  const stage = useGameStore((s) => s.stage)
  const playerPos = useRef(new THREE.Vector3())

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
      }}
    >
      <color attach="background" args={['#05070d']} />
      <fog attach="fog" args={['#05070d', 50, 200]} />
      <PerspectiveCamera makeDefault fov={55} position={[0, 4, -10]} />
      <ambientLight intensity={0.28} />
      <directionalLight castShadow intensity={1.35} position={[20, 40, 10]} shadow-mapSize={[2048, 2048]} />
      <Suspense fallback={null}>
        <Environment files="/hdri/modern_buildings_night_2k.hdr" background={false} />
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <Stage stage={stage} />
          <HeroCar />
          <Traffic stage={stage} playerPos={playerPos} />
        </Physics>
        <Pedestrians stage={stage} />
        <GameCamera target={playerPos} />
        <PlayerPosSync playerPos={playerPos} />
      </Suspense>
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.35} luminanceThreshold={1.1} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
      <AdaptiveDpr />
    </Canvas>
  )
}
