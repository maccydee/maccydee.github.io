// Screenshot a design in WebKit (Safari's engine) with iPhone emulation.
// usage: node tools/wk.mjs <slug> <fractions csv> [base url] [out dir] [device name]
import { webkit, devices } from 'playwright-webkit'
import { mkdirSync } from 'node:fs'
const [slug, fr = '0', base = 'http://localhost:5199', out = 'screens', device = 'iPhone 15'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices[device] })
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message))
await page.goto(`${base}/?c=${slug}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(4500)
for (const f of fr.split(',')) {
  const frac = parseFloat(f)
  const info = await page.evaluate(async (frac) => {
    const max = document.documentElement.scrollHeight - innerHeight
    const target = Math.round(max * frac), start = scrollY, steps = 24
    for (let i = 1; i <= steps; i++) { window.scrollTo(0, start + ((target - start) * i) / steps); await new Promise((r) => setTimeout(r, 40)) }
    return { y: scrollY, max, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight }
  }, frac)
  await page.waitForTimeout(1800)
  const file = `${out}/${slug}-webkit-${String(Math.round(frac * 100)).padStart(3, '0')}.png`
  await page.screenshot({ path: file, scale: 'css' })
  console.log(file, JSON.stringify(info))
}
console.log('ERRORS', JSON.stringify(errs.slice(0, 12)))
await browser.close()
