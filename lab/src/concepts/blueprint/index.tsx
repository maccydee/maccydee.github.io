import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './blueprint.css'

import { person } from '../../content'
import { GRID, finePointer, prefersReduced, scroller } from './util'
import Chrome from './Chrome'
import Hero from './Hero'
import Stack from './Stack'
import See from './See'
import Work from './Work'
import Contact from './Contact'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)
// Some annotations only exist at certain breakpoints; empty selections are expected.
gsap.config({ nullTargetWarn: false })
// Keep animation time tied to the clock, so a stalled tab catches up rather than replaying late.
gsap.ticker.lagSmoothing(0)
if (import.meta.env.DEV) (window as unknown as { __bp?: unknown }).__bp = { gsap, ScrollTrigger }

const BLUE = '#0b30ae'

/** Drafting-paper grid. Two layers that drift at different rates with scroll and pointer. */
function Backdrop({ motion }: { motion: boolean }) {
  const fine = useRef<HTMLElement>(null)
  const major = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!motion) return
    const f = fine.current
    const m = major.current
    if (!f || !m) return
    const MAJOR = GRID * 5
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 }
    const usePointer = finePointer()
    const onMove = (e: PointerEvent) => {
      ptr.tx = e.clientX / window.innerWidth - 0.5
      ptr.ty = e.clientY / window.innerHeight - 0.5
    }
    if (usePointer) window.addEventListener('pointermove', onMove, { passive: true })
    const tick = () => {
      ptr.x += (ptr.tx - ptr.x) * 0.06
      ptr.y += (ptr.ty - ptr.y) * 0.06
      const s = window.scrollY
      // The pattern is periodic, so wrapping the offset keeps the layer small.
      const fy = (-(s * 0.06) % GRID) - ptr.y * 6
      const my = (-(s * 0.14) % MAJOR) - ptr.y * 16
      f.style.transform = `translate3d(${(-ptr.x * 6).toFixed(2)}px, ${fy.toFixed(2)}px, 0)`
      m.style.transform = `translate3d(${(-ptr.x * 16).toFixed(2)}px, ${my.toFixed(2)}px, 0)`
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('pointermove', onMove)
    }
  }, [motion])

  return (
    <div className="bp-grid" aria-hidden="true">
      <i className="bp-grid__fine" ref={fine} />
      <i className="bp-grid__major" ref={major} />
      <i className="bp-grid__vignette" />
      <i className="bp-grid__grain" />
    </div>
  )
}

export default function Blueprint() {
  const [motion] = useState(() => !prefersReduced())
  const [ready, setReady] = useState(false)
  // Real render date, stamped in the footer like a plot date.
  const [plotted] = useState(() => {
    const d = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`
  })

  // Page-level background and overflow, restored on unmount.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = { hb: html.style.background, bb: body.style.background, ox: body.style.overflowX }
    html.style.background = BLUE
    body.style.background = BLUE
    body.style.overflowX = 'hidden'
    return () => {
      html.style.background = prev.hb
      body.style.background = prev.bb
      body.style.overflowX = prev.ox
    }
  }, [])

  // The hero measures real glyph metrics, so wait for the faces before drafting.
  useEffect(() => {
    let alive = true
    const done = () => alive && setReady(true)
    const timeout = window.setTimeout(done, 2500)
    Promise.all([
      document.fonts.load('700 100px "Barlow Condensed"'),
      document.fonts.load('600 100px "Barlow Condensed"'),
      document.fonts.load('500 12px "JetBrains Mono Variable"'),
    ])
      .then(done)
      .catch(done)
    return () => {
      alive = false
      window.clearTimeout(timeout)
    }
  }, [])

  // Smooth scroll, driven by the GSAP ticker so ScrollTrigger stays in step.
  useEffect(() => {
    if (!motion) return
    const lenis = new Lenis({ lerp: 0.11 })
    scroller.lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(raf)
    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      scroller.lenis = null
    }
  }, [motion])

  // Fonts and late layout shifts can move trigger positions.
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 300)
    return () => window.clearTimeout(id)
  }, [ready])

  return (
    <div className="bp" data-motion={motion ? 'on' : 'off'}>
      <Backdrop motion={motion} />
      {ready && (
        <>
          {/* Story order: name, role, disciplines, LinkedIn, GitHub and the repos, contact. */}
          <main className="bp-main">
            <Hero motion={motion} />
            <Stack motion={motion} />
            <See motion={motion} />
            <Work motion={motion} />
            <Contact motion={motion} />
          </main>
          <footer className="bp-foot">
            <span>
              © {person.year} {person.name}
            </span>
            <span className="bp-foot__end" aria-hidden="true">
              Plotted {plotted} / End of drawing
            </span>
          </footer>
          <Chrome motion={motion} />
        </>
      )}
    </div>
  )
}
