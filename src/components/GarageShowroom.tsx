import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CARS, getCar } from '../garage/cars'
import { fitShowroomCar } from '../garage/sanitizeCar'
import { applyCarVisuals, underglowColor } from '../garage/applyCarVisuals'
import { useGarageStore } from '../store/garageStore'
import { useGameStore } from '../store/gameStore'
import type { CarSetup } from '../garage/tuning'

function prepareShowroomClone(scene: THREE.Object3D) {
  const c = scene.clone(true)
  c.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    m.visible = true
    if (/^Plane/i.test(m.name) && new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).x > 8) {
      m.visible = false
      return
    }
    if (!m.material) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    m.material = mats.map((mat) => {
      const cloned = mat.clone() as THREE.MeshStandardMaterial
      cloned.visible = true
      cloned.transparent = false
      if ('opacity' in cloned) cloned.opacity = 1
      if ('envMapIntensity' in cloned) cloned.envMapIntensity = 1.8
      if ('roughness' in cloned && typeof cloned.roughness === 'number') {
        cloned.roughness = Math.min(Math.max(cloned.roughness, 0.1), 0.55)
      }
      if ('metalness' in cloned && typeof cloned.metalness === 'number') {
        cloned.metalness = Math.min(cloned.metalness, 0.95)
      }
      if (cloned.color) {
        const hsl = { h: 0, s: 0, l: 0 }
        cloned.color.getHSL(hsl)
        if (hsl.l < 0.06) cloned.color.setHSL(hsl.h, hsl.s, 0.14)
      }
      return cloned
    })
  })
  fitShowroomCar(c)
  return c
}

function ShowroomUnderglow({ setup }: { setup: CarSetup }) {
  const color = underglowColor(setup.underglow)
  const lightRef = useRef<THREE.PointLight>(null)
  const discRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 3.2) * 0.15
    if (lightRef.current) lightRef.current.intensity = color ? 6.5 * pulse : 0
    if (discRef.current) {
      const mat = discRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = color ? 0.45 * pulse : 0
      discRef.current.visible = !!color
    }
  })

  if (!color) return null

  return (
    <group position={[0, 0.04, 0]}>
      <pointLight ref={lightRef} color={color} intensity={6.5} distance={7} decay={2} castShadow={false} />
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[1.65, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

function ShowroomCar({ url, setup }: { url: string; setup: CarSetup }) {
  const { scene } = useGLTF(url)
  const paint = useGameStore((s) => s.paint)
  const clone = useMemo(() => prepareShowroomClone(scene), [scene, url])
  const spin = useRef(0)

  useEffect(() => {
    applyCarVisuals(clone, setup, paint)
  }, [clone, setup, paint])

  useFrame((_, dt) => {
    spin.current += dt * 0.28
    clone.rotation.y = spin.current
  })

  return (
    <group>
      <primitive object={clone} />
      <ShowroomUnderglow setup={setup} />
    </group>
  )
}

function ShowroomLights() {
  return (
    <>
      <ambientLight intensity={1.3} />
      <hemisphereLight args={['#f5f8ff', '#403848', 1.8]} />
      <spotLight
        position={[5, 9, 5]}
        intensity={8}
        angle={0.55}
        penumbra={0.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
        color="#fff6ea"
      />
      <spotLight position={[-6, 6, 3]} intensity={4.2} angle={0.75} penumbra={0.85} color="#a8c8ff" />
      <spotLight position={[0, 5, -8]} intensity={6.5} angle={0.5} penumbra={0.6} color="#7ec8ff" />
      <pointLight position={[0, 4.5, 2]} intensity={3.8} distance={24} color="#ffffff" />
      <directionalLight position={[3, 12, 5]} intensity={2.6} color="#ffffff" />
    </>
  )
}

function ReflectiveFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#2a3344" metalness={0.92} roughness={0.12} envMapIntensity={2.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[3.2, 3.35, 64]} />
        <meshBasicMaterial color="#3de0ff" transparent opacity={0.55} />
      </mesh>
    </group>
  )
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

function GarageEnvironment() {
  return (
    <EnvBoundary fallback={<Environment preset="city" background environmentIntensity={1.25} />}>
      <Suspense fallback={<Environment preset="city" background environmentIntensity={1.2} />}>
        <Environment files="/hdri/modern_buildings_night_2k.hdr" background environmentIntensity={1.2} />
      </Suspense>
    </EnvBoundary>
  )
}

function CameraRig() {
  const { camera } = useThree()
  useFrame(() => {
    camera.position.lerp(new THREE.Vector3(4.8, 2.0, 6.0), 0.12)
    camera.lookAt(0, 0.9, 0)
  })
  return null
}

export function GarageShowroom() {
  const previewCar = useGarageStore((s) => s.previewCar)
  const setup = useGarageStore((s) => s.setups[previewCar])
  const car = getCar(previewCar)

  return (
    <div className="garage-canvas">
      <Canvas
        key={previewCar}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [4.8, 2.0, 6.0], fov: 38, near: 0.1, far: 80 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMappingExposure = 1.7
          ;(window as unknown as { __gl?: THREE.WebGLRenderer }).__gl = gl
        }}
      >
        <color attach="background" args={['#0e1624']} />
        <ShowroomLights />
        <Suspense fallback={null}>
          <GarageEnvironment />
          <ShowroomCar url={car.modelUrl} setup={setup} />
          <ReflectiveFloor />
          <ContactShadows position={[0, 0.01, 0]} opacity={0.7} scale={14} blur={2.6} far={8} />
          <CameraRig />
        </Suspense>
      </Canvas>
    </div>
  )
}

CARS.forEach((c) => useGLTF.preload(c.modelUrl))
