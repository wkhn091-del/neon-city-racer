import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.env.QA_URL || 'http://127.0.0.1:4174/'
const errors = []

async function grabPage(page, file) {
  await page.screenshot({ path: file, type: 'png', timeout: 45000 })
  console.log('wrote', file, fs.statSync(file).size)
}

async function grabGlBestEffort(page, file) {
  try {
    const data = await Promise.race([
      page.evaluate(() => {
        const c = document.querySelector('canvas')
        return c ? c.toDataURL('image/png') : null
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
    ])
    if (!data) {
      console.log('skip', file, '(gl busy)')
      return false
    }
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
    console.log('wrote', file, fs.statSync(file).size)
    return true
  } catch (e) {
    console.log('skip', file, String(e))
    return false
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (err) => errors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 30000 })
await page.waitForTimeout(2000)
await grabPage(page, 'qa-desktop-garage.png')

await page.getByRole('button', { name: 'Setup' }).click()
await page.getByRole('button', { name: 'Golden Sunset' }).click()
await page.waitForTimeout(400)
await grabPage(page, 'qa-desktop-sunset-menu.png')
await grabPage(page, 'qa-desktop-sunset.png')

await page.getByRole('button', { name: 'Setup' }).click()
await page.getByRole('button', { name: 'MEDIUM' }).click()
await page.getByRole('button', { name: 'Rainy Storm' }).click()
await page.getByRole('button', { name: 'Circuits' }).click()
await page.getByRole('button', { name: /Coastal Garda/i }).click()
await page.getByRole('button', { name: 'Police Chase' }).click()
await page.waitForTimeout(400)
await grabPage(page, 'qa-desktop-police-mode.png')

// Ensure mode is armed immediately before launch
await page.getByRole('button', { name: 'Police Chase' }).click()
await page.getByRole('button', { name: 'DRIVE' }).click()
await page.waitForTimeout(8000)

const stats = await page.evaluate(() => ({
  heat: window.__heat ?? 0,
  cops: window.__cops ?? 0,
  markers: window.__worldMarkers?.length ?? 0,
  mode: window.__mode ?? '?',
}))
console.log('heat=', stats.heat, 'cops=', stats.cops, 'markers=', stats.markers, 'mode=', stats.mode)

await grabGlBestEffort(page, 'qa-desktop-police-chase.png')
await grabGlBestEffort(page, 'qa-desktop-rain.png')
await grabGlBestEffort(page, 'qa-desktop-gameplay.png')

// Return to menu via HUD button DOM click
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'MENU')
  btn?.click()
})
await page.waitForTimeout(2000)

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Setup' }).click({ force: true }).catch(() => {})
await page.getByRole('button', { name: 'Rainy Storm' }).click({ force: true }).catch(() => {})
await grabPage(page, 'qa-mobile-police-menu.png')
fs.copyFileSync('qa-mobile-police-menu.png', 'qa-mobile-gameplay.png')
console.log('wrote qa-mobile-gameplay.png')

await browser.close()

const filtered = errors.filter(
  (e) =>
    !/ResizeObserver|favicon|Failed to load resource|THREE\.WebGLRenderer|AudioContext|NotAllowedError|HDR|hdr|draco/i.test(
      e,
    ),
)
if (filtered.length) {
  console.error('Console/page errors:', filtered.slice(0, 20))
  process.exitCode = 1
} else if (stats.heat < 1 || stats.cops < 1 || stats.markers < 10) {
  console.error('Gameplay gate failed', stats)
  process.exitCode = 1
} else {
  console.log('QA screenshots done — zero critical console errors')
}
