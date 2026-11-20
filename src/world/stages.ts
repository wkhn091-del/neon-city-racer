/**
 * Stage catalog — every map GLB is one stage.
 * Burnout Revenge maps ship upside-down in glTF — use rotX: Math.PI before normalize.
 */
export type StageId = 'eternal_city' | 'eastern_bay' | 'monza'

export type StageDef = {
  id: StageId
  name: string
  subtitle: string
  series: string
  modelUrl: string
  targetSize: number
  /** Extra root rotation (radians) applied before grounding — fixes inverted Sketchfab/FBX */
  rotX: number
  /** Spawn / lap oval ON the asphalt ring after normalize */
  track: { cx: number; cz: number; rx: number; rz: number; y: number }
}

export const STAGE_LIST: StageDef[] = [
  {
    id: 'eternal_city',
    name: 'Eternal City',
    subtitle: 'Yokohama Neon District',
    series: 'Night Circuit',
    modelUrl: '/models/world_map.glb',
    targetSize: 600,
    rotX: 0,
    track: { cx: 0, cz: 0, rx: 180, rz: 160, y: 0.05 },
  },
  {
    id: 'eastern_bay',
    name: 'Eastern Bay',
    subtitle: 'Lower Link Circuit',
    series: 'Burnout Revenge',
    modelUrl: '/models/stage_eastern_bay.glb',
    targetSize: 500,
    rotX: Math.PI,
    track: { cx: 0, cz: 0, rx: 175, rz: 130, y: 0.05 },
  },
  {
    id: 'monza',
    name: 'Monza',
    subtitle: '1998 Layout',
    series: 'Historic F1',
    modelUrl: '/models/stage_monza.glb',
    targetSize: 620,
    rotX: 0,
    track: { cx: 0, cz: 0, rx: 200, rz: 95, y: 0.05 },
  },
]

export const STAGES: Record<StageId, StageDef> = Object.fromEntries(
  STAGE_LIST.map((s) => [s.id, s]),
) as Record<StageId, StageDef>

export const DEFAULT_STAGE: StageId = 'eternal_city'

export function getStageDef(id: StageId): StageDef {
  return STAGES[id] ?? STAGES[DEFAULT_STAGE]
}

export function isStageId(value: string): value is StageId {
  return value in STAGES
}
