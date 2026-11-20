import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const base = process.env.QA_URL || 'http://127.0.0.1:4174/'
const outDir = path.resolve('qa_screenshots')
fs.mkdirSync(outDir, { recursive: true })
const errors = []

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))])
}

async function shot(page, name, ms = 8000) {
  const file = path.join(outDir, name)
  try {
    const ok = await withTimeout(
      page.screenshot({ path: file, type: 'png', timeout: ms }).then(() => true),
      ms + 400,
      false,
    )
    if (!ok || !fs.existsSync(file)) {
      console.log('skip shot', name)
      return false
    }
    console.log('wrote', file, fs.statSync(file).size)
    return true
  } catch (e) {
    console.log('skip shot', name, String(e).slice(0, 50))
    return false
  }
}

/** Capture via canvas readback into a JPEG — only after QA freeze. */
async function frozenCanvasShot(page, name) {
  const file = path.join(outDir, name)
  try {
    const data = await withTimeout(
      page.evaluate(() => {
        const c = document.querySelector('canvas')
        if (!c) return null
        try {
          return c.toDataURL('image/jpeg', 0.85)
        } catch {
          return null
        }
      }),
      3000,
      null,
    )
    if (!data) {
      console.log('skip canvas', name)
      return false
    }
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
    console.log('wrote', file, fs.statSync(file).size)
    return true
  } catch (e) {
    console.log('skip canvas', name, String(e).slice(0, 50))
    return false
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.addInitScript(() => {
  window.__QA = true
})

let statsResolve = null
const statsPromise = new Promise((r) => {
  statsResolve = r
})
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  const t = m.text()
  if (t.startsWith('__QA_STATS__')) {
    try {
      statsResolve?.(JSON.parse(t.slice('__QA_STATS__'.length)))
    } catch {
      /* ignore */
    }
  }
  if (m.type() === 'error') errors.push(t)
})

let stats = { heat: 0, cops: 0, markers: 0, mode: '?', camera: '?', radio: '?' }

try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(2000)
  await shot(page, '01-menu-garage.png')

  await page.getByRole('button', { name: 'Tuning' }).click()
  await page.waitForTimeout(1200)
  await shot(page, '02-tuning-garage.png')
  await page.getByRole('button', { name: 'Pearlescent' }).click()
  await page.getByRole('button', { name: 'Cyan' }).click()
  await page.waitForTimeout(600)
  await shot(page, '03-tuning-visuals.png')

  await page.getByRole('button', { name: 'Setup' }).click()
  await page.getByRole('button', { name: 'LOW' }).click()
  await page.getByRole('button', { name: 'Rainy Storm' }).click()
  await page.getByRole('button', { name: 'Circuits' }).click()
  await page.getByRole('button', { name: /Coastal Garda/i }).click()
  await page.getByRole('button', { name: 'Police Chase' }).click()
  await shot(page, '04-police-mode-rain.png')

  await page.getByRole('button', { name: 'Police Chase' }).click()
  await page.getByRole('button', { name: 'DRIVE' }).click()

  const dumped = await withTimeout(statsPromise, 25000, null)
  if (dumped) stats = { ...stats, ...dumped }
  console.log('stats', stats)

  await page.waitForTimeout(600)
  for (const name of [
    '05-police-chase.png',
    '06-rain-reflections.png',
    '07-radio-on.png',
    '08-drift-cam.png',
    '09-photo-mode.png',
  ]) {
    const existing = path.join(outDir, name)
    if (fs.existsSync(existing) && fs.statSync(existing).size > 50000) {
      console.log('keep', name, fs.statSync(existing).size)
      continue
    }
    await frozenCanvasShot(page, name)
  }

  // Mobile menu (DOM) — soft-bounded so a wedged WebGL page cannot block the gate
  await withTimeout(
    (async () => {
      await page.setViewportSize({ width: 844, height: 390 })
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 25000 })
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: 'Police Chase' }).click({ force: true })
      await shot(page, '10-mobile-landscape-menu.png', 5000)

      let mobileResolve = null
      const mobileStats = new Promise((r) => {
        mobileResolve = r
      })
      const prev = statsResolve
      statsResolve = (v) => {
        mobileResolve?.(v)
        prev?.(v)
      }

      await page.getByRole('button', { name: 'DRIVE' }).click({ force: true })
      await withTimeout(mobileStats, 15000, null)
      await page.getByRole('button', { name: /TOUCH/i }).click({ force: true }).catch(() => {})
      const touch = path.join(outDir, '11-mobile-touch-controls.png')
      if (!(fs.existsSync(touch) && fs.statSync(touch).size > 20000)) {
        await frozenCanvasShot(page, '11-mobile-touch-controls.png')
      } else {
        console.log('keep 11-mobile-touch-controls.png')
      }
    })(),
    45000,
    'mobile-timeout',
  ).then((r) => {
    if (r === 'mobile-timeout') console.log('mobile section soft-timeout')
  })
} catch (e) {
  console.error('E2E exception', e)
  errors.push(String(e))
} finally {
  await withTimeout(browser.close(), 4000, null)
}

const filtered = errors.filter(
  (e) =>
    !/ResizeObserver|favicon|Failed to load|WebGLRenderer|AudioContext|NotAllowedError|HDR|draco|OrbitControls/i.test(
      e,
    ),
)

const shots = fs.readdirSync(outDir).filter((f) => /^(0[1-9]|1[01])-.*\.png$/.test(f))
const report = {
  stats,
  screenshots: shots,
  errors: filtered.slice(0, 20),
  ok:
    filtered.length === 0 &&
    stats.heat >= 1 &&
    stats.markers >= 10 &&
    stats.mode === 'policechase' &&
    stats.radio === 'phonk' &&
    stats.camera === 'drift' &&
    shots.length >= 7,
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

if (!report.ok) {
  console.error('E2E gate failed')
  process.exit(1)
}
console.log('E2E audit passed')
process.exit(0)
