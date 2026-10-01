import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import Lenis from 'lenis'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/manrope'
import './liquid.css'
import { contact as contactCopy, links, person, projects } from '../../content'
import { bus, clamp, easeInOut, easeOut, lerp, span, type Rect } from './bus'
import { useEnv, usePointerBus, type Env } from './env'
import { Fluid } from './fluid'
import { Cursor, Magnetic, Readout } from './ui'
import { VarText } from './VarText'
import { Work } from './Work'

const BONE = '#EFEAE2'
/** Resting weight of the display type. Heavier on small screens, where the
 *  hairlines of the 144pt optical size would leave no room for the fluid. */
const restFor = (small: boolean) => (small ? 560 : 440)
const two = (n: number) => String(n).padStart(2, '0')

/**
 * Scroll timeline of the pinned opening, in fractions of its track.
 * name -> seam opens to full-bleed water -> who (role, tagline) -> what he
 * does (the disciplines, one line at a time) -> the water recedes.
 */
const T = {
  openEnd: 0.24,
  roleIn: 0.22,
  roleOut: 0.45,
  doesIn: 0.5,
  doesSpan: 0.27,
  doesOut: 0.89,
}

/* -------------------------------------------------------------------------
   Layering. The water canvas is fixed over the page at z-index 1 with
   `mix-blend-mode: lighten`, and its shader output never exceeds the bone
   ground colour. So the fluid is invisible over bone and shows only where
   something BELOW the canvas is painted black: the giant letterforms, the
   aperture, the arch. Everything that must stay ink (labels, body copy) sits
   ABOVE the canvas at z-index 2+. The type is real DOM text, so the mask
   edge is always razor sharp even though the fluid renders at low resolution.
   ------------------------------------------------------------------------- */

export default function Liquid() {
  const env = useEnv()
  usePointerBus()

  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const name = useRef<HTMLHeadingElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  const aperture = useRef<HTMLDivElement>(null)
  const workSec = useRef<HTMLElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const contact = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const covered = useRef(false)

  const [ready, setReady] = useState(false)
  const [noGl, setNoGl] = useState(false)

  /* ---- page ground: the document behind the concept matches the bone */
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = [html.style.background, body.style.background, html.style.overflowX]
    html.style.background = BONE
    body.style.background = BONE
    html.style.overflowX = 'clip'
    return () => {
      html.style.background = prev[0]
      body.style.background = prev[1]
      html.style.overflowX = prev[2]
    }
  }, [])

  /* ---- fonts first, so the intro never animates a fallback face */
  useEffect(() => {
    let live = true
    const done = () => live && setReady(true)
    const fonts = document.fonts
    Promise.all([
      fonts.load("400 100px 'Fraunces Variable'"),
      fonts.load("italic 400 100px 'Fraunces Variable'"),
      fonts.load("500 12px 'Manrope Variable'"),
    ]).then(done, done)
    const t = window.setTimeout(done, 2500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [])

  /* ---- fit the name: "McDonald" spans the measure, capped by viewport height */
  useLayoutEffect(() => {
    const el = root.current
    const m = measure.current
    if (!el || !m) return
    const fit = () => {
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const gut = clamp(vw * 0.04, 18, 72)
      const perEm = m.getBoundingClientRect().width / 100
      if (!perEm) return
      // leave headroom: letters lose kerning as inline blocks and swell on hover
      const byWidth = ((vw - gut * 2) * (env.fine ? 0.9 : 0.93)) / perEm
      const byHeight = vh * (vw < vh ? 0.24 : 0.37)
      el.style.setProperty('--fs', `${Math.min(byWidth, byHeight).toFixed(1)}px`)
      el.style.setProperty('--gut', `${gut.toFixed(1)}px`)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ready, env.fine, env.small])

  /* ---- smooth scroll */
  useEffect(() => {
    if (env.still) return
    const lenis = new Lenis({ lerp: 0.105, anchors: true, autoRaf: true })
    return () => lenis.destroy()
  }, [env.still])

  /* ---- the water */
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    setNoGl(false)
    const fluid = new Fluid(el, { lite: env.small || !env.fine, still: env.still, onFail: () => setNoGl(true) })
    if (import.meta.env.DEV) (window as unknown as { __liq?: Fluid }).__liq = fluid
    return () => fluid.dispose()
  }, [env.small, env.fine, env.still])

  /* ---- scene: aperture geometry, fluid mood and zone, all from scroll */
  useEffect(() => {
    const el = root.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const h = hero.current
      const w = workSec.current
      const ap = aperture.current
      if (!h || !w) return
      const vw = ap?.clientWidth || document.documentElement.clientWidth
      const vh = ap?.clientHeight || window.innerHeight
      const hr = h.getBoundingClientRect()
      const wr = w.getBoundingClientRect()
      const cr = contact.current?.getBoundingClientRect()
      const p = env.still ? 0 : clamp(-hr.top / Math.max(1, hr.height - vh))
      const t = clamp(1 - wr.top / vh)

      const zone = cr && cr.top < vh * 0.55 ? 'contact' : t > 0.5 ? 'work' : p > T.roleIn ? 'state' : 'hero'
      if (el.dataset.zone !== zone) el.dataset.zone = zone

      // where the water is visible: the renderer scissors to these rects
      const wins: Rect[] = []
      const push = (r: DOMRect | undefined, grow = 0) => {
        if (!r || r.bottom < -grow || r.top > vh + grow || r.width === 0) return
        wins.push({ x: r.left - grow, y: r.top - grow, w: r.width + grow * 2, h: r.height + grow * 2 })
      }
      // generous margins: on touch devices scroll runs ahead of this handler
      if (cr) push(list.current?.getBoundingClientRect(), 160)

      if (env.still) {
        bus.fluid.light = 0
        push(name.current?.getBoundingClientRect(), 24)
        push(slot.current?.getBoundingClientRect(), 160)
        bus.windows = wins
        return
      }
      if (!ap) return
      covered.current = p > T.openEnd + 0.03

      let top: number, right: number, bottom: number, left: number
      let rt: number, rb: number
      if (t <= 0) {
        // eyelid: a seam opens between the two words, then the lid lifts
        const nr = name.current?.getBoundingClientRect()
        const cy = nr ? nr.top + nr.height / 2 : vh / 2
        const wT = easeOut(span(p, 0, T.openEnd * 0.5))
        const hT = easeInOut(span(p, T.openEnd * 0.1, T.openEnd))
        left = right = (vw / 2) * (1 - wT)
        top = cy * (1 - hT)
        bottom = (vh - cy) * (1 - hT)
        const r = (Math.min(vw - left - right, vh - top - bottom) / 2) * (1 - span(p, T.openEnd * 0.6, T.openEnd))
        rt = rb = r
        bus.fluid.light = easeInOut(span(p, T.openEnd * 0.15, T.openEnd * 0.9))
      } else {
        // recede: the full-bleed water narrows into the arch as the next section arrives
        const sr = slot.current?.getBoundingClientRect()
        const e = easeOut(t, 5)
        const s = sr ?? { left: 0, top: 0, right: vw, bottom: vh, width: vw }
        // the side the copy comes in on clears first, so nothing lands on the water
        const eSide = easeOut(span(t, 0, 0.42), 4)
        left = lerp(0, s.left, e)
        top = lerp(0, s.top, e)
        right = lerp(0, vw - s.right, eSide)
        bottom = lerp(0, vh - s.bottom, e)
        rt = lerp(0, s.width / 2, e)
        rb = lerp(0, 6, e)
        bus.fluid.light = 1 - easeInOut(span(t, 0.4, 0.95))
      }
      ap.style.clipPath = `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${rt.toFixed(1)}px ${rt.toFixed(1)}px ${rb.toFixed(1)}px ${rb.toFixed(1)}px)`
      if (t >= 1) push(slot.current?.getBoundingClientRect(), 160)
      else if (p <= 0) push(name.current?.getBoundingClientRect(), 40)
      else if (hr.bottom > 0) wins.push({ x: 0, y: 0, w: vw, h: vh })
      bus.windows = wins
      const done = t >= 1 ? '1' : '0'
      if (el.dataset.docked !== done) el.dataset.docked = done
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      bus.fluid.light = 0
      bus.windows = null
    }
  }, [env.still, env.small, ready])

  const cls = ['liq', ready && 'is-ready', env.still && 'liq--still', noGl && 'liq--nogl', !env.fine && 'liq--touch'].filter(Boolean).join(' ')
  const live = !env.still
  const rest = restFor(env.small)

  return (
    <div ref={root} className={cls} data-zone="hero" data-docked="0" style={{ '--rest': rest } as CSSProperties}>
      <span ref={measure} className="liq-measure" aria-hidden="true">
        {person.lastName}
      </span>

      <header className="liq-top">
        <Magnetic on={env.fine && live} strength={0.25}>
          <a className="liq-top__mark" href="#top" aria-label={person.name} data-cursor="soft">
            <span className="liq-top__full">{person.name}</span>
            <span className="liq-top__short" aria-hidden="true">
              {person.firstName[0]}
              {person.lastName[0]}
            </span>
          </a>
        </Magnetic>
        {!env.small && <Readout pointer={env.fine} />}
        <nav className="liq-top__nav" aria-label="Sections">
          <Magnetic on={env.fine && live} strength={0.25}>
            <a className="liq-pill" href="#work" data-cursor="soft">
              Work
            </a>
          </Magnetic>
          {/* next to the shared design picker: it may lean away from it, never toward */}
          <Magnetic on={env.fine && live} strength={0.25} xMax={0}>
            <a className="liq-pill" href="#contact" data-cursor="soft">
              Contact
            </a>
          </Magnetic>
        </nav>
      </header>

      <main id="top">
        <Hero env={env} rest={rest} heroRef={hero} nameRef={name} ready={ready} covered={covered} />
        <Work env={env} sectionRef={workSec} slotRef={slot} />
        <Contact env={env} rest={rest} sectionRef={contact} listRef={list} ready={ready} />
      </main>

      <footer className="liq-foot">
        <p>
          © {person.year} {person.name}
        </p>
        <Magnetic on={env.fine && live} strength={0.25}>
          <a className="liq-foot__top" href="#top" data-cursor="soft">
            Back to top
          </a>
        </Magnetic>
      </footer>

      {/* content dissolves into the ground as it scrolls under the top bar, so
          nothing ever shows through behind the bar or the design picker */}
      <div className="liq-veil" aria-hidden="true" />

      {/* below the canvas: black here is where the water shows */}
      {live && <div ref={aperture} className="liq-aperture" aria-hidden="true" />}
      <canvas ref={canvas} className="liq-canvas" aria-hidden="true" />
      {env.fine && live && <Cursor />}
    </div>
  )
}

/* ---------------------------------------------------------------------- hero */

type HeroProps = {
  env: Env
  rest: number
  heroRef: React.RefObject<HTMLDivElement | null>
  nameRef: React.RefObject<HTMLHeadingElement | null>
  ready: boolean
  covered: React.RefObject<boolean>
}

function Hero({ env, rest, heroRef, nameRef, ready, covered }: HeroProps) {
  const live = !env.still
  const { scrollYProgress: p } = useScroll({ target: heroRef, offset: ['start start', 'end end'] })
  const n = person.disciplines.length
  const step = T.doesSpan / n
  const lineAt = (i: number) => T.doesIn + 0.03 + i * step
  const part = env.small ? 16 : 24

  // function transformers on purpose: mapped ranges on opacity get handed to a
  // native scroll timeline, which mis-resolves against this sticky track
  const y1 = useTransform(p, (v) => `${-part * span(v, 0, T.openEnd)}vh`)
  const y2 = useTransform(p, (v) => `${part * span(v, 0, T.openEnd)}vh`)
  const nameOpacity = useTransform(p, (v) => 1 - span(v, T.openEnd + 0.005, T.openEnd + 0.025))
  const introOpacity = useTransform(p, (v) => 1 - span(v, 0, 0.05))
  const introY = useTransform(p, (v) => -40 * span(v, 0, 0.07))
  const stateOpacity = useTransform(p, (v) => 1 - span(v, T.roleOut, T.roleOut + 0.065))
  const stateY = useTransform(p, (v) => (v < T.roleOut ? lerp(30, -20, span(v, T.roleIn, T.roleOut)) : lerp(-20, -90, span(v, T.roleOut, T.roleOut + 0.08))))
  const stateVis = useTransform(p, (v) => (v > T.roleIn - 0.03 && v < T.roleOut + 0.07 ? 'visible' : 'hidden'))
  const doesOpacity = useTransform(p, (v) => 1 - span(v, T.doesOut, T.doesOut + 0.07))
  const doesY = useTransform(p, (v) => (v < T.doesOut ? lerp(26, -18, span(v, T.doesIn, T.doesOut)) : lerp(-18, -90, span(v, T.doesOut, T.doesOut + 0.08))))
  const doesVis = useTransform(p, (v) => (v > T.doesIn - 0.01 && v < T.doesOut + 0.075 ? 'visible' : 'hidden'))
  const [first, ...restWords] = person.role.split(' ')

  // each discipline sends a ring out across the water as it lands
  const lines = useRef<(HTMLLIElement | null)[]>([])
  const landed = useRef(0)
  useMotionValueEvent(p, 'change', (v) => {
    if (!live) return
    let count = 0
    for (let i = 0; i < n; i++) if (v > lineAt(i) + 0.045) count = i + 1
    if (v > T.doesOut) count = n
    if (count > landed.current && v < T.doesOut) {
      for (let i = landed.current; i < count; i++) {
        const r = lines.current[i]?.getBoundingClientRect()
        if (r) bus.splash?.(r.left + Math.min(r.width * 0.5, 320), r.top + r.height * 0.5, 1)
      }
    }
    landed.current = count
  })

  return (
    <div ref={heroRef} className="liq-hero">
      {/* 1. the name. Under the canvas: its letters are the mask */}
      <div className="liq-hero__pin liq-hero__pin--under">
        <motion.h1 ref={nameRef} className="liq-name" aria-label={person.name} style={live ? { opacity: nameOpacity } : undefined}>
          <motion.span className="liq-name__line" style={live ? { y: y1 } : undefined}>
            <VarText text={person.firstName} rest={rest} live={live} ready={ready} delay={180} pausedRef={covered} />
          </motion.span>
          <motion.span className="liq-name__line liq-name__line--r" style={live ? { y: y2 } : undefined}>
            <VarText text={person.lastName} rest={rest} live={live} ready={ready} delay={420} pausedRef={covered} />
          </motion.span>
        </motion.h1>
      </div>

      {/* over the canvas: ink */}
      <div className="liq-hero__pin liq-hero__pin--over">
        {/* 2. who: role and tagline beside the name */}
        <div className="liq-hero__stage">
          <motion.div className="liq-hero__frame" style={live ? { opacity: introOpacity, y: introY } : undefined}>
            <div className="liq-intro">
              <p className="liq-label liq-intro__role">{person.role}</p>
              <p className="liq-intro__tag">{person.tagline}</p>
            </div>
          </motion.div>
          <motion.div className="liq-hero__base" style={live ? { opacity: introOpacity } : undefined} aria-hidden="true">
            <span className="liq-label liq-hero__count">
              {two(n)} disciplines, {two(projects.length)} open source projects
            </span>
            <span className="liq-scrollhint">
              <span className="liq-scrollhint__line" />
              <span className="liq-label">Scroll</span>
            </span>
          </motion.div>
        </div>

        {/* ...and again at scale over the open water. Same words as the block
            above, so this copy is hidden from assistive tech */}
        <motion.div
          className="liq-state"
          aria-hidden="true"
          style={live ? { opacity: stateOpacity, y: stateY, visibility: stateVis as unknown as MotionValue<'visible' | 'hidden'> } : undefined}
        >
          <p className="liq-state__role">
            <Rise p={p} from={T.roleIn} to={T.roleIn + 0.11} live={live}>
              {first}
            </Rise>
            <Rise p={p} from={T.roleIn + 0.03} to={T.roleIn + 0.14} live={live} className="liq-state__role-2">
              <i>{restWords.join(' ')}</i>
            </Rise>
          </p>
          <div className="liq-state__tag">
            <Rise p={p} from={T.roleIn + 0.07} to={T.roleIn + 0.18} live={live}>
              <span className="liq-state__tagtext">{person.tagline}</span>
            </Rise>
          </div>
        </motion.div>

        {/* 3. what he does: the disciplines, one line at a time */}
        <motion.div
          className="liq-does"
          style={live ? { opacity: doesOpacity, y: doesY, visibility: doesVis as unknown as MotionValue<'visible' | 'hidden'> } : undefined}
        >
          <p className="liq-label liq-does__label">
            <Rise p={p} from={T.doesIn} to={T.doesIn + 0.07} live={live}>
              Disciplines <span className="liq-label__dim">{two(1)} to {two(n)}</span>
            </Rise>
          </p>
          <ol className="liq-does__list">
            {person.disciplines.map((d, i) => (
              <li
                key={d}
                ref={(el) => {
                  lines.current[i] = el
                }}
                className={`liq-does__item${i % 2 ? ' liq-does__item--alt' : ''}`}
              >
                <span className="liq-does__n" aria-hidden="true">
                  <Rise p={p} from={lineAt(i)} to={lineAt(i) + 0.08} live={live}>
                    {two(i + 1)}
                  </Rise>
                </span>
                <Rise p={p} from={lineAt(i)} to={lineAt(i) + 0.1} live={live} className="liq-does__t">
                  {d}
                </Rise>
              </li>
            ))}
          </ol>
        </motion.div>
      </div>
    </div>
  )
}

/** A line that rises out of a clip as scroll passes through [from, to]. */
function Rise({ p, from, to, live, className, children }: { p: MotionValue<number>; from: number; to: number; live: boolean; className?: string; children: ReactNode }) {
  const y = useTransform(p, (v) => `${140 * (1 - easeOut(span(v, from, to), 4))}%`)
  return (
    <span className={`liq-clip${className ? ` ${className}` : ''}`}>
      <motion.span style={live ? { y } : undefined}>{children}</motion.span>
    </span>
  )
}

/* ------------------------------------------------------------------- contact */

type ContactProps = {
  env: Env
  rest: number
  sectionRef: React.RefObject<HTMLElement | null>
  listRef: React.RefObject<HTMLUListElement | null>
  ready: boolean
}

function Contact({ env, rest, sectionRef, listRef, ready }: ContactProps) {
  const live = !env.still
  return (
    <section id="contact" ref={sectionRef} className="liq-contact" aria-labelledby="liq-contact-h">
      <div className="liq-contact__head">
        <h2 id="liq-contact-h" className="liq-label">
          {contactCopy.heading}
        </h2>
        <p className="liq-label liq-label__dim">{two(links.length)} links</p>
      </div>
      <ul ref={listRef} className="liq-contact__list">
        {links.map((l, i) => (
          <li key={l.url} className={`liq-big${i % 2 ? ' liq-big--r' : ''}`} style={{ '--i': i } as CSSProperties}>
            <a href={l.url} className="liq-big__link" aria-label={`${l.label}, ${l.handle}`}>
              <span className="liq-big__text">
                <VarText text={l.label} rest={rest} radius={1.25} live={live} ready={ready} delay={i * 140} />
              </span>
              <span className="liq-big__meta" aria-hidden="true">
                <span className="liq-label">{l.handle}</span>
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M6 18 18 6M8.5 6H18v9.5" />
                </svg>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
