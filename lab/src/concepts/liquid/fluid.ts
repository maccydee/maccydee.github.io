import { bus, clamp } from './bus'
import { VERT, SIM_FRAG, displayFrag } from './shader'

export type FluidOptions = {
  /** Cheaper display shader and a lower backing resolution (small / coarse devices). */
  lite: boolean
  /** Reduced motion: one frozen frame, redrawn only when something changes. */
  still: boolean
  onFail?: () => void
}

type Drop = { x: number; y: number; fx: number; fy: number; r: number; s: number }
type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer }

const TRAIL = 5
const FROZEN_TIME = 41.7
/** Simulation steps per second (fixed, so waves travel the same on any display). */
const SIM_HZ = 84
const RGBA16F = 0x881a
const HALF_FLOAT = 0x140b

/**
 * Raw WebGL water renderer.
 *
 * A ripple simulation (wave equation on a low-resolution heightfield, stepped
 * in a ping-pong float framebuffer) feeds a fullscreen display pass. Owns its
 * rAF loop, pointer input, resize handling, resolution scaling and GL lifetime.
 * Without float render targets it falls back to procedural rings.
 */
export class Fluid {
  private gl: WebGLRenderingContext | null = null
  private gl2 = false
  private display: WebGLProgram | null = null
  private sim: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private uD: Record<string, WebGLUniformLocation | null> = {}
  private uS: Record<string, WebGLUniformLocation | null> = {}
  private targets: Target[] = []
  private cur = 0
  private simW = 0
  private simH = 0
  private halfType = HALF_FLOAT
  private acc = 0
  private drops: Drop[] = []
  private ptr = { x: 0, y: 0, lx: 0, ly: 0, has: false, moved: false }
  private nextAmbient = 1.2
  private raf = 0
  private running = false
  private disposed = false
  private last = 0
  private time = Math.random() * 40
  private res = 1
  private maxRes = 1
  private slowFrames = 0
  private clean = 0
  private ceil = 9
  private justRaised = false
  private frames = 0
  private cssW = 1
  private cssH = 1
  private scale = 3
  private trail = new Float32Array(TRAIL * 4)
  private prev = new Float32Array(TRAIL * 2)
  private trailInit = false
  private click = new Float32Array([50, 50, 99])
  private tint = [0.05, 0.5, 0.55]
  private tintAmt = 0
  private light = 0
  private dirty = true
  private winSig = -1
  private ro: ResizeObserver | null = null
  private lensCtx: CanvasRenderingContext2D | null = null
  private lensFor: HTMLCanvasElement | null = null
  /** Smoothed frames per second, for the on-page readout. */
  fps = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: FluidOptions,
  ) {
    for (let i = 0; i < TRAIL; i++) {
      this.trail[i * 4] = 50
      this.trail[i * 4 + 1] = 50
    }
    this.maxRes = opts.lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.25)
    this.res = this.maxRes
    if (opts.still) this.time = FROZEN_TIME

    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    if (!this.init()) {
      opts.onFail?.()
      return
    }
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pointerdown', this.onDown, { passive: true })
    window.addEventListener('pointermove', this.onMove, { passive: true })
    bus.splash = this.splash
    this.start()
  }

  get ok() {
    return !!this.gl && !this.disposed
  }

  /* ------------------------------------------------------------------ setup */

  private init(): boolean {
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }
    let gl = this.canvas.getContext('webgl2', attrs) as WebGLRenderingContext | null
    this.gl2 = !!gl
    if (!gl) gl = (this.canvas.getContext('webgl', attrs) || this.canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null
    if (!gl) return false
    this.gl = gl

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 1)
    this.buffer = buffer

    // the simulation needs a float target we can both render to and filter
    const canSim = !this.opts.still && this.floatSupport()
    this.sim = canSim ? this.build(SIM_FRAG) : null
    this.display = this.build(displayFrag({ proc: !this.sim, lite: this.opts.lite }))
    if (!this.display) return false

    for (const name of ['uRes', 'uTime', 'uLight', 'uScale', 'uTint', 'uTintAmt', 'uTrail', 'uClick', 'uSim', 'uSimTexel']) {
      this.uD[name] = gl.getUniformLocation(this.display, name)
    }
    if (this.sim) {
      for (const name of ['uPrev', 'uTexel', 'uDamp', 'uAspect', 'uDrop', 'uFrom']) {
        this.uS[name] = gl.getUniformLocation(this.sim, name)
      }
    }
    return true
  }

  private build(fragSrc: string): WebGLProgram | null {
    const gl = this.gl
    if (!gl) return null
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[water] shader compile failed:', gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return null
    const program = gl.createProgram()
    if (!program) return null
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[water] program link failed:', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return null
    }
    return program
  }

  private floatSupport(): boolean {
    const gl = this.gl
    if (!gl) return false
    if (this.gl2) {
      this.halfType = HALF_FLOAT
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false
    } else {
      const hf = gl.getExtension('OES_texture_half_float')
      if (!hf || !gl.getExtension('OES_texture_half_float_linear')) return false
      gl.getExtension('EXT_color_buffer_half_float')
      this.halfType = hf.HALF_FLOAT_OES
    }
    // the extension list is not a promise: try a real target
    const probe = this.makeTarget(4, 4)
    if (!probe) return false
    gl.deleteFramebuffer(probe.fbo)
    gl.deleteTexture(probe.tex)
    return true
  }

  private makeTarget(w: number, h: number): Target | null {
    const gl = this.gl
    if (!gl) return null
    const tex = gl.createTexture()
    const fbo = gl.createFramebuffer()
    if (!tex || !fbo) return null
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // clamped edges make the walls of the pool: waves bounce back off them
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, this.gl2 ? RGBA16F : gl.RGBA, w, h, 0, gl.RGBA, this.halfType, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    if (ok) {
      gl.viewport(0, 0, w, h)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!ok) {
      gl.deleteFramebuffer(fbo)
      gl.deleteTexture(tex)
      return null
    }
    return { tex, fbo }
  }

  private freeTargets() {
    const gl = this.gl
    if (gl) {
      for (const t of this.targets) {
        gl.deleteFramebuffer(t.fbo)
        gl.deleteTexture(t.tex)
      }
    }
    this.targets = []
  }

  private sizeSim() {
    if (!this.sim || !this.gl) return
    const cell = this.cssW < this.cssH ? 3.4 : 5.2
    const w = clamp(Math.round(this.cssW / cell), 64, 384)
    const h = clamp(Math.round(this.cssH / cell), 64, 384)
    if (w === this.simW && h === this.simH && this.targets.length === 2) return
    this.freeTargets()
    const a = this.makeTarget(w, h)
    const b = this.makeTarget(w, h)
    if (!a || !b) {
      // lost the float target after all: rebuild the display pass as procedural
      this.freeTargets()
      this.gl.deleteProgram(this.sim)
      this.sim = null
      if (this.display) this.gl.deleteProgram(this.display)
      this.display = this.build(displayFrag({ proc: true, lite: this.opts.lite }))
      if (this.display) {
        for (const name of Object.keys(this.uD)) this.uD[name] = this.gl.getUniformLocation(this.display, name)
      }
      return
    }
    this.targets = [a, b]
    this.cur = 0
    this.simW = w
    this.simH = h
    this.drops.length = 0
  }

  /* ------------------------------------------------------------------ input */

  private onLost = (e: Event) => {
    e.preventDefault()
    this.stop()
    this.gl = null
    this.targets = []
    this.opts.onFail?.()
  }

  private onRestored = () => {
    if (this.disposed) return
    if (this.init()) {
      this.simW = this.simH = 0
      this.resize()
      this.start()
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.stop()
    else this.start()
  }

  /** A press drops a stone in. */
  private onDown = (e: PointerEvent) => {
    const [x, y] = this.toField(e.clientX, e.clientY)
    this.click[0] = x
    this.click[1] = y
    this.click[2] = 0
    const u = e.clientX / this.cssW
    const v = 1 - e.clientY / this.cssH
    this.pushDrop({ x: u, y: v, fx: u, fy: v, r: 0.03, s: -1.15 })
    this.ptr.x = this.ptr.lx = e.clientX
    this.ptr.y = this.ptr.ly = e.clientY
    this.ptr.has = true
    this.dirty = true
  }

  /** Any pointer dragging through the water leaves a wake. */
  private onMove = (e: PointerEvent) => {
    const p = this.ptr
    if (!p.has) {
      p.lx = e.clientX
      p.ly = e.clientY
      p.has = true
    }
    p.x = e.clientX
    p.y = e.clientY
    p.moved = true
  }

  /** Something lands in the water at a viewport point. */
  private splash = (x: number, y: number, strength = 1) => {
    const u = clamp(x / this.cssW, 0, 1)
    const v = clamp(1 - y / this.cssH, 0, 1)
    this.pushDrop({ x: u, y: v, fx: u, fy: v, r: 0.026, s: -0.95 * strength })
    const [fx, fy] = this.toField(x, y)
    this.click[0] = fx
    this.click[1] = fy
    this.click[2] = 0
  }

  private pushDrop(d: Drop) {
    if (!this.sim) return
    if (this.drops.length > 5) this.drops.shift()
    this.drops.push(d)
  }

  private toField(x: number, y: number): [number, number] {
    return [((x - this.cssW / 2) / this.cssH) * this.scale, ((this.cssH / 2 - y) / this.cssH) * this.scale]
  }

  /* ----------------------------------------------------------------- sizing */

  private resize() {
    const gl = this.gl
    if (!gl) return
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.cssW = w
    this.cssH = h
    // keep feature size roughly constant against the short edge
    this.scale = w < h ? 7.4 : 2.8
    const bw = Math.max(2, Math.round(w * this.res))
    const bh = Math.max(2, Math.round(h * this.res))
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
    this.sizeSim()
    this.dirty = true
    // a resize clears the buffer: repaint now so the canvas never flashes black
    if (this.running) this.draw()
  }

  /* ------------------------------------------------------------------- loop */

  start() {
    if (this.running || this.disposed || !this.gl || document.hidden) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private tick = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const rawDt = (now - this.last) / 1000
    this.last = now
    const dt = clamp(rawDt, 0.001, 0.05)

    if (rawDt < 0.25) {
      const inst = 1 / Math.max(rawDt, 0.001)
      this.fps = this.fps ? this.fps + (inst - this.fps) * 0.06 : inst
      bus.fps = this.fps
    }

    // --- smoothed uniforms
    const f = bus.fluid
    const k = 1 - Math.exp(-dt * 5)
    const before = this.tintAmt + this.tint[0] + this.tint[1] + this.tint[2] + this.light
    this.tintAmt += (f.tintAmt - this.tintAmt) * k
    for (let i = 0; i < 3; i++) this.tint[i] += (f.tint[i] - this.tint[i]) * k
    this.light = this.opts.still ? f.light : this.light + (f.light - this.light) * (1 - Math.exp(-dt * 12))
    const after = this.tintAmt + this.tint[0] + this.tint[1] + this.tint[2] + this.light
    if (Math.abs(after - before) > 1e-4) this.dirty = true

    if (this.opts.still) {
      // frozen frame: redraw only when the picture or its windows change
      const sig = bus.windows ? bus.windows.reduce((acc, r) => acc + r.x * 3 + r.y * 7 + r.w * 11 + r.h * 13, 1) : 0
      if (this.dirty || bus.lens || sig !== this.winSig) {
        this.winSig = sig
        this.draw()
      }
      return
    }

    this.time += dt
    this.click[2] += dt
    if (this.sim) this.stepSim(dt)
    else this.updateTrail(dt, now)
    this.draw()
    this.adapt(rawDt)
  }

  /** Feed the pointer and the ambient drips in, then advance the wave equation. */
  private stepSim(dt: number) {
    const gl = this.gl
    if (!gl || !this.sim || this.targets.length < 2) return

    // pointer wake: one stroke per frame, from where it was to where it is
    const p = this.ptr
    if (p.moved) {
      p.moved = false
      const dist = Math.hypot(p.x - p.lx, p.y - p.ly)
      if (dist > 0.5) {
        this.pushDrop({
          x: p.x / this.cssW,
          y: 1 - p.y / this.cssH,
          fx: p.lx / this.cssW,
          fy: 1 - p.ly / this.cssH,
          r: 0.017,
          s: -clamp(dist / 90, 0.05, 0.42),
        })
      }
      p.lx = p.x
      p.ly = p.y
    }

    // now and then a drip lands somewhere the water can be seen
    this.nextAmbient -= dt
    if (this.nextAmbient <= 0) {
      this.nextAmbient = 1.6 + Math.random() * 2.6
      const wins = bus.windows
      if (wins && wins.length) {
        const r = wins[Math.floor(Math.random() * wins.length)]
        const x = clamp((r.x + Math.random() * r.w) / this.cssW, 0.02, 0.98)
        const y = clamp(1 - (r.y + Math.random() * r.h) / this.cssH, 0.02, 0.98)
        this.pushDrop({ x, y, fx: x, fy: y, r: 0.02, s: -0.4 })
      }
    }

    this.acc += dt * SIM_HZ
    let steps = Math.floor(this.acc)
    this.acc -= steps
    if (steps > 4) {
      steps = 4
      this.acc = 0
    }
    if (!steps) return

    gl.useProgram(this.sim)
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, this.simW, this.simH)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.uS.uPrev, 0)
    gl.uniform2f(this.uS.uTexel, 1 / this.simW, 1 / this.simH)
    gl.uniform1f(this.uS.uDamp, 0.994)
    gl.uniform1f(this.uS.uAspect, this.cssW / this.cssH)
    for (let i = 0; i < steps; i++) {
      const d = this.drops.shift()
      if (d) {
        gl.uniform4f(this.uS.uDrop, d.x, d.y, d.r, d.s)
        gl.uniform2f(this.uS.uFrom, d.fx, d.fy)
      } else {
        gl.uniform4f(this.uS.uDrop, 0, 0, 1, 0)
      }
      const src = this.targets[this.cur]
      const dst = this.targets[1 - this.cur]
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
      gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.cur = 1 - this.cur
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Procedural fallback only: a short trail of points chasing the mouse. */
  private updateTrail(dt: number, now: number) {
    const t = this.trail
    const p = bus.pointer
    if (!p.seen) return
    const [tx, ty] = this.toField(p.x, p.y)
    if (!this.trailInit) {
      for (let i = 0; i < TRAIL; i++) {
        t[i * 4] = tx
        t[i * 4 + 1] = ty
        this.prev[i * 2] = tx
        this.prev[i * 2 + 1] = ty
      }
      this.trailInit = true
    }
    const idle = now - p.moved > 120
    for (let i = 0; i < TRAIL; i++) {
      const gx = i === 0 ? tx : t[(i - 1) * 4]
      const gy = i === 0 ? ty : t[(i - 1) * 4 + 1]
      const k = 1 - Math.exp(-dt * (i === 0 ? 16 : 9 - i * 1.3))
      const o = i * 4
      t[o] += (gx - t[o]) * k
      t[o + 1] += (gy - t[o + 1]) * k
      let vx = (t[o] - this.prev[i * 2]) / dt
      let vy = (t[o + 1] - this.prev[i * 2 + 1]) / dt
      const m = Math.hypot(vx, vy)
      if (m > 5) {
        vx = (vx / m) * 5
        vy = (vy / m) * 5
      }
      const kv = 1 - Math.exp(-dt * (idle ? 2.2 : 7))
      t[o + 2] += (vx - t[o + 2]) * kv
      t[o + 3] += (vy - t[o + 3]) * kv
      this.prev[i * 2] = t[o]
      this.prev[i * 2 + 1] = t[o + 1]
    }
  }

  /**
   * Hold the frame rate by trading backing resolution. Steps down when most
   * frames in a window are slow, and creeps back up after several clean
   * windows. If a step up immediately has to be undone, that level becomes the
   * ceiling, so it cannot oscillate.
   */
  private adapt(rawDt: number) {
    if (rawDt > 0.1) return
    this.frames++
    if (this.frames < 45) return
    if (rawDt > 0.0215) this.slowFrames++
    if (this.frames < 135) return
    const slow = this.slowFrames
    this.frames = 45
    this.slowFrames = 0
    if (slow > 54 && this.res > 0.55) {
      if (this.justRaised) this.ceil = this.res * 0.86
      this.res = Math.max(0.55, this.res * 0.82)
      this.clean = 0
      this.justRaised = false
      this.resize()
    } else if (slow < 5) {
      this.justRaised = false
      const next = Math.min(this.maxRes, this.res * 1.14)
      if (++this.clean >= 4 && next > this.res + 0.01 && next <= this.ceil) {
        this.res = next
        this.clean = 0
        this.justRaised = true
        this.resize()
      }
    } else {
      this.clean = 0
    }
  }

  /* ---------------------------------------------------------------- display */

  private draw() {
    const gl = this.gl
    if (!gl || !this.display) return
    const u = this.uD
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.display)
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height)
    gl.uniform1f(u.uTime, this.time)
    gl.uniform1f(u.uLight, this.light)
    gl.uniform1f(u.uScale, this.scale)
    gl.uniform3f(u.uTint, this.tint[0], this.tint[1], this.tint[2])
    gl.uniform1f(u.uTintAmt, this.tintAmt)
    if (this.sim && this.targets.length === 2) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.targets[this.cur].tex)
      gl.uniform1i(u.uSim, 0)
      gl.uniform2f(u.uSimTexel, 1 / this.simW, 1 / this.simH)
    } else {
      gl.uniform4fv(u.uTrail, this.trail)
      gl.uniform3fv(u.uClick, this.click)
    }

    const wins = bus.windows
    if (!wins) {
      gl.disable(gl.SCISSOR_TEST)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    } else {
      // only shade where the page lets the water through
      gl.disable(gl.SCISSOR_TEST)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.SCISSOR_TEST)
      const sx = this.canvas.width / this.cssW
      const sy = this.canvas.height / this.cssH
      const lens = bus.lens && bus.lensCanvas ? bus.lens : null
      const n = wins.length + (lens ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const r = i < wins.length ? wins[i] : lens!
        const x0 = Math.max(0, Math.floor((r.x - 2) * sx))
        const x1 = Math.min(this.canvas.width, Math.ceil((r.x + r.w + 2) * sx))
        const y0 = Math.max(0, Math.floor((this.cssH - (r.y + r.h) - 2) * sy))
        const y1 = Math.min(this.canvas.height, Math.ceil((this.cssH - r.y + 2) * sy))
        if (x1 <= x0 || y1 <= y0) continue
        gl.scissor(x0, y0, x1 - x0, y1 - y0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      gl.disable(gl.SCISSOR_TEST)
    }
    this.dirty = false
    this.copyLens()
  }

  /**
   * The preview card is a lens: it copies the patch of water that is moving
   * underneath it. Must run in the same task as the draw (no preserved buffer).
   */
  private copyLens() {
    const lens = bus.lens
    const target = bus.lensCanvas
    if (!lens || !target) return
    if (this.lensFor !== target) {
      this.lensCtx = target.getContext('2d')
      this.lensFor = target
    }
    const ctx = this.lensCtx
    if (!ctx) return
    const sx = this.canvas.width / this.cssW
    const sy = this.canvas.height / this.cssH
    const x = clamp(lens.x, 0, this.cssW - lens.w)
    const y = clamp(lens.y, 0, this.cssH - lens.h)
    ctx.drawImage(this.canvas, x * sx, y * sy, lens.w * sx, lens.h * sy, 0, 0, target.width, target.height)
  }

  /** Force one frame (used in reduced motion). */
  renderOnce() {
    this.dirty = true
    this.draw()
  }

  info() {
    return {
      ok: this.ok,
      running: this.running,
      webgl2: this.gl2,
      ripples: this.sim ? 'simulated' : 'procedural',
      sim: [this.simW, this.simH],
      width: this.canvas.width,
      height: this.canvas.height,
      res: this.res,
      fps: Math.round(this.fps),
      light: this.light,
      lost: this.gl ? this.gl.isContextLost() : true,
    }
  }

  /** Dev aid: the simulated heights, row by row from the bottom. */
  readSim(): { w: number; h: number; data: Float32Array } | null {
    const gl = this.gl
    if (!gl || !this.sim || this.targets.length < 2) return null
    const out = new Float32Array(this.simW * this.simH * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[this.cur].fbo)
    gl.readPixels(0, 0, this.simW, this.simH, gl.RGBA, gl.FLOAT, out)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { w: this.simW, h: this.simH, data: out }
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.ro?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    if (bus.splash === this.splash) bus.splash = null
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    const gl = this.gl
    if (gl) {
      this.freeTargets()
      if (this.buffer) gl.deleteBuffer(this.buffer)
      if (this.display) gl.deleteProgram(this.display)
      if (this.sim) gl.deleteProgram(this.sim)
      // Deliberately no WEBGL_lose_context here: under StrictMode the effect
      // re-runs on the same canvas element, and a lost context would not come
      // back for the second mount. Deleting our own objects is enough.
    }
    this.gl = null
    this.display = null
    this.sim = null
    this.buffer = null
  }
}
