import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.env.QA_URL || 'http://127.0.0.1:5175/'
const errors = []

async function grabCanvas(page, file) {
  const data = await page.evaluate(() => window.__gl?.domElement?.toDataURL('image/png'))
  if (!data) throw new Error(`No canvas data for ${file}`)
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
  console.log('wrote', file, fs.statSync(file).size)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (err) => errors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'qa-desktop-garage.png' })

// Phase 7 — Tuning tab + visual customization
await page.getByRole('button', { name: 'Tuning' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'qa-desktop-tuning.png' })

await page.getByRole('button', { name: 'Pearlescent' }).click()
await page.getByRole('button', { name: 'Cyan' }).click()
await page.locator('.slider-row input[type="range"]').nth(0).fill('0.72')
await page.locator('.slider-row input[type="range"]').nth(1).fill('0.55')
await page.waitForTimeout(800)
await page.screenshot({ path: 'qa-desktop-tuning-visuals.png' })

// Seed cash + upgrade engine if owned starter
await page.evaluate(() => {
  const key = 'neon-city-racer-garage-v3'
  const raw = localStorage.getItem(key)
  const data = raw ? JSON.parse(raw) : null
  if (data) {
    data.cash = Math.max(data.cash ?? 0, 50000)
    localStorage.setItem(key, JSON.stringify(data))
  }
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Tuning' }).click()
await page.waitForTimeout(1500)
const upgradeBtn = page.locator('.tuning-buy').first()
if (await upgradeBtn.isEnabled()) {
  await upgradeBtn.click()
  await page.waitForTimeout(400)
}
await page.screenshot({ path: 'qa-desktop-tuning-upgraded.png' })

await page.getByRole('button', { name: 'Setup' }).click()
await page.getByRole('button', { name: 'LOW' }).click()
await page.getByRole('button', { name: 'DRIVE' }).click()
await page.waitForTimeout(12000)
await grabCanvas(page, 'qa-desktop-gameplay.png')

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 30000 })
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Tuning' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'qa-mobile-tuning.png' })
await page.getByRole('button', { name: 'DRIVE' }).click()
await page.waitForTimeout(10000)
await grabCanvas(page, 'qa-mobile-gameplay.png')

await browser.close()

const filtered = errors.filter(
  (e) =>
    !/ResizeObserver|favicon|Failed to load resource|THREE\.WebGLRenderer/.test(e) &&
    !/AudioContext|NotAllowedError/.test(e),
)
if (filtered.length) {
  console.error('Console/page errors:', filtered.slice(0, 20))
  process.exitCode = 1
} else {
  console.log('QA screenshots done — zero critical console errors')
}
