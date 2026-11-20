import type { WorldMarker } from './markers'

let cached: WorldMarker[] = []

export function setWorldMarkers(markers: WorldMarker[]) {
  cached = markers
}

export function getCachedWorldMarkers(): WorldMarker[] {
  return cached
}
