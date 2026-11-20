import * as THREE from 'three'

/** Simple coastal water plane — cheap & mobile-safe. */
export function OceanWater({
  size = 1400,
  y = -1.4,
}: {
  size?: number
  y?: number
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        color="#0a3a58"
        roughness={0.18}
        metalness={0.65}
        transparent
        opacity={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
