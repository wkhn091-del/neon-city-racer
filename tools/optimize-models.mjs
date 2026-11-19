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
  execSync(
    [
      'npx gltf-transform optimize',
      `"${input}"`,
      `"${output}"`,
      '--compress draco',
      '--texture-compress webp',
      '--texture-size 2048',
      '--flatten false',
      '--join false',
      '--instance false',
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
