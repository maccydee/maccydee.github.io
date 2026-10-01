import { useEffect, useRef, useState, type MouseEvent } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { person } from '../../content'
import { SECTIONS, finePointer, pad, scroller } from './util'

const TICKS = Array.from({ length: 51 }, (_, i) => i)

/**
 * Persistent drawing-frame chrome: title strip, scroll ruler, zone letters and
 * the crosshair readout. Every number shown is read from the browser.
 */
export default function Chrome({ motion }: { motion: boolean }) {
  const [active, setActive] = useState(0)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const marker = useRef<HTMLDivElement>(null)
  const markerPct = useRef<HTMLSpanElement>(null)
  const ruler = useRef<HTMLDivElement>(null)
  const yRead = useRef<HTMLSpanElement>(null)
  const xh = useRef<HTMLDivElement>(null)
  const xv = useRef<HTMLDivElement>(null)
  const xr = useRef<HTMLDivElement>(null)
  const xrText = useRef<HTMLSpanElement>(null)

  // Which zone is under the centre line of the viewport.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            const i = SECTIONS.findIndex((s) => s.id === en.target.id)
            if (i >= 0) setActive(i)
          }
        })
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  // Scroll ruler and Y readout.
  useEffect(() => {
    let max = 1
    let rulerH = 0
    let last = -1
    const measure = () => {
      max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      rulerH = ruler.current ? ruler.current.clientHeight : 0
      last = -1
      setVp((p) => (p.w === window.innerWidth && p.h === window.innerHeight ? p : { w: window.innerWidth, h: window.innerHeight }))
    }
    const update = () => {
      const y = Math.round(window.scrollY)
      if (y === last) return
      last = y
      const p = Math.min(1, Math.max(0, y / max))
      if (marker.current) marker.current.style.transform = `translate3d(0, ${(p * rulerH).toFixed(1)}px, 0)`
      if (markerPct.current) markerPct.current.textContent = String(Math.round(p * 100)).padStart(2, '0')
      if (yRead.current) yRead.current.textContent = pad(y, 5)
    }
    measure()
    update()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    window.addEventListener('resize', measure)
    ScrollTrigger.addEventListener('refresh', measure)
    gsap.ticker.add(update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      ScrollTrigger.removeEventListener('refresh', measure)
      gsap.ticker.remove(update)
    }
  }, [])

  // Crosshair with live pointer coordinates (fine pointers only).
  useEffect(() => {
    if (!finePointer()) return
    const h = xh.current
    const v = xv.current
    const r = xr.current
    const t = xrText.current
    if (!h || !v || !r || !t) return
    let shown = false
    let hot = false
    const show = (on: boolean) => {
      if (shown === on) return
      shown = on
      h.style.opacity = v.style.opacity = on ? '1' : '0'
      r.style.opacity = on ? '1' : '0'
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      // The shared design picker lives outside this page: no crosshair over it.
      if ((e.target as Element | null)?.closest?.('.picker')) {
        show(false)
        return
      }
      const x = e.clientX
      const y = e.clientY
      h.style.transform = `translate3d(0, ${y}px, 0)`
      v.style.transform = `translate3d(${x}px, 0, 0)`
      // Keep the readout inside the viewport.
      const flipX = x > window.innerWidth - 190
      const flipY = y > window.innerHeight - 60
      r.style.transform = `translate3d(${x + (flipX ? -164 : 14)}px, ${y + (flipY ? -32 : 14)}px, 0)`
      t.textContent = `X ${pad(x)}  Y ${pad(y)}`
      const nowHot = !!(e.target as Element | null)?.closest?.('a, button')
      if (nowHot !== hot) {
        hot = nowHot
        r.classList.toggle('is-hot', hot)
        h.classList.toggle('is-hot', hot)
        v.classList.toggle('is-hot', hot)
      }
      show(true)
    }
    const onLeave = () => show(false)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    if (scroller.lenis) scroller.lenis.scrollTo(el, { duration: 1.4 })
    else el.scrollIntoView({ behavior: motion ? 'smooth' : 'auto' })
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`)
  }

  const cur = SECTIONS[active]

  return (
    <div className="bp-chrome">
      <div className="bp-bar">
        <a className="bp-bar__name" href="#bp-a" onClick={(e) => go(e, 'bp-a')}>
          {person.firstName} <span>{person.lastName}</span>
        </a>
        <span className="bp-bar__zone" aria-hidden="true">
          <b>{cur.letter}</b>
          {cur.name}
        </span>
        <span className="bp-bar__read" aria-hidden="true">
          <span className="bp-bar__vp">
            VP {vp.w} × {vp.h}
          </span>
          <span>
            Y <span ref={yRead}>00000</span>
          </span>
        </span>
      </div>

      <div className="bp-ruler" aria-hidden="true">
        <div className="bp-ruler__scale" ref={ruler}>
          {TICKS.map((i) => (
            <i key={i} className={i % 5 === 0 ? 'is-major' : undefined} style={{ top: `${i * 2}%` }}>
              {i % 5 === 0 && i > 0 && i < 50 && <span>{i * 2}</span>}
            </i>
          ))}
          <div className="bp-ruler__marker" ref={marker}>
            <span ref={markerPct}>00</span>
          </div>
        </div>
      </div>

      <nav className="bp-zones" aria-label="Sections">
        {SECTIONS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => go(e, s.id)}
            className={i === active ? 'is-active' : undefined}
            aria-current={i === active ? 'true' : undefined}
            aria-label={`${s.letter}: ${s.name}`}
          >
            {s.letter}
          </a>
        ))}
      </nav>

      <div className="bp-xh bp-xh--h" ref={xh} aria-hidden="true" />
      <div className="bp-xh bp-xh--v" ref={xv} aria-hidden="true" />
      <div className="bp-xr" ref={xr} aria-hidden="true">
        <span ref={xrText}>X 0000 Y 0000</span>
      </div>
    </div>
  )
}
