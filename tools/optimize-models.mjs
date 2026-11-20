import { execSync } from 'node:child_process'
import { readdirSync, statSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const modelsDir = join(process.cwd(), 'public', 'models')
const tmpDir = join(modelsDir, '_optimized')
mkdirSync(tmpDir, { recursive: true })

const files = readdirSync(modelsDir).filter((f) => f.endsWith('.glb'))
if (!files.length) {
  console.error('No .glb files found in public/models')
  process.exit(1)
}

for (const file of files) {
  const input = join(modelsDir, file)
  const output = join(tmpDir, file)
  const before = statSync(input).size
  console.log(`\nOptimizing ${file} (${(before / 1024).toFixed(1)} KB)...`)
  // Keep node hierarchy (Wheel_*, Collider_*, Visual_*) — do not flatten/join.
  // Mobile budget: max 1024px WebP textures for all assets.
  const texSize = 1024

  // world_map / photogrammetry: NEVER simplify — it nukes UVs into grey atlas islands
  const isWorld = file.startsWith('world_') || file.includes('city_track')
  execSync(
    [
      'npx gltf-transform optimize',
      `"${input}"`,
      `"${output}"`,
      '--compress draco',
      '--texture-compress webp',
      `--texture-size ${texSize}`,
      '--flatten false',
      '--join false',
      '--instance false',
      // prune false keeps Empty/proxy marker nodes for world maps
  isWorld ? '--simplify false --prune false' : '--simplify-ratio 0.5',
    ].join(' '),
    { stdio: 'inherit' },
  )
  const after = statSync(output).size
  renameSync(output, input)
  console.log(
    `  -> ${(after / 1024).toFixed(1)} KB (${(((before - after) / before) * 100).toFixed(1)}% smaller)`,
  )
}

console.log('\nAll models optimized (hierarchy preserved).')
