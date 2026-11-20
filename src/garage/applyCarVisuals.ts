import * as THREE from 'three'
import { PAINT_COLORS, type PaintId } from '../store/gameStore'
import {
  UNDERGLOW_OPTIONS,
  type CarVisuals,
  type PaintFinish,
  type UnderglowId,
} from './tuning'

const FINISH: Record<
  PaintFinish,
  { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number; iridescence: number }
> = {
  gloss: { metalness: 0.88, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 0 },
  matte: { metalness: 0.25, roughness: 0.88, clearcoat: 0, clearcoatRoughness: 1, iridescence: 0 },
  pearl: { metalness: 0.55, roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18, iridescence: 1 },
  chrome: { metalness: 1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0 },
}

function isPaintMesh(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial) {
  const n = mesh.name.toLowerCase()
  const mn = (mat.name ?? '').toLowerCase()
  if (mesh.name === 'Body' || n.includes('body') || n.includes('paint') || n.includes('carpaint')) return true
  if (mn.includes('paint') || mn.includes('body') || mn.includes('carpaint') || mn.includes('lacquer')) return true
  return false
}

function isGlassMesh(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial) {
  const n = `${mesh.name} ${mat.name ?? ''}`.toLowerCase()
  return /glass|window|windshield|windscreen|visor|transparent/.test(n)
}

function isRimMesh(mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial) {
  const n = `${mesh.name} ${mat.name ?? ''}`.toLowerCase()
  if (/tyre|tire|rubber|tread/.test(n)) return false
  return /rim|wheel|alloy|hub|spoke|disc/.test(n)
}

function ensurePhysical(mat: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  if ((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return mat as THREE.MeshPhysicalMaterial
  const phys = new THREE.MeshPhysicalMaterial()
  phys.color.copy(mat.color)
  phys.map = mat.map
  phys.normalMap = mat.normalMap
  phys.roughnessMap = mat.roughnessMap
  phys.metalnessMap = mat.metalnessMap
  phys.aoMap = mat.aoMap
  phys.emissive.copy(mat.emissive)
  phys.emissiveMap = mat.emissiveMap
  phys.metalness = mat.metalness
  phys.roughness = mat.roughness
  phys.envMapIntensity = mat.envMapIntensity
  phys.transparent = mat.transparent
  phys.opacity = mat.opacity
  phys.side = mat.side
  phys.name = mat.name
  return phys
}

export function underglowColor(id: UnderglowId): THREE.Color | null {
  if (id === 'off') return null
  const opt = UNDERGLOW_OPTIONS.find((o) => o.id === id)
  return opt ? new THREE.Color(opt.color) : null
}

/** Live material pass for body finish, rims, and glass tint. */
export function applyCarVisuals(
  root: THREE.Object3D,
  visuals: CarVisuals,
  paintId: PaintId = 'crimson',
) {
  const paintColor = new THREE.Color(PAINT_COLORS[paintId])
  const finish = FINISH[visuals.finish]
  const rimColor = new THREE.Color().setHSL(visuals.rimHue, 0.65, 0.42)
  const tint = visuals.windowTint

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = mats.map((raw) => {
      const base = raw as THREE.MeshStandardMaterial
      if (!base?.isMeshStandardMaterial && !(base as THREE.MeshPhysicalMaterial)?.isMeshPhysicalMaterial) {
        return raw
      }

      if (isGlassMesh(mesh, base)) {
        const glass = ensurePhysical(base)
        glass.transparent = true
        glass.opacity = Math.max(0.12, 1 - tint * 0.9)
        glass.color.setRGB(0.05 + (1 - tint) * 0.15, 0.08 + (1 - tint) * 0.18, 0.1 + (1 - tint) * 0.2)
        glass.metalness = 0.05
        glass.roughness = 0.05
        glass.transmission = Math.max(0, 0.55 - tint * 0.45)
        glass.thickness = 0.4
        glass.envMapIntensity = 1.4
        glass.depthWrite = tint < 0.55
        glass.needsUpdate = true
        return glass
      }

      if (isRimMesh(mesh, base)) {
        const rim = ensurePhysical(base)
        rim.color.copy(rimColor)
        rim.metalness = 0.95
        rim.roughness = 0.28
        rim.clearcoat = 0.6
        rim.clearcoatRoughness = 0.2
        rim.needsUpdate = true
        return rim
      }

      if (isPaintMesh(mesh, base)) {
        const body = ensurePhysical(base)
        body.color.copy(paintColor)
        body.metalness = finish.metalness
        body.roughness = finish.roughness
        body.clearcoat = finish.clearcoat
        body.clearcoatRoughness = finish.clearcoatRoughness
        if ('iridescence' in body) {
          body.iridescence = finish.iridescence
          body.iridescenceIOR = 1.3
          body.iridescenceThicknessRange = [100, 400]
        }
        body.envMapIntensity = visuals.finish === 'chrome' ? 2.4 : 1.6
        body.needsUpdate = true
        return body
      }

      return raw
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
