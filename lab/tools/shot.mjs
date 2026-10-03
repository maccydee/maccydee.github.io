// Screenshot a design in headless Chrome (system Chrome, real GPU).
// usage: node tools/shot.mjs <slug> <device|WxH> <fractions csv> [base url] [out dir]
//   device: "iphone" (iPhone 15, DPR 3, touch, Safari UA) or e.g. "1440x900"
// Writes <out>/<slug>-<device>-<pct>.png and prints scroll width and console errors.
import puppeteer, { KnownDevices } from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const [slug, device = '1440x900', fr = '0', base = 'http://localhost:5199', out = 'screens'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
})
const page = await browser.newPage()
if (device === 'iphone') await page.emulate(KnownDevices['iPhone 15'])
else { const [w, h] = device.split('x').map(Number); await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 }) }
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
await page.goto(`${base}/?c=${slug}`, { waitUntil: 'networkidle2' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(4500)
for (const f of fr.split(',')) {
  const frac = parseFloat(f)
  const info = await page.evaluate(async (frac) => {
    const max = document.documentElement.scrollHeight - innerHeight
    const target = Math.round(max * frac), start = scrollY, steps = 24
    for (let i = 1; i <= steps; i++) { window.scrollTo(0, start + ((target - start) * i) / steps); await new Promise((r) => setTimeout(r, 40)) }
    return { y: scrollY, max, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight }
  }, frac)
  await sleep(1800)
  const file = `${out}/${slug}-${device}-${String(Math.round(frac * 100)).padStart(3, '0')}.png`
  await page.screenshot({ path: file })
  console.log(file, JSON.stringify(info))
}
console.log('ERRORS', JSON.stringify(errs.slice(0, 12)))
await browser.close()
