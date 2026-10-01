// The first stage spans the hero and the "see" band below it.
// The name's letters are static ledges; the shower lands on them and on the
// floor. Scrolling opens the floor, the ledges let go, and the pile pours into
// the band, where it lands again on and around the big LinkedIn capsule.
// Scrolling back to the top closes the floor and drops everything again.

import Matter from 'matter-js'
import { CAT_BODY, CAT_LEDGE, CAT_STATIC, Scene, clamp, nextFrame, rand, staticRect, type Item } from './scene'
import { letterBodies, measureInk, type Ink } from './measure'
import { heroSpecs } from './chips'

const { Composite, Body } = Matter

const MASK_ALL = CAT_STATIC | CAT_BODY | CAT_LEDGE
const MASK_THROUGH = CAT_STATIC | CAT_BODY

export interface HeroStageApi {
  dropAgain(): void
  /** Kicks bodies away from the capsule in the band (hover or focus). */
  kickSee(): void
  destroy(): void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Col {
  x: number
  weight: number
  onName: boolean
}

export function createHeroStage(stage: HTMLElement, opts: { reduce: boolean; debug: boolean; nopause?: boolean }): HeroStageApi {
  const q = <T extends HTMLElement>(sel: string) => stage.querySelector<T>(sel)
  const layer = q('[data-grv="layer"]')!
  const floorEl = q('[data-grv="floor"]')!
  const floor2El = q('[data-grv="floor2"]')!
  const seeEl = q('[data-grv="see"]')
  const readout = q('[data-grv="readout"]')
  const nameLines = [...stage.querySelectorAll<HTMLElement>('[data-grv="name"] .grv-line')]
  const cursorRoot = stage.closest<HTMLElement>('.grv')

  let scene: Scene | null = null
  let destroyed = false
  let open = false
  let floorBody: Matter.Body | null = null
  let seeBox: Box | null = null
  let cols: Col[] = []
  let colStep = 16
  let W = 0
  let builtW = 0
  let builtH = 0
  let lead: Item[] = []
  let rest: Item[] = []
  let resizeTimer = 0

  const openAt = () => Math.min(90, window.innerHeight * 0.12)

  function build() {
    scene?.destroy()
    const sc = new Scene(stage, layer, { interactive: !opts.reduce, cursorRoot, debug: opts.debug, ignoreHidden: opts.nopause, maxY: stage.clientHeight + 400 })
    scene = sc
    sc.onStats = (total, awake) => {
      if (readout) readout.textContent = `${total} bodies, ${awake} awake`
    }

    const sr = stage.getBoundingClientRect()
    W = stage.clientWidth
    const H = stage.clientHeight
    builtW = W
    builtH = H
    const floorY = floorEl.getBoundingClientRect().top - sr.top
    const floor2Y = floor2El.getBoundingClientRect().top - sr.top
    // Keep the pile out of the band the fixed design picker lives in.
    const topH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--picker-h')) || 60
    const nameInk = measureInk(nameLines, sr)

    const T = 240
    sc.setStatics('walls', [staticRect(-T, -5000, T, H + 5000 + T), staticRect(W, -5000, T, H + 5000 + T)])
    sc.setStatics('floor2', [staticRect(-T, floor2Y, W + T * 2, T)])
    // The capsule in the band is a static collider, squared off towards any
    // wall it sits close to so nothing wedges beside its round ends.
    seeBox = null
    if (seeEl) {
      // offset* ignores the hover transform, so a pulse mid-build cannot skew it.
      const r = seeEl.getBoundingClientRect()
      const w = seeEl.offsetWidth
      const h = seeEl.offsetHeight
      const box = { x: r.left + r.width / 2 - sr.left - w / 2, y: r.top + r.height / 2 - sr.top - h / 2, w, h }
      seeBox = box
      const rad = Math.min(w, h) / 2
      const bodies = [staticRect(box.x, box.y, w, h, { chamfer: rad - 1 })]
      if (box.x < 70) bodies.push(staticRect(-40, box.y, box.x + rad + 40, floor2Y - box.y))
      if (W - (box.x + w) < 70) bodies.push(staticRect(box.x + w - rad, box.y, W - (box.x + w) + rad + 40, floor2Y - box.y))
      sc.setStatics('see', bodies)
    }
    sc.setStatics('name', nameInk.flatMap((r) => letterBodies(r, CAT_LEDGE, floorY)))
    floorBody = staticRect(-T, floorY, W + T * 2, 70)

    open = !opts.reduce && window.scrollY > openAt()
    floorEl.classList.toggle('is-open', open)
    if (!open) Composite.add(sc.engine.world, floorBody)

    const { budget, fillers } = buildColumns(nameInk, floorY, topH)
    sc.setStatics('fillers', fillers)

    const specs = heroSpecs(W)
    lead = specs.lead.map((s) => sc.createItem(s))
    rest = []
    let used = lead.reduce((a, it) => a + it.area, 0)
    for (const spec of specs.rest) {
      const it = sc.createItem(spec)
      if (used + it.area > budget && rest.length >= 4) {
        sc.removeItem(it)
        continue
      }
      used += it.area
      rest.push(it)
    }

    if (opts.reduce) placeSettled()
    else shower()
  }

  /**
   * Splits the stage into columns and weights each by how deep a pile it
   * should carry: a thin layer on top of the name, more in the notch beside
   * the shorter line, most on open floor. Returns the total body area that
   * fills those piles without burying the name.
   */
  function buildColumns(ink: Ink[], floorY: number, topH: number): { budget: number; fillers: Matter.Body[] } {
    colStep = 16
    cols = []
    let topMin = floorY
    for (const r of ink) topMin = Math.min(topMin, r.y)
    // Tall, narrow screens leave more air above the name, so let the pile use more of it.
    const free = Math.max(topMin - topH, 0)
    const fill = clamp(0.28 + (free / W - 0.25) * 0.5, 0.28, 0.68)
    const base = clamp(fill * free, 50, 300)
    const tops: number[] = []
    for (let x = colStep / 2; x < W; x += colStep) {
      let top = floorY
      let onName = false
      for (const r of ink) {
        if (x >= r.x - 3 && x <= r.x + r.w + 3) {
          onName = true
          if (r.y < top) top = r.y
        }
      }
      tops.push(top)
      cols.push({ x, weight: base + 0.68 * (top - topMin), onName })
    }
    // A strip of bare floor too narrow to hold anything gets nothing, and is
    // blocked off level with the letter beside it so nothing wedges in it.
    const fillers: Matter.Body[] = []
    let i = 0
    while (i < cols.length) {
      if (cols[i].onName) {
        i++
        continue
      }
      let j = i
      while (j < cols.length && !cols[j].onName) j++
      if ((j - i) * colStep < 110) {
        for (let k = i; k < j; k++) cols[k].weight = 0
        const top = Math.min(i > 0 ? tops[i - 1] : floorY, j < cols.length ? tops[j] : floorY)
        const x0 = i === 0 ? -40 : cols[i].x - colStep
        const x1 = j >= cols.length ? W + 40 : cols[j].x + colStep / 2
        if (floorY - top > 8) fillers.push(staticRect(x0, top, x1 - x0, floorY - top, { category: CAT_LEDGE }))
      }
      i = j
    }
    const pileArea = cols.reduce((a, c) => a + c.weight * colStep, 0)
    return { budget: pileArea * 0.6, fillers }
  }

  function sampleX(item: Item): number {
    const pool = item.spec.big ? cols.filter((c) => c.onName) : cols
    const list = pool.length ? pool : cols
    let total = 0
    for (const c of list) total += c.weight
    let x = W / 2
    if (total > 0) {
      let r = Math.random() * total
      for (const c of list) {
        r -= c.weight
        if (r <= 0) {
          x = c.x + rand(-colStep / 2, colStep / 2)
          break
        }
      }
    }
    const half = Math.min(item.w, W - 32) * 0.46
    return clamp(x, half + 10, W - half - 10)
  }

  function drop(item: Item) {
    const big = !!item.spec.big
    scene?.release(item, sampleX(item), -item.h - rand(30, 90), {
      angle: big ? rand(-0.28, 0.28) : rand(-0.7, 0.7),
      vx: rand(-1.4, 1.4),
      vy: rand(5, 10),
      spin: big ? rand(-0.03, 0.03) : rand(-0.1, 0.1),
      mask: open ? MASK_THROUGH : MASK_ALL,
    })
  }

  /** Small things first in a quick patter, then the four named pills, role last. */
  function shower() {
    const sc = scene
    if (!sc) return
    sc.clearTasks()
    for (const it of sc.items) sc.hold(it)
    const small = [...rest].sort(() => Math.random() - 0.5)
    let t = 140
    for (const it of small) {
      t += rand(30, 58)
      sc.schedule(t, () => drop(it))
    }
    t += 160
    for (const it of lead) {
      t += 210
      sc.schedule(t, () => drop(it))
    }
  }

  function placeSettled() {
    const sc = scene
    if (!sc) return
    const all = [...rest, ...lead]
    all.forEach((it, i) => {
      sc.release(it, sampleX(it), -80 - i * 64, { angle: rand(-0.4, 0.4), vy: 4, mask: MASK_ALL })
    })
    sc.settle()
  }

  function setOpen(next: boolean) {
    const sc = scene
    if (!sc || !floorBody || next === open) return
    open = next
    floorEl.classList.toggle('is-open', open)
    if (open) {
      Composite.remove(sc.engine.world, floorBody)
      // Held (not yet released) bodies simply get the new mask when they drop.
      const live = sc.items.filter((it) => it.live).sort((a, b) => b.body.position.y - a.body.position.y)
      live.forEach((it, i) => {
        sc.schedule(i * 16, () => {
          if (!open || !it.live) return
          it.body.collisionFilter.mask = MASK_THROUGH
          sc.wake(it)
          const v = Body.getVelocity(it.body)
          Body.setVelocity(it.body, { x: v.x + rand(-0.9, 0.9), y: v.y + rand(0.2, 1.2) })
          Body.setAngularVelocity(it.body, rand(-0.035, 0.035))
        })
      })
      sc.wakeAll()
    } else {
      Composite.add(sc.engine.world, floorBody)
      shower()
    }
  }

  const onScroll = () => {
    if (opts.reduce || !scene) return
    const y = window.scrollY
    if (!open && y > openAt()) setOpen(true)
    else if (open && y < 12) setOpen(false)
  }

  const ro = new ResizeObserver(() => {
    if (!scene) return
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (Math.abs(w - builtW) < 1 && Math.abs(h - builtH) < 48) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!destroyed) build()
    }, 220)
  })

  const fonts = document.fonts
  const ready = Promise.all([
    fonts.load('800 80px "Bricolage Grotesque Variable"'),
    fonts.load('600 20px "Bricolage Grotesque Variable"'),
    fonts.load('500 14px "DM Mono"'),
  ]).then(() => fonts.ready)
  const timeout = new Promise((res) => window.setTimeout(res, 2500))
  Promise.race([ready, timeout])
    .catch(() => undefined)
    .then(() => {
      if (destroyed) return
      // One frame so layout reflects the loaded fonts before measuring.
      nextFrame(() => {
        if (destroyed) return
        build()
        ro.observe(stage)
        window.addEventListener('scroll', onScroll, { passive: true })
      }, opts.nopause)
    })

  return {
    dropAgain() {
      if (opts.reduce) return
      shower()
    },
    kickSee() {
      if (seeBox) scene?.burst(seeBox)
    },
    destroy() {
      destroyed = true
      window.clearTimeout(resizeTimer)
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      floorEl.classList.remove('is-open')
      scene?.destroy()
      scene = null
    },
  }
}
