export type AtmosphereId = 'midnight' | 'sunset' | 'rain'

export type AtmospherePreset = {
  id: AtmosphereId
  label: string
  hdri: string | null
  envPreset?: 'night' | 'sunset' | 'city'
  envIntensity: number
  exposure: number
  bg: string
  fogNear: number
  fogFar: number
  ambient: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  sunColor: string
  sunIntensity: number
  sunPos: [number, number, number]
  fillColor: string
  fillIntensity: number
  wetRoads: boolean
  rain: boolean
}

export const ATMOSPHERES: AtmospherePreset[] = [
  {
    id: 'midnight',
    label: 'Midnight Neon',
    hdri: '/hdri/modern_buildings_night_2k.hdr',
    envIntensity: 0.5,
    exposure: 0.95,
    bg: '#0d1524',
    fogNear: 120,
    fogFar: 700,
    ambient: 0.35,
    hemiSky: '#a8c4e8',
    hemiGround: '#121820',
    hemiIntensity: 0.55,
    sunColor: '#e8f0ff',
    sunIntensity: 1.35,
    sunPos: [90, 140, 50],
    fillColor: '#7a94c8',
    fillIntensity: 0.35,
    wetRoads: false,
    rain: false,
  },
  {
    id: 'sunset',
    label: 'Golden Sunset',
    // Drei sunset preset is more reliable than a custom HDR swap mid-session
    hdri: null,
    envPreset: 'sunset',
    envIntensity: 0.85,
    exposure: 1.15,
    bg: '#2a1810',
    fogNear: 140,
    fogFar: 780,
    ambient: 0.42,
    hemiSky: '#ffc48a',
    hemiGround: '#3a2018',
    hemiIntensity: 0.7,
    sunColor: '#ffb060',
    sunIntensity: 2.1,
    sunPos: [120, 45, -40],
    fillColor: '#6a7ab8',
    fillIntensity: 0.45,
    wetRoads: false,
    rain: false,
  },
  {
    id: 'rain',
    label: 'Rainy Storm',
    hdri: '/hdri/modern_buildings_night_2k.hdr',
    envIntensity: 0.28,
    exposure: 0.72,
    bg: '#070b12',
    fogNear: 40,
    fogFar: 320,
    ambient: 0.22,
    hemiSky: '#6a7888',
    hemiGround: '#0a0e14',
    hemiIntensity: 0.4,
    sunColor: '#9aa8b8',
    sunIntensity: 0.55,
    sunPos: [40, 180, 20],
    fillColor: '#4a6080',
    fillIntensity: 0.25,
    wetRoads: true,
    rain: true,
  },
]

export function getAtmosphere(id: AtmosphereId): AtmospherePreset {
  return ATMOSPHERES.find((a) => a.id === id) ?? ATMOSPHERES[0]
}
