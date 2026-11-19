import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody, MeshCollider } from '@react-three/rapier'
import * as THREE from 'three'
import type { StageId } from '../store/gameStore'

const STAGE_URL: Record<StageId, string> = {
  stage1: '/models/stage1_city.glb',
  stage2: '/models/stage2_canyon.glb',
}

useGLTF.preload('/models/stage1_city.glb')
useGLTF.preload('/models/stage2_canyon.glb')

export function Stage({ stage }: { stage: StageId }) {
  const { scene } = useGLTF(STAGE_URL[stage])

  const { colliderMeshes, visual } = useMemo(() => {
    scene.updateMatrixWorld(true)
    const colliderMeshes: THREE.Mesh[] = []

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || !mesh.name.startsWith('Collider_')) return
      const geom = mesh.geometry.clone()
      geom.applyMatrix4(mesh.matrixWorld)
      geom.computeVertexNormals()
      const baked = new THREE.Mesh(geom, mesh.material)
      baked.name = mesh.name
      baked.castShadow = false
      baked.receiveShadow = true
      colliderMeshes.push(baked)
    })

    const visual = scene.clone(true)
    visual.traverse((obj) => {
      if (obj.name.startsWith('Collider_')) {
        obj.visible = false
      } else if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    return { colliderMeshes, visual }
  }, [scene])

  return (
    <group>
      {/* Safety ground so the car never falls forever if trimesh fails */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -5, 0]} friction={1.2}>
        <mesh visible={false}>
          <boxGeometry args={[500, 2, 500]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {colliderMeshes.map((mesh) => (
        <RigidBody key={mesh.uuid} type="fixed" colliders={false} friction={1.4} restitution={0.02}>
          <MeshCollider type="trimesh">
            <primitive object={mesh} />
          </MeshCollider>
        </RigidBody>
      ))}

      <primitive object={visual} />
    </group>
  )
}
