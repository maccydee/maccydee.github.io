// The title card's name engine. Each letter owns a weight and a width, and
// every frame those are recomposed from four inputs:
//   pointer proximity, a load-time sweep, a slow breathing wave, and the
//   scroll-driven "thin" value that drops the whole name to hairline.
// Width changes are zero-sum within a line (near letters swell, far letters
// condense) and any residual is corrected with one scaleX per line, so the
// name always sits exactly edge to edge.

import { fitLine } from './fit'

const REST_W = 760
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

type Letter = { el: HTMLElement; cx: number; v: number; w: number; d: number }
type Line = {
  el: HTMLElement
  inner: HTMLElement
  letters: Letter[]
  wdth: number
  target: number
  cy: number
  scale: number
}

export function createNameEngine(h1: HTMLElement) {
  const lines: Line[] = Array.from(h1.querySelectorAll<HTMLElement>('.name__line')).map((el) => {
    const inner = el.querySelector<HTMLElement>('.name__in')!
    const letters = Array.from(inner.querySelectorAll<HTMLElement>('.name__l')).map((l) => ({
      el: l,
      cx: 0,
      v: 0,
      w: -1,
      d: -1,
    }))
    return { el, inner, letters, wdth: 100, target: 0, cy: 0, scale: -1 }
  })

  const state = {
    thin: 0, // 0..1, driven by scroll
    sweep: 0, // 0..1, position of the load-time wave
    sweepAmt: 0, // strength of the load-time wave
    px: 0,
    py: 0,
    on: false, // pointer is over the page
    amt: 0, // smoothed pointer strength
    W: 1,
  }

  function layout(W: number, pad: number, fMax: number) {
    state.W = W
    const target = W - pad * 2
    for (const line of lines) {
      line.inner.style.transform = 'none'
      const res = fitLine(line.inner, {
        target,
        fMax,
        fHard: fMax * 1.12,
        lo: 27,
        sizeEl: line.el,
        apply: (wd) => {
          const s = `'wght' ${REST_W}, 'wdth' ${wd.toFixed(2)}`
          for (const l of line.letters) l.el.style.fontVariationSettings = s
        },
        measure: () => line.inner.offsetWidth,
      })
      line.wdth = res.wdth
      line.target = target
      line.scale = -1
      const r = line.el.getBoundingClientRect()
      line.cy = r.top + r.height / 2
      for (const l of line.letters) {
        const lr = l.el.getBoundingClientRect()
        l.cx = lr.left + lr.width / 2
        l.w = -1
        l.d = -1
      }
    }
  }

  function frame(time: number) {
    state.amt += ((state.on ? 1 : 0) - state.amt) * 0.07
    const sigma = Math.max(110, state.W * 0.15)
    const s2 = 2 * sigma * sigma
    let n = 0
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      const sweepX = (li % 2 === 0 ? -0.3 + 1.6 * state.sweep : 1.3 - 1.6 * state.sweep) * state.W
      let mean = 0
      for (const l of line.letters) {
        let inf = 0
        if (state.amt > 0.002) {
          const dx = l.cx - state.px
          const dy = (line.cy - state.py) * 0.8
          inf = Math.exp(-(dx * dx + dy * dy) / s2) * state.amt
        }
        if (state.sweepAmt > 0.002) {
          const dx = l.cx - sweepX
          inf = Math.max(inf, Math.exp(-(dx * dx) / s2) * state.sweepAmt)
        }
        l.v += (inf - l.v) * 0.14
        mean += l.v
      }
      mean /= line.letters.length

      let dirty = false
      for (const l of line.letters) {
        const dev = l.v - mean
        const breath = Math.sin(time * 1.2 - n * 0.62)
        let w = REST_W + dev * 880 + breath * 46
        let d = line.wdth + dev * 78 + breath * 2.4
        w += (100 - w) * state.thin
        d += 20 * state.thin
        w = clamp(w, 100, 1000)
        d = clamp(d, 25, 151)
        n++
        if (Math.abs(w - l.w) > 0.6 || Math.abs(d - l.d) > 0.06) {
          l.w = w
          l.d = d
          l.el.style.fontVariationSettings = `'wght' ${w.toFixed(1)}, 'wdth' ${d.toFixed(2)}`
          dirty = true
        }
      }
      if (dirty) {
        const nat = line.inner.offsetWidth
        const sx = nat > 0 ? line.target / nat : 1
        if (Math.abs(sx - line.scale) > 0.0004) {
          line.scale = sx
          line.inner.style.transform = `scaleX(${sx.toFixed(4)})`
        }
      }
    }
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    state.px = e.clientX
    state.py = e.clientY
    state.on = true
  }
  const onLeave = () => {
    state.on = false
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onLeave)

  function destroy() {
    window.removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onLeave)
    for (const line of lines) {
      line.inner.style.transform = ''
      line.el.style.fontSize = ''
      for (const l of line.letters) l.el.style.fontVariationSettings = ''
    }
  }

  return { state, layout, frame, destroy, letters: () => lines.flatMap((l) => l.letters.map((x) => x.el)) }
}

export type NameEngine = ReturnType<typeof createNameEngine>
