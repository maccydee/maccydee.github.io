import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useInView, useMotionValue, useMotionValueEvent, useSpring, useTransform, useVelocity } from 'motion/react'
import { projects, see, work } from '../../content'
import { bus, WATERS } from './bus'
import type { Env } from './env'
import { Figure, Magnetic } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const CARD_W = 340
const SWATCH_H = 168
const PAD = 10
const two = (n: number) => String(n).padStart(2, '0')

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M6 18 18 6M8.5 6H18v9.5" />
  </svg>
)

type Props = {
  env: Env
  sectionRef: RefObject<HTMLElement | null>
  slotRef: RefObject<HTMLDivElement | null>
}

export function Work({ env, sectionRef, slotRef }: Props) {
  /** Blurbs sit in the rows instead of in a cursor-following card. */
  const inline = !env.fine || env.small || env.still
  const [hot, setHot] = useState<number | null>(null)
  const [near, setNear] = useState(0)
  const [inZone, setInZone] = useState(false)
  const [shown, setShown] = useState(0)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const card = useRef<HTMLDivElement>(null)
  const lensCanvas = useRef<HTMLCanvasElement>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const headIn = useInView(headRef, { once: true, amount: 0.5 })
  /** What opened the preview. Scroll re-checks only a mouse hover. */
  const hotBy = useRef<'mouse' | 'focus' | null>(null)
  /** Last input was the keyboard (backs up :focus-visible). */
  const keyboard = useRef(false)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboard.current = true
    }
    const ptr = () => {
      keyboard.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', ptr, { passive: true })
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', ptr)
    }
  }, [])

  const current = hot ?? near

  /* ---- which row is nearest the reading line while scrolling */
  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const sec = sectionRef.current
      if (!sec) return
      const vh = window.innerHeight
      const r = sec.getBoundingClientRect()
      setInZone(r.top < vh * 0.72 && r.bottom > vh * 0.3)
      // rows slide under a resting mouse while the page scrolls: keep the
      // preview on whichever row is actually under it, or close it
      if (hotBy.current === 'mouse' && bus.pointer.seen) {
        const under = document.elementFromPoint(bus.pointer.x, bus.pointer.y)?.closest('.liq-row') ?? null
        const idx = under ? rows.current.indexOf(under as HTMLLIElement) : -1
        if (idx < 0) hotBy.current = null
        setHot(idx < 0 ? null : idx)
        if (idx >= 0) setShown(idx)
      }
      if (r.bottom < 0 || r.top > vh) return
      const line = vh * 0.46
      let best = 0
      let bestD = Infinity
      rows.current.forEach((el, i) => {
        if (!el) return
        const b = el.getBoundingClientRect()
        const d = Math.abs(b.top + b.height / 2 - line)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      setNear(best)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [sectionRef])

  /* ---- the water takes the active project's colour while the index is on screen */
  useEffect(() => {
    bus.fluid.tint = [...WATERS[current % WATERS.length]]
    bus.fluid.tintAmt = inZone ? (hot !== null ? 0.92 : 0.6) : 0
    return () => {
      bus.fluid.tintAmt = 0
    }
  }, [current, inZone, hot])

  /* ---- floating preview: follows the pointer on a lagging spring */
  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const x = useSpring(tx, { stiffness: 170, damping: 20, mass: 0.7 })
  const y = useSpring(ty, { stiffness: 170, damping: 20, mass: 0.7 })
  const vx = useVelocity(x)
  const lean = useSpring(useTransform(vx, [-1800, 1800], [-9, 9], { clamp: true }), { stiffness: 160, damping: 16 })
  const open = hot !== null && !inline

  const place = (px: number, py: number, jump = false) => {
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const h = card.current?.offsetHeight ?? 360
    let nx = px + 30
    if (nx + CARD_W > vw - 16) nx = px - CARD_W - 30
    // below the pointer if it fits, otherwise above it: never over the row being read
    let ny = py + 26
    if (ny + h > vh - 16) ny = py - h - 22
    // never ride up into the top bar / design picker row
    ny = Math.max(68, ny)
    tx.set(nx)
    ty.set(ny)
    if (jump) {
      x.jump(nx)
      y.jump(ny)
    }
  }

  const syncLens = () => {
    bus.lens = open ? { x: x.get() + PAD, y: y.get() + PAD, w: CARD_W - PAD * 2, h: SWATCH_H } : null
  }
  useMotionValueEvent(x, 'change', syncLens)
  useMotionValueEvent(y, 'change', syncLens)
  useEffect(() => {
    bus.lensCanvas = lensCanvas.current
    syncLens()
    return () => {
      bus.lens = null
    }
  })
  useEffect(
    () => () => {
      bus.lensCanvas = null
    },
    [],
  )

  const enter = (i: number, e?: { clientX: number; clientY: number }) => {
    if (e && hot === null) place(e.clientX, e.clientY, true)
    hotBy.current = 'mouse'
    setHot(i)
    setShown(i)
  }
  const focusRow = (i: number, el: HTMLElement) => {
    if (!keyboard.current && !el.matches(':focus-visible')) return
    // keyboard: dock the card in the plate, over the foot of the arch, so it
    // never covers the list being tabbed through
    const sr = slotRef.current?.getBoundingClientRect()
    const h = card.current?.offsetHeight ?? 360
    const nx = sr ? sr.left + (sr.width - CARD_W) / 2 : 24
    const ny = Math.max(16, (sr ? sr.bottom : window.innerHeight) - h - 18)
    tx.set(nx)
    ty.set(ny)
    if (hot === null) {
      x.jump(nx)
      y.jump(ny)
    }
    hotBy.current = 'focus'
    setHot(i)
    setShown(i)
  }

  const p = projects[shown]

  return (
    <section id="work" ref={sectionRef} className="liq-work" aria-labelledby="liq-work-h">
      <div className="liq-work__side">
        <div ref={slotRef} className="liq-slot" aria-hidden="true" />
        <div className="liq-plate" aria-hidden="true">
          <span className="liq-plate__no">
            <em>No.</em>
            <span className="liq-roll">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={current}
                  initial={env.still ? false : { y: '100%' }}
                  animate={{ y: '0%' }}
                  exit={env.still ? undefined : { y: '-100%' }}
                  transition={{ duration: 0.55, ease: EASE }}
                >
                  {two(current + 1)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="liq-plate__of">/ {two(projects.length)}</span>
          </span>
          <span className="liq-plate__what">
            <span className="liq-plate__name">{projects[current].name}</span>
            <span className="liq-label">{projects[current].kind}</span>
          </span>
        </div>
      </div>

      <div className="liq-work__main">
        {/* 4. see what he does: LinkedIn first, then GitHub leading the repos */}
        <header className="liq-work__head">
          <SeeLink item={see.linkedin} still={env.still} magnetic={env.fine && !env.still} />
          <SeeLink item={see.github} still={env.still} magnetic={env.fine && !env.still} />
          <div className="liq-work__open">
            <h2 id="liq-work-h" ref={headRef} className="liq-h2" aria-label={work.heading}>
              {work.heading.split(' ').map((word, i) => (
                <span key={i} className="liq-clip" aria-hidden="true">
                  <motion.span
                    className={i % 2 ? 'liq-ital' : undefined}
                    initial={env.still ? false : { y: '135%' }}
                    animate={env.still || headIn ? { y: '0%' } : { y: '135%' }}
                    transition={{ duration: 1.1, ease: EASE, delay: i * 0.09 }}
                  >
                    {word}
                  </motion.span>
                </span>
              ))}
            </h2>
            <p className="liq-work__note">{work.note}</p>
          </div>
          <p className="liq-label liq-work__index">
            Index <span className="liq-label__dim">{two(1)} to {two(projects.length)}</span>
          </p>
        </header>

        <ol
          className={`liq-list${hot !== null ? ' has-hot' : ''}`}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' && !inline) place(e.clientX, e.clientY)
          }}
          onPointerLeave={() => {
            hotBy.current = null
            setHot(null)
          }}
        >
          {projects.map((proj, i) => (
            <Row
              key={proj.name}
              i={i}
              proj={proj}
              still={env.still}
              inline={inline}
              hot={hot === i}
              setRef={(el) => {
                rows.current[i] = el
              }}
              onEnter={(e) => enter(i, e)}
              onLeave={() => setHot((h) => (h === i ? null : h))}
              onFocus={(el) => focusRow(i, el)}
            />
          ))}
        </ol>
      </div>

      {!inline && (
        <motion.div ref={card} className="liq-card" data-open={open} style={{ x, y, rotate: lean }} aria-hidden="true">
          <div className="liq-card__in">
            <div className="liq-card__swatch" style={{ height: SWATCH_H }}>
              <canvas ref={lensCanvas} width={(CARD_W - PAD * 2) * 1.5} height={SWATCH_H * 1.5} />
              <span className="liq-card__chip">
                {two(shown + 1)} <em>{p.name}</em>
              </span>
            </div>
            <div className="liq-card__body">
              <p className="liq-card__blurb">{p.blurb}</p>
              <p className="liq-label liq-card__tags">
                <span>{p.lang}</span>
                {p.topics.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </section>
  )
}

type RowProps = {
  i: number
  proj: (typeof projects)[number]
  still: boolean
  inline: boolean
  hot: boolean
  setRef: (el: HTMLLIElement | null) => void
  onEnter: (e: { clientX: number; clientY: number }) => void
  onLeave: () => void
  onFocus: (el: HTMLElement) => void
}

/**
 * One index row. The <li> itself is what gets observed: an element clipped to
 * nothing by its own clip-path never reports as intersecting, so the wipe has
 * to live on a child.
 */
function Row({ i, proj, still, inline, hot, setRef, onEnter, onLeave, onFocus }: RowProps) {
  const li = useRef<HTMLLIElement | null>(null)
  const inView = useInView(li, { once: true, amount: 0.3 })
  const shown = still || inView
  return (
    <li
      ref={(el) => {
        li.current = el
        setRef(el)
      }}
      className={`liq-row${hot ? ' is-hot' : ''}`}
    >
      <motion.a
        href={proj.url}
        className="liq-row__link"
        data-cursor="soft"
        initial={still ? false : { clipPath: 'inset(0% 0% 100% 0%)', y: 48 }}
        animate={shown ? { clipPath: 'inset(-12% -4% -12% -4%)', y: 0 } : { clipPath: 'inset(0% 0% 100% 0%)', y: 48 }}
        transition={{ duration: 1, ease: EASE }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onLeave()}
        onFocus={(e) => onFocus(e.currentTarget)}
        onBlur={onLeave}
      >
        <span className="liq-row__n" aria-hidden="true">
          {two(i + 1)}
        </span>
        <div className="liq-row__main">
          <h3 className="liq-row__name">{proj.name}</h3>
          <p className="liq-row__meta liq-label">
            <span>{proj.kind}</span>
            {proj.figures.map((f) => (
              <Figure key={f} text={f} still={still} />
            ))}
          </p>
          <p className={inline ? 'liq-row__blurb' : 'liq-sr'}>{proj.blurb}</p>
        </div>
        <span className="liq-row__go" aria-hidden="true">
          <Arrow />
        </span>
      </motion.a>
    </li>
  )
}

/** Wipes its content in the first time it scrolls into view. */
function Reveal({ still, className, children }: { still: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const shown = still || inView
  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={still ? false : { clipPath: 'inset(0% 0% 100% 0%)', y: 48 }}
        animate={shown ? { clipPath: 'inset(-12% -4% -12% -4%)', y: 0 } : { clipPath: 'inset(0% 0% 100% 0%)', y: 48 }}
        transition={{ duration: 1, ease: EASE }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/** A large line that leads somewhere: "Posts on LinkedIn", "Shares on GitHub". */
function SeeLink({ item, still, magnetic }: { item: { label: string; handle: string; url: string }; still: boolean; magnetic: boolean }) {
  return (
    <Reveal still={still} className="liq-see">
      <Magnetic on={magnetic} strength={0.05} block>
        <a className="liq-see__link" href={item.url} data-cursor="soft">
          <span className="liq-see__main">
            <span className="liq-see__label">{item.label}</span>
            <span className="liq-label liq-see__handle">{item.handle}</span>
          </span>
          <span className="liq-row__go liq-see__go" aria-hidden="true">
            <Arrow />
          </span>
        </a>
      </Magnetic>
    </Reveal>
  )
}
