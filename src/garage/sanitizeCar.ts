import * as THREE from 'three'

const WHEEL_IDS = ['FL', 'FR', 'RL', 'RR'] as const

/**
 * Strip duplicate rim piles wrongly stacked under Wheel_* empties.
 * Does not reparent body meshes (keeps world-authored local offsets intact).
 */
export function sanitizeCarClone(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true)

  WHEEL_IDS.forEach((id) => {
    const found: THREE.Object3D[] = []
    root.traverse((o: THREE.Object3D) => {
      if (o.name === `Wheel_${id}` || o.name === `Wheel_${id}.001`) {
        o.name = `Wheel_${id}`
        found.push(o)
      }
    })
    const pivot = found[0]
    if (!pivot || pivot.children.length <= 1) return

    const children = [...pivot.children]
    const keep =
      children.find((c) => /wheel|rim|tire|tyre/i.test(c.name)) ?? children[0]

    const pivotWorld = new THREE.Vector3()
    pivot.getWorldPosition(pivotWorld)

    children.forEach((ch) => {
      if (ch === keep) return
      const center = new THREE.Box3().setFromObject(ch).getCenter(new THREE.Vector3())
      if (center.distanceTo(pivotWorld) < 0.85) {
        pivot.remove(ch)
      }
    })
  })

  const kill: THREE.Object3D[] = []
  root.traverse((o: THREE.Object3D) => {
    if (/^Plane(_|$)/i.test(o.name) || /grid|shadow_catcher/i.test(o.name)) kill.push(o)
  })
  kill.forEach((o) => o.parent?.remove(o))

  return root
}

/**
 * Sketchfab / FBX cars often arrive huge or with length on Y.
 * Force ~targetLength meters along Z, upright, tires on y=0, centered XZ.
 */
export function fitPlayableCar(root: THREE.Object3D, targetLength = 4.5): void {
  root.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return

  let size = box.getSize(new THREE.Vector3())
  // Length stuck on Y → lay the car flat so forward is +Z
  if (size.y > size.x * 1.15 && size.y > size.z * 1.15) {
    root.rotation.x -= Math.PI / 2
    root.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())
  }

  const length = Math.max(size.x, size.z, 0.001)
  const scale = targetLength / length
  if (!Number.isFinite(scale) || scale <= 0) return

  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)

  const box2 = new THREE.Box3().setFromObject(root)
  if (box2.isEmpty()) return
  const c = box2.getCenter(new THREE.Vector3())
  root.position.x -= c.x
  root.position.z -= c.z
  root.position.y -= box2.min.y
  root.updateMatrixWorld(true)
}

/** Showroom uses the same normalize so garage matches Drive. */
export function fitShowroomCar(root: THREE.Object3D): void {
  fitPlayableCar(root, 4.2)
}
