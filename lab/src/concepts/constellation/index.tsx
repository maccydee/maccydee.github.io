import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import Lenis from 'lenis'
import '@fontsource-variable/syne'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './constellation.css'
import { contact, links, person, projects, see, work } from '../../content'
import Field from './Field'
import { createStore, firePulse } from './store'

const BG = '#06070c'
// The particle name keeps the lower-case "c": CALLUM / McDONALD.
const NAME_LINES = [person.firstName.toUpperCase(), `Mc${person.lastName.slice(2).toUpperCase()}`]
const NAME_STACKED = NAME_LINES.join('\n')
const NAME_SINGLE = NAME_LINES.join(' ')
// The story: name, who, what he does, see what he does, contact.
const SECTIONS = 5
// Dev-only aid: lets the page keep running in a background tab while it is being inspected.
const FORCE_AWAKE = import.meta.env.DEV && new URLSearchParams(window.location.search).has('awake')
const isHidden = () => document.hidden && !FORCE_AWAKE
// Dev-only aid: previews the reduced-motion version without changing OS settings.
const FORCE_STILL = import.meta.env.DEV && new URLSearchParams(window.location.search).has('still')

type Env = {
  reduced: boolean
  coarse: boolean
  compact: boolean
  /** Two-line particle name. Only a very short or very wide window falls back to one line. */
  stack: boolean
  count: number
  dprMax: number
  bloom: boolean
}

function readEnv(): Env {
  const reduced = FORCE_STILL || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const w = window.innerWidth
  const h = window.innerHeight
  const compact = w < 860 || w < h * 0.95
  const small = coarse || compact
  // the large two-line name needs the density, so wide desktops get the most
  const count = reduced ? (small ? 9000 : 24000) : small ? 14000 : w < 1200 ? 44000 : 72000
  return {
    reduced,
    coarse,
    compact,
    stack: h >= 500 && w / h <= 3.1,
    count,
    dprMax: small ? 2 : 1.5,
    bloom: !small && !reduced,
  }
}

function useEnv(): Env {
  const [env, setEnv] = useState<Env>(readEnv)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = readEnv()
        setEnv((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      })
    }
    const mqs = [window.matchMedia('(prefers-reduced-motion: reduce)'), window.matchMedia('(pointer: coarse)')]
    window.addEventListener('resize', update)
    mqs.forEach((m) => m.addEventListener('change', update))
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      mqs.forEach((m) => m.removeEventListener('change', update))
    }
  }, [])
  return env
}

/** Splits text into masked units for staggered rises. Screen readers get the plain string. */
function Split({ text, by, from = 0 }: { text: string; by: 'char' | 'word'; from?: number }) {
  const units = by === 'char' ? Array.from(text) : text.split(' ')
  return (
    <>
      <span className="cst-sr">{text}</span>
      <span className="cst-split" aria-hidden="true">
        {units.map((u, i) => (
          <span key={i}>
            <span className="cst-m">
              <span style={{ '--i': from + i } as CSSProperties}>{u === ' ' ? ' ' : u}</span>
            </span>
            {by === 'word' && i < units.length - 1 ? ' ' : null}
          </span>
        ))}
      </span>
    </>
  )
}

function Arrow() {
  return (
    <svg className="cst-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 18 18 6M8 6h10v10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const signed = (n: number) => `${n < 0 ? '-' : '+'}${Math.abs(n).toFixed(2)}`

export default function Constellation() {
  const env = useEnv()
  const store = useMemo(createStore, [])
  const [fontReady, setFontReady] = useState(false)
  const [glFailed, setGlFailed] = useState(false)
  const [hidden, setHidden] = useState(isHidden)
  const [entered, setEntered] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const roleRef = useRef<HTMLElement>(null)
  const whatRef = useRef<HTMLElement>(null)
  const starRefs = useRef<(HTMLElement | null)[]>([])
  const workRef = useRef<HTMLElement>(null)
  const contactRef = useRef<HTMLElement>(null)
  const pctRef = useRef<HTMLElement>(null)
  const secRef = useRef<HTMLElement>(null)
  const fpsRef = useRef<HTMLElement>(null)
  const xRef = useRef<HTMLElement>(null)
  const yRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const timeRef = useRef<HTMLElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)

  // Real type carries the name on small screens, with reduced motion, or if WebGL is unavailable.
  const realType = env.compact || env.reduced || glFailed
  const showField = !glFailed && fontReady
  const onFail = useCallback(() => setGlFailed(true), [])

  // Page chrome: dark ground behind the fixed canvas. Restored on unmount.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = { hb: html.style.background, bb: body.style.background, cs: html.style.colorScheme, ox: body.style.overflowX }
    html.style.background = BG
    body.style.background = BG
    html.style.colorScheme = 'dark'
    body.style.overflowX = 'clip'
    return () => {
      html.style.background = prev.hb
      body.style.background = prev.bb
      html.style.colorScheme = prev.cs
      body.style.overflowX = prev.ox
    }
  }, [])

  // The name is sampled from a canvas, so the display face must be loaded first.
  useEffect(() => {
    let alive = true
    const done = () => alive && setFontReady(true)
    const timer = window.setTimeout(done, 1600)
    document.fonts
      .load('800 120px "Syne Variable"', NAME_SINGLE)
      .then(done, done)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!fontReady) return
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [fontReady])

  useEffect(() => {
    const onVis = () => setHidden(isHidden())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Smooth scrolling for wheel input only; touch and reduced motion stay native.
  useEffect(() => {
    if (env.reduced || env.coarse) return
    const lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 0.95, autoRaf: false })
    lenisRef.current = lenis
    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [env.reduced, env.coarse])

  // Scroll, pointer and HUD loop. Writes to the store and to a few text nodes; no React state.
  useEffect(() => {
    if (hidden) return
    const root = rootRef.current
    if (!root) return

    let keys: [number, number][] = [[0, 0]]
    let workTop = 0
    let workH = 1
    let stops = [0, 0, 0, 0]
    // discipline anchors: where each cluster should sit, in document space
    let stars: { x: number; y: number; r: number }[] = []
    const measure = () => {
      const vh = window.innerHeight
      const y0 = window.scrollY
      const top = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().top + y0 : 0)
      const roleTop = top(roleRef.current)
      const roleH = roleRef.current?.offsetHeight ?? vh
      workTop = top(workRef.current)
      workH = workRef.current?.offsetHeight ?? vh
      const contactTop = top(contactRef.current)
      const max = Math.max(1, document.documentElement.scrollHeight - vh)
      const roleMid = roleTop + roleH / 2 - vh / 2
      const whatTop = top(whatRef.current)
      const whatH = whatRef.current?.offsetHeight ?? vh
      const whatMid = whatTop + whatH / 2 - vh / 2
      // 0 name, 1 galaxy (who), 2 clusters (what he does), 3 lattice (see), 4 ring (contact)
      const raw: [number, number][] = [
        [0, 0],
        [vh * 0.06, 0],
        [Math.max(roleMid - vh * 0.12, vh * 0.55), 1],
        [roleMid + vh * 0.18, 1],
        [whatMid - vh * 0.22, 2],
        [whatMid + Math.max(vh * 0.2, (whatH - vh) / 2 + vh * 0.2), 2],
        [workTop - vh * 0.3, 3],
        [contactTop - vh * 0.95, 3],
        [Math.min(contactTop - vh * 0.12, max), 4],
        [max + 1, 4],
      ]
      keys = raw.map((k, i) => [i === 0 ? 0 : Math.max(k[0], raw[i - 1][0] + 1), k[1]] as [number, number])
      for (let i = 1; i < keys.length; i++) if (keys[i][0] <= keys[i - 1][0]) keys[i][0] = keys[i - 1][0] + 1
      stops = [roleTop - vh * 0.5, whatTop - vh * 0.5, workTop - vh * 0.5, contactTop - vh * 0.5]
      store.roleAt = roleMid / vh
      const vw = window.innerWidth
      stars = starRefs.current
        .filter((el): el is HTMLElement => !!el)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { x: (r.left + r.width / 2) / vw - 0.5, y: r.top + r.height / 2 + y0, r: Math.min(r.width, r.height) / 2 }
        })
    }
    const morphAt = (y: number) => {
      for (let i = 1; i < keys.length; i++) {
        if (y <= keys[i][0]) {
          const [y0, m0] = keys[i - 1]
          const [y1, m1] = keys[i]
          const t = (y - y0) / (y1 - y0)
          return m0 + (m1 - m0) * t * t * (3 - 2 * t)
        }
      }
      return keys[keys.length - 1][1]
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    window.addEventListener('resize', measure)

    let px = window.innerWidth / 2
    let py = window.innerHeight / 2
    let cx = px
    let cy = py
    let overLink = false
    let overPicker = false
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      px = e.clientX
      py = e.clientY
      store.ndcX = (px / window.innerWidth) * 2 - 1
      store.ndcY = -((py / window.innerHeight) * 2 - 1)
      store.pointerOn = 1
      const target = e.target as Element | null
      overLink = !!target?.closest?.('a, button')
      // the shared design picker lives outside this page: leave it its own cursor
      overPicker = !!target?.closest?.('.picker')
    }
    const onLeave = () => {
      store.pointerOn = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    let raf = 0
    let last = performance.now()
    let prevY = window.scrollY
    let first = true
    let nameBottom = -1
    const text = (el: HTMLElement | null, v: string) => {
      if (el && el.textContent !== v) el.textContent = v
    }
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      lenisRef.current?.raf(now)

      const vh = window.innerHeight
      const y = window.scrollY
      const max = Math.max(1, document.documentElement.scrollHeight - vh)
      const target = morphAt(y)
      store.morph = first ? target : store.morph + (target - store.morph) * (1 - Math.exp(-dt * 5))
      first = false
      store.vel = Math.max(-1, Math.min(1, ((y - prevY) / dt / vh) * 0.3))
      prevY = y
      store.scroll = y / vh
      store.workProg = Math.max(0, Math.min(1, (y - workTop + vh) / (workH + vh)))

      const p = Math.max(0, Math.min(1, y / max))
      text(pctRef.current, String(Math.round(p * 100)).padStart(3, '0'))
      const section = 1 + stops.filter((stop) => y >= stop).length
      // clusters follow their labels: viewport-relative, in viewport heights from the centre
      store.clusters = stars.map((st) => ({ x: st.x, y: (st.y - y) / vh - 0.5, r: st.r / vh }))
      store.clustersIn = !!whatRef.current?.classList.contains('is-in')
      text(secRef.current, pad2(section))
      text(fpsRef.current, store.fps ? pad2(store.fps) : '00')
      text(xRef.current, signed(store.ndcX))
      text(yRef.current, signed(store.ndcY))
      if (railRef.current) railRef.current.style.transform = `scaleY(${p.toFixed(4)})`
      root.style.setProperty('--hero', Math.max(0, 1 - y / (vh * 0.32)).toFixed(3))
      if (store.nameBottom !== nameBottom) {
        nameBottom = store.nameBottom
        if (nameBottom > 0) root.style.setProperty('--name-bottom', `${nameBottom.toFixed(1)}px`)
        else root.style.removeProperty('--name-bottom')
      }
      root.classList.toggle('cst--scrolled', y > vh * 0.55)

      const cur = cursorRef.current
      if (cur) {
        const k = 1 - Math.exp(-dt * 14)
        cx += (px - cx) * k
        cy += (py - cy) * k
        cur.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`
        cur.classList.toggle('is-on', store.pointerOn === 1 && !overPicker)
        cur.classList.toggle('is-link', overLink)
      }
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      tick(now)
    }
    const dev = window as unknown as { __cstTick?: (now: number) => void }
    if (FORCE_AWAKE) dev.__cstTick = tick
    else raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      if (FORCE_AWAKE) delete dev.__cstTick
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [hidden, store, realType])

  // Local clock: the viewer's own time, nothing claimed about location.
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const set = () => {
      if (timeRef.current) timeRef.current.textContent = fmt.format(new Date())
    }
    set()
    const id = window.setInterval(set, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Reveal on first sight.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.4 })
    else el.scrollIntoView({ behavior: env.reduced ? 'auto' : 'smooth', block: 'start' })
    if (id !== 'cst-top') el.focus({ preventScroll: true })
  }

  const rowHandlers = (i: number) => ({
    onPointerEnter: (e: ReactPointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType === 'touch') return
      store.active = i
      firePulse(store, e.clientX, e.clientY)
    },
    onPointerLeave: () => {
      if (store.active === i) store.active = -1
    },
    onFocus: (e: FocusEvent<HTMLAnchorElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      store.active = i
      firePulse(store, r.left + r.width * 0.2, r.top + r.height / 2)
    },
    onBlur: () => {
      if (store.active === i) store.active = -1
    },
  })

  const discHandlers = (i: number) => ({
    onPointerEnter: (e: ReactPointerEvent<HTMLLIElement>) => {
      if (e.pointerType === 'touch') return
      store.clusterActive = i
    },
    onPointerLeave: () => {
      if (store.clusterActive === i) store.clusterActive = -1
    },
  })

  const linkHandlers = {
    onPointerEnter: (e: ReactPointerEvent<HTMLAnchorElement>) => {
      if (e.pointerType === 'touch') return
      store.warm = 1
      firePulse(store, e.clientX, e.clientY)
    },
    onPointerLeave: () => {
      store.warm = 0
    },
    onFocus: (e: FocusEvent<HTMLAnchorElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      store.warm = 1
      firePulse(store, r.left + r.width * 0.2, r.top + r.height / 2)
    },
    onBlur: () => {
      store.warm = 0
    },
  }

  const cls = [
    'cst',
    realType ? 'cst--type' : 'cst--particles',
    env.reduced ? 'cst--still' : '',
    env.coarse ? 'cst--coarse' : '',
    entered ? 'cst--in' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} ref={rootRef}>
      {showField && (
        <Field
          store={store}
          name={env.stack ? NAME_STACKED : NAME_SINGLE}
          groups={projects.length}
          clusters={person.disciplines.length}
          count={env.count}
          sphere={realType}
          still={env.reduced}
          bloom={env.bloom}
          paused={hidden}
          dprMax={env.dprMax}
          manual={FORCE_AWAKE}
          onFail={onFail}
        />
      )}
      <div className="cst-veil" aria-hidden="true" />

      <main>
        <section id="cst-top" className="cst-hero" ref={heroRef}>
          {realType ? (
            <h1 className="cst-name" aria-label={person.name}>
              <span className="cst-name-line" aria-hidden="true">
                <NameChars text={person.firstName} from={0} />
              </span>
              <span className="cst-name-line" aria-hidden="true">
                <NameChars text={person.lastName} from={person.firstName.length} />
              </span>
            </h1>
          ) : (
            <h1 className="cst-sr">{person.name}</h1>
          )}
          <p className="cst-hero-role">
            <Split text={person.role} by="char" />
          </p>
          <p className="cst-hint" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </p>
        </section>

        <section id="cst-role" className="cst-role" ref={roleRef} tabIndex={-1} data-reveal>
          <p className="cst-eyebrow">
            <span>02</span> Role
          </p>
          <h2 className="cst-role-title">
            <Split text={person.role} by="char" />
          </h2>
          <p className="cst-statement">
            <Split text={person.tagline} by="word" from={6} />
          </p>
        </section>

        <section id="cst-disciplines" className="cst-what" ref={whatRef} tabIndex={-1} data-reveal>
          <h2 className="cst-eyebrow">
            <span>03</span> Disciplines
          </h2>
          <ol className="cst-what-list">
            {person.disciplines.map((d, i) => (
              <li key={d} style={{ '--d': `${i * 220}ms` } as CSSProperties} {...discHandlers(i)}>
                {/* empty anchor: the field parks this discipline's cluster here */}
                <i
                  className="cst-star"
                  aria-hidden="true"
                  ref={(el) => {
                    starRefs.current[i] = el
                  }}
                />
                <span className="cst-what-n" aria-hidden="true">
                  {pad2(i + 1)}
                </span>
                <span className="cst-what-name">
                  <Split text={d} by="word" />
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section id="cst-work" className="cst-work" ref={workRef} tabIndex={-1}>
          <div className="cst-see" data-reveal>
            <p className="cst-eyebrow">
              <span>04</span> Work
            </p>
            <a className="cst-link cst-link--see" href={see.linkedin.url} target="_blank" rel="noopener noreferrer" {...linkHandlers}>
              <span className="cst-link-label">
                <Split text={see.linkedin.label} by="word" />
              </span>
              <span className="cst-link-handle">
                {see.linkedin.handle}
                <span className="cst-sr"> (opens in a new tab)</span>
              </span>
              <Arrow />
            </a>
          </div>

          <header className="cst-work-head" data-reveal>
            <a className="cst-link cst-link--see" href={see.github.url} target="_blank" rel="noopener noreferrer" {...linkHandlers}>
              <span className="cst-link-label">
                <Split text={see.github.label} by="word" />
              </span>
              <span className="cst-link-handle">
                {see.github.handle}
                <span className="cst-sr"> (opens in a new tab)</span>
              </span>
              <Arrow />
            </a>
            <h2 className="cst-h2">
              <Split text={work.heading} by="char" />
              <sup aria-hidden="true">{pad2(projects.length)}</sup>
            </h2>
            <p className="cst-note">{work.note}</p>
          </header>

          <ol className="cst-list">
            {projects.map((p, i) => (
              <li className="cst-item" key={p.name} data-reveal>
                <a className="cst-row" href={p.url} target="_blank" rel="noopener noreferrer" {...rowHandlers(i)}>
                  <span className="cst-row-idx" aria-hidden="true">
                    {pad2(i + 1)}
                  </span>
                  <h3 className="cst-row-name">
                    {p.name}
                    <span className="cst-sr"> (opens in a new tab)</span>
                  </h3>
                  <span className="cst-row-side">
                    <span className="cst-row-meta">
                      <span className="cst-row-kind">{p.kind}</span>
                      <span>{p.lang}</span>
                      {p.figures.map((f) => (
                        <span className="cst-row-fig" key={f}>
                          {f}
                        </span>
                      ))}
                    </span>
                    <span className="cst-row-blurb">
                      <span>{p.blurb}</span>
                    </span>
                  </span>
                  <span className="cst-row-go">
                    <Arrow />
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section id="cst-contact" className="cst-contact" ref={contactRef} tabIndex={-1}>
          <h2 className="cst-eyebrow" data-reveal>
            <span>05</span> {contact.heading}
          </h2>
          <ul className="cst-links">
            {links.map((l) => (
              <li key={l.url} data-reveal>
                <a className="cst-link" href={l.url} target="_blank" rel="noopener noreferrer" {...linkHandlers}>
                  <span className="cst-link-label">
                    <Split text={l.label} by="char" />
                  </span>
                  <span className="cst-link-handle">
                    {l.handle}
                    <span className="cst-sr"> (opens in a new tab)</span>
                  </span>
                  <Arrow />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="cst-foot">
        <p>
          © {person.year} {person.name}
        </p>
        <a href="#cst-top" onClick={jump('cst-top')}>
          Back to top
        </a>
      </footer>

      {/* Top bar: in-page anchors only. It comes after the content in the DOM so
          the name stays first in reading order; it is fixed, so it still sits on top. */}
      <header className="cst-bar">
        <a className="cst-mark" href="#cst-top" onClick={jump('cst-top')}>
          {person.name}
        </a>
        <nav className="cst-nav" aria-label="Sections">
          <a className="cst-nav-wide" href="#cst-disciplines" onClick={jump('cst-disciplines')}>
            Disciplines
          </a>
          <a href="#cst-work" onClick={jump('cst-work')}>
            Work
          </a>
          <a href="#cst-contact" onClick={jump('cst-contact')}>
            {contact.heading}
          </a>
        </nav>
        <p className="cst-clock">
          Local time <b ref={timeRef}>00:00:00</b>
        </p>
      </header>

      <div className="cst-scrim cst-scrim--top" aria-hidden="true" />
      <div className="cst-scrim cst-scrim--bottom" aria-hidden="true" />

      <aside className="cst-hud" aria-hidden="true">
        <span>
          Scroll <b ref={pctRef}>000</b>
        </span>
        <span>
          Section <b ref={secRef}>01</b> / {pad2(SECTIONS)}
        </span>
        {showField && !env.reduced && (
          <>
            <span>
              Points <b>{env.count.toLocaleString('en-GB')}</b>
            </span>
            <span>
              FPS <b ref={fpsRef}>00</b>
            </span>
            {!env.coarse && (
              <span>
                X <b ref={xRef}>+0.00</b> Y <b ref={yRef}>+0.00</b>
              </span>
            )}
          </>
        )}
      </aside>
      <div className="cst-rail" aria-hidden="true">
        <i ref={railRef} />
      </div>
      {!env.coarse && !env.reduced && <div className="cst-cursor" ref={cursorRef} aria-hidden="true" />}
    </div>
  )
}

function NameChars({ text, from }: { text: string; from: number }) {
  return (
    <>
      {Array.from(text).map((c, i) => (
        <span className="cst-m" key={i}>
          <span style={{ '--i': from + i } as CSSProperties}>{c}</span>
        </span>
      ))}
    </>
  )
}
