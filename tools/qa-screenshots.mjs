import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.env.QA_URL || 'http://127.0.0.1:5175/'

async function grabCanvas(page, file) {
  const data = await page.evaluate(() => window.__gl?.domElement?.toDataURL('image/png'))
  if (!data) throw new Error(`No canvas data for ${file}`)
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
  console.log('wrote', file, fs.statSync(file).size)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('button', { name: 'DRIVE' }).waitFor({ timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: 'qa-desktop-garage.png' })
await page.getByRole('button', { name: 'Setup' }).click()
await page.getByRole('button', { name: 'LOW' }).click()
await page.getByRole('button', { name: 'DRIVE' }).click()
await page.waitForTimeout(12000)
await grabCanvas(page, 'qa-desktop-gameplay.png')

await page.getByRole('button', { name: 'MENU' }).click()
await page.waitForTimeout(2500)

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'qa-mobile-garage.png' })
await page.getByRole('button', { name: 'DRIVE' }).click()
await page.waitForTimeout(10000)
await grabCanvas(page, 'qa-mobile-gameplay.png')

await browser.close()
console.log('QA screenshots done')
