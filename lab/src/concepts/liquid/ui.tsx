import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useInView, useMotionValue, useSpring } from 'motion/react'
import { bus } from './bus'

/* ------------------------------------------------------------------ cursor */

/**
 * Ink dot plus a larger ring blended with `difference`. Mouse only. The native
 * cursor is hidden while the mouse is in use and handed back as soon as the
 * keyboard takes over, so focus navigation always has a real cursor available.
 */
export function Cursor() {
  const wrap = useRef<HTMLDivElement>(null)
  const x = useMotionValue(-200)
  const y = useMotionValue(-200)
  const rx = useSpring(x, { stiffness: 420, damping: 34, mass: 0.5 })
  const ry = useSpring(y, { stiffness: 420, damping: 34, mass: 0.5 })
  const scale = useSpring(1, { stiffness: 320, damping: 22, mass: 0.6 })
  const opacity = useSpring(0, { stiffness: 200, damping: 26 })

  useEffect(() => {
    const root = wrap.current?.closest<HTMLElement>('.liq')
    if (!root) return
    // 0 = nothing, 1 = soft (outline only, for large reading targets), 2 = full
    let over = 0
    let down = false
    const sync = () => {
      const up = over === 2 ? 1.75 : over === 1 ? 1.35 : 1
      scale.set(down ? up * 0.72 : up)
      if (wrap.current) wrap.current.dataset.over = String(over)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x.set(e.clientX)
      y.set(e.clientY)
      const t = e.target as Element | null
      // The design picker is shared chrome outside this concept and stacks
      // above it: step aside there and let its own native cursor show.
      if (t?.closest?.('.picker')) {
        opacity.set(0)
        if (over !== 0) {
          over = 0
          sync()
        }
        return
      }
      opacity.set(1)
      root.classList.add('liq--cursor')
      const hit = t?.closest?.('a, button, [data-cursor]')
      const next = !hit ? 0 : hit.getAttribute('data-cursor') === 'soft' ? 1 : 2
      if (next !== over) {
        over = next
        sync()
      }
    }
    const onDown = () => {
      down = true
      sync()
    }
    const onUp = () => {
      down = false
      sync()
    }
    const leave = () => opacity.set(0)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        root.classList.remove('liq--cursor')
        opacity.set(0)
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('keydown', key)
      root.classList.remove('liq--cursor')
    }
  }, [x, y, scale, opacity])

  return (
    <div ref={wrap} className="liq-cursor" aria-hidden="true">
      <motion.span className="liq-cursor__ring" style={{ x: rx, y: ry, scale, opacity }} />
      <motion.span className="liq-cursor__dot" style={{ x, y, opacity }} />
    </div>
  )
}

/* ---------------------------------------------------------------- magnetic */

/** Leans its child toward the pointer on a loose spring, and snaps back. */
type MagneticProps = {
  children: ReactNode
  strength?: number
  on?: boolean
  /** furthest it may lean to the right, in px */
  xMax?: number
  /** fill the line instead of hugging the content */
  block?: boolean
}

export function Magnetic({ children, strength = 0.38, on = true, xMax = Infinity, block = false }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const x = useSpring(0, { stiffness: 190, damping: 12, mass: 0.45 })
  const y = useSpring(0, { stiffness: 190, damping: 12, mass: 0.45 })
  const cls = block ? 'liq-mag liq-mag--block' : 'liq-mag'
  if (!on) return <span className={cls}>{children}</span>
  return (
    <motion.span
      ref={ref}
      className={cls}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        // measure against the resting box, not the displaced one
        const cx = r.left + r.width / 2 - x.get()
        const cy = r.top + r.height / 2 - y.get()
        x.set(Math.min((e.clientX - cx) * strength, xMax))
        y.set((e.clientY - cy) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.span>
  )
}

/* ------------------------------------------------------------------ ticker */

const fmt = new Intl.NumberFormat('en-GB')

/** Counts up to `to` the first time it scrolls into view. */
export function CountUp({ to, still }: { to: number; still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 1 })
  useLayoutEffect(() => {
    if (!still && ref.current) ref.current.textContent = '0'
  }, [still])
  useEffect(() => {
    const el = ref.current
    if (!el || still || !inView) return
    const ctl = animate(0, to, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt.format(Math.round(v))
      },
    })
    return () => {
      ctl.stop()
      el.textContent = fmt.format(to)
    }
  }, [inView, to, still])
  return (
    <span ref={ref} className="liq-num">
      {fmt.format(to)}
    </span>
  )
}

/** "17,807 employer boards" becomes a ticking number plus its unit. */
export function Figure({ text, still }: { text: string; still: boolean }) {
  const m = /^([\d,]+)(.*)$/.exec(text)
  if (!m) return <span className="liq-fig">{text}</span>
  return (
    <span className="liq-fig">
      <span className="liq-sr">{text}</span>
      <span aria-hidden="true">
        <CountUp to={Number(m[1].replace(/,/g, ''))} still={still} />
        {m[2]}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------- readouts */

const pad = (n: number, len: number) => String(Math.max(0, Math.round(n))).padStart(len, '0')

/** Live values only: scroll position, pointer position, fluid frame rate. */
export function Readout({ pointer }: { pointer: boolean }) {
  const sc = useRef<HTMLSpanElement>(null)
  const pt = useRef<HTMLSpanElement>(null)
  const fp = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let n = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const max = document.documentElement.scrollHeight - window.innerHeight
      const s = max > 0 ? (window.scrollY / max) * 100 : 0
      const sTxt = pad(s, 3)
      if (sc.current && sc.current.textContent !== sTxt) sc.current.textContent = sTxt
      if (pt.current && bus.pointer.seen) {
        const pTxt = `${pad(bus.pointer.x, 4)} ${pad(bus.pointer.y, 4)}`
        if (pt.current.textContent !== pTxt) pt.current.textContent = pTxt
      }
      if (fp.current && n++ % 20 === 0) fp.current.textContent = bus.fps ? pad(bus.fps, 2) : '00'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="liq-readout" aria-hidden="true">
      <span>
        Scroll <span ref={sc} className="liq-num">000</span>
      </span>
      {pointer && (
        <span className="liq-readout__ptr">
          Pointer <span ref={pt} className="liq-num">0000 0000</span>
        </span>
      )}
      <span>
        FPS <span ref={fp} className="liq-num">00</span>
      </span>
    </div>
  )
}
