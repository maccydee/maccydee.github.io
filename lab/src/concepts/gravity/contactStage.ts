// The second, smaller stage: the two link pills are static capsules standing
// on a floor. Plain shapes rain onto them when the section scrolls into view,
// and hovering or focusing a pill kicks nearby shapes away.

import Matter from 'matter-js'
import { CAT_STATIC, Scene, clamp, nextFrame, rand, staticRect, type Item } from './scene'
import { contactSpecs } from './chips'

export interface ContactStageApi {
  kick(index: number): void
  destroy(): void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function createContactStage(stage: HTMLElement, opts: { reduce: boolean; debug: boolean; nopause?: boolean }): ContactStageApi {
  const layer = stage.querySelector<HTMLElement>('[data-grv="layer"]')!
  const floorEl = stage.querySelector<HTMLElement>('[data-grv="floor3"]')!
  const pillEls = [...stage.querySelectorAll<HTMLElement>('[data-grv="link"]')]
  const cursorRoot = stage.closest<HTMLElement>('.grv')

  let scene: Scene | null = null
  let destroyed = false
  let pills: Box[] = []
  let items: Item[] = []
  let W = 0
  let builtW = 0
  let builtH = 0
  let inView = false
  let rained = false
  let resizeTimer = 0

  function build() {
    scene?.destroy()
    const sc = new Scene(stage, layer, { interactive: !opts.reduce, cursorRoot, debug: opts.debug, ignoreHidden: opts.nopause, maxY: stage.clientHeight + 300 })
    scene = sc
    const sr = stage.getBoundingClientRect()
    W = stage.clientWidth
    const H = stage.clientHeight
    builtW = W
    builtH = H
    const floorY = floorEl.getBoundingClientRect().top - sr.top

    const T = 240
    sc.setStatics('walls', [staticRect(-T, -3000, T, H + 3000 + T), staticRect(W, -3000, T, H + 3000 + T)])
    sc.setStatics('floor', [staticRect(-T, floorY, W + T * 2, T)])
    pills = pillEls.map((el) => {
      // offset* ignores the hover transform, so a pulse mid-build cannot skew the collider.
      const r = el.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const cx = r.left + r.width / 2 - sr.left
      const cy = r.top + r.height / 2 - sr.top
      return { x: cx - w / 2, y: cy - h / 2, w, h }
    })
    sc.setStatics(
      'pills',
      pills.map((p) => staticRect(p.x, p.y, p.w, p.h, { category: CAT_STATIC, chamfer: Math.min(p.h, p.w) / 2 - 1 })),
    )

    // Where a capsule ends close to a wall, square the gap off so shapes
    // cannot wedge themselves between the round end and the wall.
    const fillers: Matter.Body[] = []
    for (const p of pills) {
      const r = p.h / 2
      if (p.x < 70) fillers.push(staticRect(-40, p.y, p.x + r + 40, floorY - p.y))
      if (W - (p.x + p.w) < 70) fillers.push(staticRect(p.x + p.w - r, p.y, W - (p.x + p.w) + r + 40, floorY - p.y))
    }
    sc.setStatics('fillers', fillers)

    items = contactSpecs(W).map((s) => sc.createItem(s))
    rained = false
    if (opts.reduce) {
      items.forEach((it, i) => sc.release(it, spawnX(it, i), -60 - i * 90, { angle: rand(-0.5, 0.5), vy: 3 }))
      sc.settle()
      rained = true
    } else if (inView) {
      rain()
    }
  }

  // Spread across the width in order, with jitter, so the pile is even.
  function spawnX(item: Item, i: number): number {
    const n = Math.max(items.length, 1)
    const slot = ((i * 7) % n) / n
    const x = (slot + rand(0.02, 0.1)) * W
    return clamp(x, item.w / 2 + 12, W - item.w / 2 - 12)
  }

  function rain() {
    const sc = scene
    if (!sc || rained) return
    rained = true
    sc.clearTasks()
    let t = 80
    items.forEach((it, i) => {
      t += rand(70, 130)
      sc.schedule(t, () => {
        sc.release(it, spawnX(it, i), -it.h - rand(10, 60), {
          angle: rand(-0.8, 0.8),
          vx: rand(-1.5, 1.5),
          vy: rand(4, 9),
          spin: rand(-0.09, 0.09),
        })
      })
    })
  }

  const viewIo = new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].isIntersecting
      if (inView && scene && !opts.reduce) rain()
    },
    { threshold: 0.35 },
  )

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
  const ready = Promise.all([fonts.load('800 80px "Bricolage Grotesque Variable"'), fonts.load('500 14px "DM Mono"')]).then(() => fonts.ready)
  const timeout = new Promise((res) => window.setTimeout(res, 2500))
  Promise.race([ready, timeout])
    .catch(() => undefined)
    .then(() => {
      if (destroyed) return
      nextFrame(() => {
        if (destroyed) return
        build()
        ro.observe(stage)
        viewIo.observe(stage)
      }, opts.nopause)
    })

  return {
    kick(index: number) {
      const p = pills[index]
      if (p) scene?.burst(p)
    },
    destroy() {
      destroyed = true
      window.clearTimeout(resizeTimer)
      ro.disconnect()
      viewIo.disconnect()
      scene?.destroy()
      scene = null
    },
  }
}
