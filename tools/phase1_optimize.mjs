import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = 'public/models'
const files = [
  'world_map.glb',
  'car_starter.glb',
  'car_muscle.glb',
  'car_super.glb',
  'car_hyper.glb',
  'traffic_sedan.glb',
  'traffic_suv.glb',
  'pedestrian.glb',
]

const outDir = path.join(root, '_opt')
fs.mkdirSync(outDir, { recursive: true })

let total = 0
for (const f of files) {
  const input = path.join(root, f)
  if (!fs.existsSync(input)) {
    console.log('SKIP', f)
    continue
  }
  const output = path.join(outDir, f)
  const before = fs.statSync(input).size
  const isWorld = f === 'world_map.glb'
  const cmd = [
    'npx --yes gltf-transform optimize',
    `"${input}"`,
    `"${output}"`,
    '--compress draco',
    '--texture-compress webp',
    '--texture-size 1024',
    '--flatten false',
    '--join false',
    '--instance false',
    isWorld ? '--simplify false --prune false' : '--simplify-ratio 0.55 --prune true',
  ].join(' ')
  console.log('OPT', f)
  try {
    execSync(cmd, { stdio: 'inherit' })
  } catch (e) {
    console.error('FAIL', f, e.message)
    continue
  }
  if (fs.existsSync(output)) {
    const after = fs.statSync(output).size
    fs.copyFileSync(output, input)
    total += after
    console.log(`  ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`)
  }
}
console.log('TOTAL_MB', (total / 1e6).toFixed(2))
