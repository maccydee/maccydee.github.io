import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { bus } from './bus'

type Props = {
  text: string
  className?: string
  /** Resting weight. */
  rest?: number
  /** Weight directly under the pointer. */
  peak?: number
  /** Reach of the pointer, in multiples of the font size. */
  radius?: number
  /** Milliseconds to hold before the intro starts. */
  delay?: number
  /** Run the per-letter loop (false = static, resting letterforms). */
  live: boolean
  /** Fonts are loaded and the intro may begin. */
  ready: boolean
  /** When this ref is true the loop idles (e.g. the type is covered). */
  pausedRef?: RefObject<boolean>
}

const STAGGER = 62
const settings = (w: number, s: number, k: number) =>
  `'opsz' 144, 'wght' ${w.toFixed(1)}, 'SOFT' ${s.toFixed(1)}, 'WONK' ${k.toFixed(2)}`

/**
 * Display type whose letters are individually driven along Fraunces' axes.
 * Intro: each letter rises and fattens from a hairline in sequence.
 * After that: letters near the pointer swell (wght), soften (SOFT) and go
 * wonky (WONK); with no pointer the line breathes in a slow travelling wave.
 * Decorative only: the accessible name is supplied by the parent.
 */
export function VarText({ text, className, rest = 440, peak = 900, radius = 1.15, delay = 0, live, ready, pausedRef }: Props) {
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || !ready) return
    const chars = Array.from(el.querySelectorAll<HTMLElement>('.liq-ch'))
    if (!live) {
      el.classList.add('is-in')
      return
    }

    const n = chars.length
    const w = new Float32Array(n).fill(100)
    const s = new Float32Array(n).fill(100)
    const k = new Float32Array(n).fill(0)
    const cx = new Float32Array(n)
    const cy = new Float32Array(n)
    const applied = new Float64Array(n).fill(-1)
    let visible = false
    let started = false
    let startAt = 0
    let raf = 0
    let last = performance.now()
    let fs = parseFloat(getComputedStyle(el).fontSize) || 100
    let idle = 1

    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      raf = requestAnimationFrame(frame)
      if (pausedRef?.current) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = bus.pointer
      const near = p.seen
      const R = radius * fs

      // read phase
      if (near) {
        for (let i = 0; i < n; i++) {
          const r = chars[i].getBoundingClientRect()
          cx[i] = r.left + r.width / 2
          cy[i] = r.top + r.height / 2
        }
      }
      const wantIdle = !near || now - p.moved > 1600 ? 1 : 0
      idle += (wantIdle - idle) * (1 - Math.exp(-dt * 2))

      // write phase
      const kw = 1 - Math.exp(-dt * 7)
      const ks = 1 - Math.exp(-dt * 5)
      for (let i = 0; i < n; i++) {
        const local = now - startAt - i * STAGGER
        if (local < 0) continue
        let f = 0
        if (near) {
          const d = Math.hypot(p.x - cx[i], p.y - cy[i])
          f = Math.max(0, 1 - d / R)
          f = f * f * (3 - 2 * f)
        }
        const wave = Math.sin(now * 0.0009 - i * 0.62)
        const tw = rest + (peak - rest) * f + wave * 60 * idle * (1 - f)
        const ts = 100 * f + (0.5 + 0.5 * wave) * 26 * idle * (1 - f)
        const tk = f > 0.42 ? 1 : 0
        // the intro is slower and heavier than the hover response
        const introK = local < 1400 ? 0.45 : 1
        w[i] += (tw - w[i]) * kw * introK
        s[i] += (ts - s[i]) * ks * introK
        k[i] += (tk - k[i]) * kw
        // quantise: every write re-lays-out and re-rasters a very large glyph,
        // so only commit steps the eye can see (2 wght units, 3 SOFT units)
        const qw = Math.round(w[i] / 2) * 2
        const qs = Math.round(s[i] / 3) * 3
        const qk = Math.round(k[i] * 10) / 10
        const sig = qw + qs * 0.001 + qk * 1e-6
        if (sig !== applied[i]) {
          applied[i] = sig
          chars[i].style.fontVariationSettings = settings(qw, qs, qk)
        }
      }
    }
    const kick = () => {
      if (!raf && visible) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible && !started) {
          started = true
          startAt = performance.now() + delay
          el.classList.add('is-in')
        }
        kick()
      },
      { threshold: 0.01 },
    )
    io.observe(el)
    const ro = new ResizeObserver(() => {
      fs = parseFloat(getComputedStyle(el).fontSize) || fs
    })
    ro.observe(el)
    const onVis = () => kick()
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      for (const c of chars) c.style.fontVariationSettings = ''
    }
  }, [live, ready, rest, peak, radius, delay, pausedRef, text])

  return (
    <span
      ref={root}
      aria-hidden="true"
      className={`liq-vt${live ? '' : ' liq-vt--static'}${className ? ` ${className}` : ''}`}
      style={{ '--rest': rest, '--d': `${delay}ms` } as CSSProperties}
    >
      {Array.from(text).map((ch, i) => (
        <span key={i} className="liq-ch" style={{ '--i': i } as CSSProperties}>
          {ch}
        </span>
      ))}
    </span>
  )
}
