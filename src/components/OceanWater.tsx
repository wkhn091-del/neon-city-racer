import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { Water } from 'three-stdlib'

/**
 * Coastal shoreline — three-stdlib Water (animated normals + sun reflections).
 * Offset so the reflective plane rings the coast instead of filling the chase cam.
 */
export function OceanWater() {
  const ref = useRef<InstanceType<typeof Water>>(null)
  const waterNormals = useLoader(THREE.TextureLoader, '/textures/waternormals.jpg')
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping

  const water = useMemo(() => {
    const mesh = new Water(new THREE.PlaneGeometry(1400, 1400), {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals,
      sunDirection: new THREE.Vector3(0.7, 0.55, 0.2).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001a2e,
      distortionScale: 3.0,
      fog: false,
    })
    mesh.rotation.x = -Math.PI / 2
    // Sit beside the South Garda circuit toward the coastal city offset
    mesh.position.set(220, -3.2, 60)
    return mesh
  }, [waterNormals])

  useFrame((_, dt) => {
    const mat = (ref.current?.material ?? water.material) as THREE.ShaderMaterial
    if (mat?.uniforms?.time) mat.uniforms.time.value += dt
  })

  return <primitive ref={ref} object={water} />
}
