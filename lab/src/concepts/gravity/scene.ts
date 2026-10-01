// A small physics scene: matter-js simulates, real DOM elements render.
// One rAF loop with a fixed timestep; the loop stops itself when every body
// is asleep, when the scene is off screen, or when the tab is hidden.

import Matter from 'matter-js'

const { Engine, Composite, Bodies, Body, Constraint, Sleeping } = Matter

export const CAT_STATIC = 0x0001
export const CAT_BODY = 0x0002
/** Static colliders that can be switched off per body (the hero name). */
export const CAT_LEDGE = 0x0004

const STEP = 1000 / 120
const MAX_STEPS = 6
const MAX_SPEED = 42 // px per 60 Hz frame
const NUDGE_RADIUS = 64

export type Tone = 'cobalt' | 'tomato' | 'marigold' | 'ink' | 'paper' | 'sand'
export type ShapeKind = 'pill' | 'circle' | 'ring' | 'square' | 'half' | 'quarter'

export interface ItemSpec {
  shape: ShapeKind
  tone: Tone
  /** Text pills only. Must come from content.ts. */
  text?: string
  /** Extra modifier class: role, discipline. */
  variant?: string
  /** Plain shapes only: bounding width in px. */
  size?: number
  /** Wide pills that should be released over the name rather than a gutter. */
  big?: boolean
}

export interface Item {
  spec: ItemSpec
  el: HTMLDivElement
  body: Matter.Body
  w: number
  h: number
  /** Offset from the element's top-left corner to the body's centre of mass. */
  ox: number
  oy: number
  area: number
  live: boolean
  wasAsleep: boolean
}

export interface ReleaseOpts {
  angle?: number
  vx?: number
  vy?: number
  spin?: number
  mask?: number
}

interface SceneOpts {
  /** false gives a static, non-draggable arrangement (reduced motion). */
  interactive: boolean
  /** Element that takes the is-grabbing class while a body is held. */
  cursorRoot?: HTMLElement | null
  debug?: boolean
  /** Bodies that fall below this y are put back at the top. */
  maxY?: number
  /**
   * Test hook for background tabs, where rAF is throttled to a crawl: keep
   * simulating while hidden, add a timer fallback and catch up in real time.
   */
  ignoreHidden?: boolean
}

export function staticRect(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { category?: number; chamfer?: number | number[] } = {},
): Matter.Body {
  const body = Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
    isStatic: true,
    friction: 0.6,
    restitution: 0.2,
    chamfer: opts.chamfer ? { radius: opts.chamfer } : undefined,
    collisionFilter: { category: opts.category ?? CAT_STATIC, mask: 0xffff, group: 0 },
  })
  // Uneven chamfers move the centroid; put the bounds back where asked.
  const dx = x - body.bounds.min.x
  const dy = y - body.bounds.min.y
  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    Body.setPosition(body, { x: body.position.x + dx, y: body.position.y + dy })
  }
  return body
}

/** Runs fn on the next frame, or straight away in the background-tab test mode. */
export function nextFrame(fn: () => void, immediate = false) {
  if (immediate) window.setTimeout(fn, 0)
  else requestAnimationFrame(fn)
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export class Scene {
  readonly engine: Matter.Engine
  readonly items: Item[] = []
  onStats: ((total: number, awake: number) => void) | null = null

  private statics = new Map<string, Matter.Body[]>()
  private debugEls = new Map<string, HTMLElement[]>()
  private byEl = new WeakMap<Element, Item>()
  private tasks: { at: number; fn: () => void }[] = []
  private clock = 0
  private raf = 0
  private timer = 0
  private last = 0
  private acc = 0
  private visible = true
  private dead = false
  private rect: DOMRect
  private drag: { item: Item; constraint: Matter.Constraint; id: number; cx: number; cy: number } | null = null
  private ptr = { x: 0, y: 0, vx: 0, vy: 0, t: -1e9, has: false }
  /** Pointer positions seen since the last step, so a fast flick is not missed. */
  private trail: { x: number; y: number }[] = []
  private io: IntersectionObserver
  private statTotal = -1
  private statAwake = -1
  private tick = 0

  constructor(
    private root: HTMLElement,
    private layer: HTMLElement,
    private opts: SceneOpts,
  ) {
    this.engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 })
    this.engine.gravity.scale = 0.0016
    this.rect = root.getBoundingClientRect()

    if (opts.interactive) {
      layer.addEventListener('pointerdown', this.onDown)
      layer.addEventListener('mousedown', this.onMouseDown)
      window.addEventListener('pointermove', this.onMove, { passive: true })
      window.addEventListener('pointerup', this.onUp)
      window.addEventListener('pointercancel', this.onUp)
      window.addEventListener('blur', this.onBlur)
    }
    layer.classList.toggle('is-static', !opts.interactive)
    document.addEventListener('visibilitychange', this.onVis)
    this.io = new IntersectionObserver(
      (entries) => {
        this.visible = entries[entries.length - 1].isIntersecting
        if (this.visible) this.kick()
      },
      { rootMargin: '80px 0px' },
    )
    this.io.observe(root)
    if (opts.debug) {
      const w = window as unknown as { __grv?: Scene[] }
      ;(w.__grv ??= []).push(this)
    }
  }

  /* ---------- items ---------- */

  createItem(spec: ItemSpec): Item {
    const el = document.createElement('div')
    el.className = `grv-b grv-b--${spec.shape} grv-t--${spec.tone}${spec.variant ? ` grv-b--${spec.variant}` : ''}`
    if (spec.text) el.textContent = spec.text
    if (spec.size) {
      const s = Math.round(spec.size)
      el.style.width = `${s}px`
      el.style.height = `${spec.shape === 'half' ? Math.round(s / 2) : s}px`
      if (spec.shape === 'ring') el.style.borderWidth = `${Math.max(6, Math.round(s * 0.23))}px`
    }
    el.style.visibility = 'hidden'
    this.layer.appendChild(el)
    const w = el.offsetWidth
    const h = el.offsetHeight

    const common: Matter.IBodyDefinition = {
      friction: 0.45,
      frictionStatic: 0.7,
      frictionAir: 0.012,
      density: 0.0012,
      sleepThreshold: 50,
      collisionFilter: { category: CAT_BODY, mask: CAT_STATIC | CAT_BODY | CAT_LEDGE, group: 0 },
    }
    let body: Matter.Body
    let area = w * h
    switch (spec.shape) {
      case 'circle':
      case 'ring':
        body = Bodies.circle(0, 0, w / 2, { ...common, restitution: 0.52, frictionAir: 0.009 })
        area = Math.PI * (w / 2) ** 2
        break
      case 'square':
        body = Bodies.rectangle(0, 0, w, h, { ...common, restitution: 0.3, chamfer: { radius: w * 0.2 } })
        break
      case 'half': {
        const r = w / 2
        const pts: Matter.Vector[] = []
        for (let i = 0; i <= 14; i++) {
          const a = Math.PI + (Math.PI * i) / 14
          pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
        }
        body = Bodies.fromVertices(0, 0, [pts], { ...common, restitution: 0.36 })
        area = (Math.PI * r * r) / 2
        break
      }
      case 'quarter': {
        const pts: Matter.Vector[] = [{ x: 0, y: 0 }]
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 2 + ((Math.PI / 2) * i) / 10
          pts.push({ x: w * Math.cos(a), y: w * Math.sin(a) })
        }
        body = Bodies.fromVertices(0, 0, [pts], { ...common, restitution: 0.36 })
        area = (Math.PI * w * w) / 4
        break
      }
      default:
        body = Bodies.rectangle(0, 0, w, h, { ...common, restitution: 0.3, chamfer: { radius: h / 2 - 0.5 } })
        area = w * h - (h * h * (4 - Math.PI)) / 4
    }
    const ox = body.position.x - body.bounds.min.x
    const oy = body.position.y - body.bounds.min.y
    el.style.transformOrigin = `${ox.toFixed(2)}px ${oy.toFixed(2)}px`

    const item: Item = { spec, el, body, w, h, ox, oy, area, live: false, wasAsleep: false }
    this.items.push(item)
    this.byEl.set(el, item)
    return item
  }

  removeItem(item: Item) {
    this.hold(item)
    item.el.remove()
    const i = this.items.indexOf(item)
    if (i >= 0) this.items.splice(i, 1)
  }

  release(item: Item, x: number, y: number, o: ReleaseOpts = {}) {
    const b = item.body
    if (o.mask !== undefined) b.collisionFilter.mask = o.mask
    Sleeping.set(b, false)
    Body.setPosition(b, { x, y })
    Body.setAngle(b, o.angle ?? 0)
    Body.setVelocity(b, { x: o.vx ?? 0, y: o.vy ?? 0 })
    Body.setAngularVelocity(b, o.spin ?? 0)
    if (!item.live) {
      Composite.add(this.engine.world, b)
      item.live = true
    }
    item.el.style.visibility = 'visible'
    this.sync(item)
    this.kick()
  }

  hold(item: Item) {
    if (this.drag?.item === item) this.endDrag()
    if (item.live) {
      Composite.remove(this.engine.world, item.body)
      item.live = false
    }
    item.el.style.visibility = 'hidden'
  }

  wake(item: Item) {
    if (item.live) Sleeping.set(item.body, false)
  }

  wakeAll() {
    for (const it of this.items) if (it.live) Sleeping.set(it.body, false)
    this.kick()
  }

  /* ---------- static colliders ---------- */

  setStatics(name: string, bodies: Matter.Body[]) {
    this.removeStatics(name)
    this.statics.set(name, bodies)
    Composite.add(this.engine.world, bodies)
    if (this.opts.debug) {
      const els = bodies.map((b) => {
        const d = document.createElement('div')
        d.className = 'grv-dbg'
        d.style.left = `${b.bounds.min.x}px`
        d.style.top = `${b.bounds.min.y}px`
        d.style.width = `${b.bounds.max.x - b.bounds.min.x}px`
        d.style.height = `${b.bounds.max.y - b.bounds.min.y}px`
        this.layer.appendChild(d)
        return d
      })
      this.debugEls.set(name, els)
    }
  }

  removeStatics(name: string) {
    const old = this.statics.get(name)
    if (old) {
      for (const b of old) Composite.remove(this.engine.world, b)
      this.statics.delete(name)
    }
    this.debugEls.get(name)?.forEach((d) => d.remove())
    this.debugEls.delete(name)
  }

  /* ---------- scheduling ---------- */

  /** Runs fn after `delay` ms of scene time (the clock stops while paused). */
  schedule(delay: number, fn: () => void) {
    this.tasks.push({ at: this.clock + delay, fn })
    this.kick()
  }

  clearTasks() {
    this.tasks.length = 0
  }

  /* ---------- loop ---------- */

  kick() {
    if (this.raf || this.dead || !this.opts.interactive) return
    if (!this.visible || this.tabHidden()) return
    this.last = performance.now()
    this.request()
  }

  private request() {
    if (!this.opts.ignoreHidden) {
      this.raf = requestAnimationFrame(this.frame)
      return
    }
    // Test hook only: background tabs starve rAF and throttle timers, so spin
    // a message channel until a frame's worth of time has passed.
    this.raf = -1
    const token = ++this.timer
    const due = performance.now() + 15
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      if (token !== this.timer || this.dead) return ch.port1.close()
      if (performance.now() >= due) {
        ch.port1.close()
        this.frame(performance.now())
      } else {
        ch.port2.postMessage(0)
      }
    }
    ch.port2.postMessage(0)
  }

  private cancel() {
    if (this.raf > 0) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.timer++
  }

  private frame = (now: number) => {
    this.cancel()
    if (this.dead) return
    const test = !!this.opts.ignoreHidden
    const dt = clamp(now - this.last, 0, test ? 1000 : 120)
    this.last = now
    this.clock += dt
    this.rect = this.root.getBoundingClientRect()

    if (this.tasks.length) {
      const due = this.tasks.filter((t) => t.at <= this.clock)
      if (due.length) {
        this.tasks = this.tasks.filter((t) => t.at > this.clock)
        for (const t of due) t.fn()
      }
    }

    this.acc += dt
    let n = 0
    const maxSteps = test ? 130 : MAX_STEPS
    while (this.acc >= STEP && n < maxSteps) {
      this.step(now)
      this.acc -= STEP
      n++
    }
    if (this.acc >= STEP) this.acc = 0

    const awake = this.render()
    const busy = awake > 0 || this.tasks.length > 0 || this.drag !== null || now - this.ptr.t < 160
    if (busy && this.visible && !this.tabHidden()) this.request()
  }

  private step(now: number) {
    const d = this.drag
    if (d) {
      d.constraint.pointA = { x: d.cx - this.rect.left, y: d.cy - this.rect.top }
      Sleeping.set(d.item.body, false)
    } else {
      this.nudge(now)
    }
    Engine.update(this.engine, STEP)

    this.tick++
    const maxY = this.opts.maxY
    for (const it of this.items) {
      if (!it.live || it.body.isSleeping) continue
      const sp = Body.getSpeed(it.body)
      if (sp > MAX_SPEED) {
        const v = Body.getVelocity(it.body)
        Body.setVelocity(it.body, { x: (v.x / sp) * MAX_SPEED, y: (v.y / sp) * MAX_SPEED })
      }
      if (maxY !== undefined && this.tick % 30 === 0 && it.body.position.y > maxY) {
        Body.setPosition(it.body, { x: clamp(it.body.position.x, 60, this.rect.width - 60), y: -80 })
        Body.setVelocity(it.body, { x: 0, y: 2 })
      }
    }
  }

  /** The mouse pushes whatever it sweeps past, in the direction it travels. */
  private nudge(now: number) {
    const p = this.ptr
    if (!p.has || now - p.t > 90) return
    const speed = Math.hypot(p.vx, p.vy)
    if (speed < 1.5) return
    const sp = Math.min(speed, 40)
    const ux = p.vx / speed
    const uy = p.vy / speed
    const trail = this.trail
    if (!trail.length) trail.push({ x: p.x, y: p.y })
    for (const it of this.items) {
      if (!it.live) continue
      const b = it.body.bounds
      let dist = Infinity
      for (const q of trail) {
        const dx = Math.max(b.min.x - q.x, 0, q.x - b.max.x)
        const dy = Math.max(b.min.y - q.y, 0, q.y - b.max.y)
        const d = Math.hypot(dx, dy)
        if (d < dist) dist = d
      }
      if (dist > NUDGE_RADIUS) continue
      let ax = it.body.position.x - p.x
      let ay = it.body.position.y - p.y
      const al = Math.hypot(ax, ay) || 1
      ax /= al
      ay /= al
      const k = 0.02 * (1 - dist / NUDGE_RADIUS) * sp
      if (it.body.isSleeping) Sleeping.set(it.body, false)
      const v = Body.getVelocity(it.body)
      Body.setVelocity(it.body, { x: v.x + (ux * 0.7 + ax * 0.3) * k, y: v.y + (uy * 0.7 + ay * 0.3) * k })
    }
    trail.length = 0
  }

  private sync(item: Item) {
    const { x, y } = item.body.position
    item.el.style.transform = `translate3d(${(x - item.ox).toFixed(2)}px,${(y - item.oy).toFixed(2)}px,0) rotate(${item.body.angle.toFixed(4)}rad)`
  }

  private render(): number {
    let awake = 0
    for (const it of this.items) {
      if (!it.live) continue
      if (it.body.isSleeping) {
        if (!it.wasAsleep) {
          it.wasAsleep = true
          this.sync(it)
        }
      } else {
        it.wasAsleep = false
        awake++
        this.sync(it)
      }
    }
    this.stats(awake)
    return awake
  }

  private stats(awake: number) {
    const total = this.items.length
    if (total !== this.statTotal || awake !== this.statAwake) {
      this.statTotal = total
      this.statAwake = awake
      this.onStats?.(total, awake)
    }
  }

  /**
   * Kicks every body near a capsule-shaped box away from it, along the
   * surface normal with an upward bias. Used when a link pill is hovered.
   */
  burst(p: { x: number; y: number; w: number; h: number }) {
    if (!this.opts.interactive) return
    const r = Math.min(p.h, p.w) / 2
    for (const it of this.items) {
      if (!it.live) continue
      const { x, y } = it.body.position
      const nx = clamp(x, p.x + r, p.x + p.w - r)
      const ny = p.y + p.h / 2
      let dx = x - nx
      let dy = y - ny
      const dist = Math.hypot(dx, dy) || 1
      const reach = r + Math.max(it.w, it.h) / 2 + 70
      if (dist > reach) continue
      dx /= dist
      dy /= dist
      const power = rand(11, 16) * (1 - (dist / reach) * 0.35)
      Sleeping.set(it.body, false)
      Body.setVelocity(it.body, { x: dx * power + rand(-1.5, 1.5), y: dy * power - rand(3, 6) })
      Body.setAngularVelocity(it.body, rand(-0.16, 0.16))
    }
    this.wakeAll()
  }

  /** Runs the simulation to rest without drawing, then draws once. */
  settle(maxSteps = 1600) {
    for (let i = 0; i < maxSteps; i++) {
      Engine.update(this.engine, 1000 / 60)
      if (i > 120 && i % 20 === 0 && this.items.every((it) => !it.live || it.body.isSleeping)) break
    }
    for (const it of this.items) if (it.live) this.sync(it)
    this.stats(0)
  }

  /* ---------- pointer ---------- */

  private onDown = (e: PointerEvent) => {
    if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = (e.target as Element | null)?.closest?.('.grv-b')
    const item = el ? this.byEl.get(el) : undefined
    if (!item || !item.live) return
    e.preventDefault()
    this.rect = this.root.getBoundingClientRect()
    const x = e.clientX - this.rect.left
    const y = e.clientY - this.rect.top
    const body = item.body
    Sleeping.set(body, false)
    const constraint = Constraint.create({
      pointA: { x, y },
      bodyB: body,
      pointB: { x: x - body.position.x, y: y - body.position.y },
      length: 0,
      stiffness: 0.22,
      damping: 0.12,
    })
    Composite.add(this.engine.world, constraint)
    this.drag = { item, constraint, id: e.pointerId, cx: e.clientX, cy: e.clientY }
    item.el.classList.add('is-held')
    this.opts.cursorRoot?.classList.add('is-grabbing')
    // Sleeping neighbours would otherwise hang in the air once their support is pulled out.
    this.wakeAll()
  }

  // Stops a body drag from starting a text selection across the page.
  private onMouseDown = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest?.('.grv-b')) e.preventDefault()
  }

  private onMove = (e: PointerEvent) => {
    const d = this.drag
    if (d) {
      if (e.pointerId === d.id) {
        d.cx = e.clientX
        d.cy = e.clientY
      }
      return
    }
    if (e.pointerType !== 'mouse' || !this.visible) return
    // Only the page itself stirs the pile: not chrome layered above it
    // (the shared design picker lives outside the concept root).
    const root = this.opts.cursorRoot
    if (root && e.target instanceof Node && !root.contains(e.target)) {
      this.ptr.has = false
      return
    }
    const r = this.root.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const p = this.ptr
    if (y < -40 || y > r.height + 40) {
      p.has = false
      return
    }
    const now = performance.now()
    const dt = now - p.t
    if (p.has && dt > 0 && dt < 120) {
      // Clamp dt so a burst of coalesced events does not read as a huge speed.
      const k = 16.667 / Math.max(dt, 4)
      p.vx = p.vx * 0.5 + (x - p.x) * k * 0.5
      p.vy = p.vy * 0.5 + (y - p.y) * k * 0.5
      // Fill in the path between samples so quick sweeps still touch things.
      const gap = Math.hypot(x - p.x, y - p.y)
      const n = Math.min(6, Math.floor(gap / 24))
      for (let i = 1; i <= n; i++) this.trail.push({ x: p.x + ((x - p.x) * i) / (n + 1), y: p.y + ((y - p.y) * i) / (n + 1) })
      this.trail.push({ x, y })
      if (this.trail.length > 48) this.trail.splice(0, this.trail.length - 48)
    } else {
      this.trail.length = 0
      p.vx = 0
      p.vy = 0
    }
    p.x = x
    p.y = y
    p.t = now
    p.has = true
    if (Math.hypot(p.vx, p.vy) > 1.5) this.kick()
  }

  private onUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) this.endDrag()
  }

  private onBlur = () => {
    if (this.drag) this.endDrag()
  }

  private endDrag() {
    const d = this.drag
    if (!d) return
    Composite.remove(this.engine.world, d.constraint)
    d.item.el.classList.remove('is-held')
    this.opts.cursorRoot?.classList.remove('is-grabbing')
    this.drag = null
    this.kick()
  }

  private tabHidden() {
    return document.hidden && !this.opts.ignoreHidden
  }

  private onVis = () => {
    if (!document.hidden) this.kick()
  }

  /* ---------- teardown ---------- */

  destroy() {
    if (this.dead) return
    this.dead = true
    this.cancel()
    this.endDrag()
    this.tasks.length = 0
    this.io.disconnect()
    this.layer.removeEventListener('pointerdown', this.onDown)
    this.layer.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVis)
    for (const it of this.items) it.el.remove()
    this.items.length = 0
    this.debugEls.forEach((els) => els.forEach((d) => d.remove()))
    this.debugEls.clear()
    this.statics.clear()
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
    this.onStats = null
  }
}
