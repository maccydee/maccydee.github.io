import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import { contact, links, person, projects, see, work } from '../../content'
import { createNameEngine } from './engine'
import { capCentre, fitLine, refit } from './fit'
import { Arrow, Bands, BigLink, bodyLast, DLines, DMeta, FitLines, Hud, NAME_LINES, Panel, SeeLink } from './parts'
import { EXTRA_BEAT, LEAD, pad2, STEP, T, timecode, UNIT } from './timing'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const SLATS = [0, 1, 2, 3, 4]
const THETA = 16 // degrees: the slant of the invert edge in the role scene
// Disciplines beyond the four choreographed ones get a plain wipe-up takeover each.
const EXTRAS = person.disciplines.slice(4)

export default function Film() {
  const root = useRef<HTMLDivElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const introDone = useRef(false)
  const [fonts, setFonts] = useState(false)
  const [layout, setLayout] = useState(0)

  // Wait for both typefaces: every pin distance and fitted line depends on them.
  useEffect(() => {
    let live = true
    const done = () => {
      if (live) setFonts(true)
    }
    const timer = window.setTimeout(done, 3500)
    Promise.all([
      document.fonts.load('900 48px "Roboto Flex Variable"', 'CALUMcDON'),
      document.fonts.load('italic 400 24px "Instrument Serif"', 'Engineering'),
    ])
      .then(() => document.fonts.ready)
      .then(done, done)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [])

  // Rebuild the film when the frame changes size. Phones resize constantly as
  // the address bar moves, so on touch only a width change (or a large height
  // change, such as rotation) counts.
  useEffect(() => {
    let w = window.innerWidth
    let h = window.innerHeight
    let id = 0
    const onResize = () => {
      window.clearTimeout(id)
      id = window.setTimeout(() => {
        const nw = window.innerWidth
        const nh = window.innerHeight
        const coarse = window.matchMedia('(pointer: coarse)').matches
        if (nw !== w || (!coarse && nh !== h) || Math.abs(nh - h) > 160) {
          w = nw
          h = nh
          setLayout((n) => n + 1)
        }
      }, 180)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Smooth scroll, driven by the GSAP ticker so Lenis and ScrollTrigger share one clock.
  useEffect(() => {
    ScrollTrigger.config({ ignoreMobileResize: true })
    // Touch devices keep their native momentum scroll: Lenis adds nothing there and
    // an animated scroll it owns cannot be interrupted by a finger.
    if (window.matchMedia('(pointer: coarse)').matches) return
    const lenis = new Lenis({ autoRaf: false, lerp: 0.11 })
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(raf)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  useGSAP(
    () => {
      const el = root.current
      if (!el || !fonts) return
      const stage = el.querySelector<HTMLElement>('.stage')!
      const spacer = el.querySelector<HTMLElement>('.spacer')!
      const $ = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s))
      const $1 = (s: string) => el.querySelector<HTMLElement>(s)!

      /* ---------------------------------------------------------------- */
      /* Measure                                                           */
      /* ---------------------------------------------------------------- */
      const W = stage.clientWidth
      const H = stage.clientHeight
      const compact = W < 820 || H > W
      const pad = Math.round(clamp(W * 0.022, 16, 36))
      const full = W - pad * 2
      el.style.setProperty('--pad', `${pad}px`)
      el.classList.add('is-measuring')

      // 01: the name.
      const engine = createNameEngine($1('.name'))
      const footH = $1('.s1__foot').offsetHeight
      const nameBudget = H - 60 - footH - (compact ? 20 : 8)
      engine.layout(W, pad, Math.min(nameBudget / 2 / 0.885, compact ? H * 0.3 : H))

      // 03 and 04: width-fitted headlines.
      const fitAll = (sel: string, sizes: number[], grow = 1) =>
        $(sel).map((line, i) => {
          const fMax = sizes[Math.min(i, sizes.length - 1)]
          return fitLine(line, { target: full, fMax, fHard: fMax * grow })
        })
      fitAll('.d1 .fit', [compact ? H * 0.2 : H * 0.33])
      const fit2 = fitAll('.d2 .fit', [compact ? H * 0.17 : H * 0.3])
      fitAll('.d3 .fit', compact ? [H * 0.34, H * 0.15] : [H * 0.5, H * 0.25])
      fitAll('.d4 .fit', [compact ? H * 0.17 : H * 0.31])
      fitAll('.dx .fit', [compact ? H * 0.2 : H * 0.33])
      fitAll('.see__h .fit', [compact ? H * 0.18 : H * 0.3], 1.2)
      fitAll('.work__h .fit', [compact ? H * 0.18 : H * 0.26], 1.4)

      $('.panel--p').forEach((panel) => {
        const lines = Array.from(panel.querySelectorAll<HTMLElement>('.panel__name .fit'))
        const n = lines.length
        const target = compact ? full : W * 0.56 - pad
        const fMax = compact ? Math.min(H * 0.17, (H * 0.27) / n / 0.885) : Math.min(H * 0.34, (H * 0.52) / n / 0.885)
        lines.forEach((l) => fitLine(l, { target, fMax, fHard: fMax * 1.3 }))
        // On a short phone a three-line name climbs into the outlined numeral.
        // The numeral gives way: it shrinks to the space left above the name.
        const num = panel.querySelector<HTMLElement>('.panel__num')
        const name = panel.querySelector<HTMLElement>('.panel__name')
        if (num && name) {
          num.style.fontSize = ''
          if (compact) {
            const room = name.offsetTop - num.offsetTop - 10
            if (room < num.offsetHeight) num.style.fontSize = `${Math.max(40, room / 0.8).toFixed(1)}px`
          }
        }
      })

      // 05: links rest condensed and open out to the full width on hover.
      // Both share one size (the largest that suits the longer word).
      const bigTexts = $('.biglink__text')
      const bigLim = full * (compact ? 0.86 : 0.56)
      let bigF = compact ? H * 0.15 : H * 0.29
      for (const t of bigTexts) {
        t.style.fontSize = `${bigF}px`
        t.style.setProperty('--wdth', '25')
        const w = t.offsetWidth
        if (w > bigLim) bigF = (bigF * bigLim) / w
      }
      for (const t of bigTexts) {
        t.style.fontSize = `${bigF.toFixed(2)}px`
        let a = 25
        let b = 151
        for (let i = 0; i < 10; i++) {
          const m = (a + b) / 2
          t.style.setProperty('--wdth', m.toFixed(2))
          if (t.offsetWidth > full) b = m
          else a = m
        }
        t.style.setProperty('--wdth-hover', a.toFixed(2))
        t.style.setProperty('--wdth', '25')
      }

      /* ---------------------------------------------------------------- */
      /* Split                                                             */
      /* ---------------------------------------------------------------- */
      const split = (t: Element) => SplitText.create(t, { type: 'chars', charsClass: 'ch' }).chars as HTMLElement[]
      const d1Chars = $('.d1 .fit').map(split)
      const d2Chars = $('.d2 .fit').map(split)
      const d3Chars = $('.d3 .fit').map(split)
      const d4Lines = $('.d4 .fit')
      const d4Chars = d4Lines.map(split)
      const dxEls = $('.rise--dx')
      const dxChars = dxEls.map((x) => Array.from(x.querySelectorAll<HTMLElement>('.fit')).map(split))
      const panels = $('.panel')
      const panelChars = panels.map((p) =>
        Array.from(p.querySelectorAll<HTMLElement>('.panel__name .fit, .work__h .fit, .see__h .fit')).map(split),
      )
      $('.fit').forEach(refit)

      /* ---------------------------------------------------------------- */
      /* Geometry for the two letterform transitions                       */
      /* ---------------------------------------------------------------- */
      // The O of "detection": its counter fills with ultraviolet, then the camera goes through it.
      const zoom = $1('.zoom')
      const dot = $1('.dot')
      const flatD1 = d1Chars.flat()
      const oEl = [...flatD1].reverse().find((c) => c.textContent?.toLowerCase() === 'o') ?? flatD1[flatD1.length - 1]
      const zr = zoom.getBoundingClientRect()
      const or = oEl.getBoundingClientRect()
      const oF = parseFloat(getComputedStyle(oEl).fontSize)
      const oCx = or.left + or.width / 2
      const oCy = or.top + capCentre(oF, 0.8)
      const dotW = or.width * 0.56
      const dotH = oF * 0.56
      dot.style.width = `${dotW}px`
      dot.style.height = `${dotH}px`
      dot.style.left = `${oCx - zr.left - dotW / 2}px`
      dot.style.top = `${oCy - zr.top - dotH / 2}px`
      zoom.style.transformOrigin = `${oCx - zr.left}px ${oCy - zr.top}px`
      const zoomS = clamp(
        2.3 * Math.max(Math.max(oCx, W - oCx) / Math.max(2, or.width * 0.1), Math.max(oCy, H - oCy) / (oF * 0.17)),
        30,
        260,
      )

      // The I of "AI": a window opens inside its stem and grows into the next discipline.
      const win = $1('.win')
      const winIn = $1('.win__in')
      const d3First = d3Chars[0] ?? []
      const iEl = d3First.find((c) => c.textContent === 'I') ?? d3First[d3First.length - 1] ?? $1('.d3')
      const ir = iEl.getBoundingClientRect()
      const iF = parseFloat(getComputedStyle(iEl).fontSize)
      const iCx = ir.left + ir.width / 2
      const iCy = ir.top + capCentre(iF, 0.8)
      const w0 = Math.max(4, ir.width * 0.4)
      const h0 = iF * 0.5
      win.style.left = `${iCx - w0 / 2}px`
      win.style.top = `${iCy - h0 / 2}px`
      win.style.width = `${w0}px`
      win.style.height = `${h0}px`
      winIn.style.left = `${-(iCx - w0 / 2)}px`
      winIn.style.top = `${-(iCy - h0 / 2)}px`
      winIn.style.width = `${W}px`
      winIn.style.height = `${H}px`
      winIn.style.transformOrigin = `${iCx}px ${iCy}px`
      const winSx = ((2 * Math.max(iCx, W - iCx)) / w0) * 1.03
      const winSy = ((2 * Math.max(iCy, H - iCy)) / h0) * 1.03

      // Role: a slanted edge sweeps across and everything behind it is inverted.
      // The inverted copy is clipped by a polygon rather than a rotated mask: a
      // rotated clip forces the type through an intermediate surface and aliases it.
      const s2b = $1('.s2b')
      const rad = (THETA * Math.PI) / 180
      const reach = (W / 2) * Math.cos(rad) + (H / 2) * Math.sin(rad) + 6

      // Where the letters of discipline two sit relative to the lens, for the fly-through.
      const flatD2 = d2Chars.flat()
      const d2Off = flatD2.map((c) => {
        const r = c.getBoundingClientRect()
        return { x: r.left + r.width / 2 - W / 2, y: r.top + r.height / 2 - H / 2 }
      })

      const track = $1('.track')
      const tracks = $('.band__track').map((t) => ({
        el: t,
        dir: Number(t.dataset.dir) || 1,
        unit: (t.firstElementChild as HTMLElement).offsetWidth,
      }))

      el.classList.remove('is-measuring')

      /* ---------------------------------------------------------------- */
      /* The film                                                          */
      /* ---------------------------------------------------------------- */
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
      const inv = { x: reach }
      const zp = { p: 0 }
      const ws = { x: 1, y: 1 }
      const riseOf = (sel: string, at: number, d: number) => {
        tl.fromTo(sel, { yPercent: 100 }, { yPercent: 0, duration: d, ease: 'expo.inOut' }, at)
        tl.fromTo(`${sel} > .rise__in`, { yPercent: -100 }, { yPercent: 0, duration: d, ease: 'expo.inOut' }, at)
      }
      const maskedRise = (lines: HTMLElement[][], at: number, from = 100) => {
        lines.forEach((chars, li) => {
          tl.fromTo(
            chars,
            { yPercent: 108, '--wght': from },
            { yPercent: 0, '--wght': 900, duration: 0.55, ease: 'expo.out', stagger: 0.028 },
            at + li * 0.14,
          )
        })
      }

      // 01 Title: the name exhales to hairline as the lime field rises through it.
      tl.to(engine.state, { thin: 1, duration: T.thin[1] - T.thin[0], ease: 'power2.in' }, T.thin[0])
      riseOf('.s2a', T.lime[0], T.lime[1] - T.lime[0])

      // 02 Role: invert along a slanted edge, then the bands part.
      tl.to(inv, { x: -reach, duration: T.invert[1] - T.invert[0], ease: 'power3.inOut' }, T.invert[0])
      const outD = T.bandsOut[1] - T.bandsOut[0]
      tl.to('.s2b .band--a', { yPercent: -330, duration: outD, ease: 'expo.in' }, T.bandsOut[0])
      tl.to('.s2b .band--b', { yPercent: 330, duration: outD, ease: 'expo.in' }, T.bandsOut[0])

      // 03a Security detection: masked rise, weight arriving with the letters.
      tl.set('.d1', { opacity: 1 }, T.d1)
      maskedRise(d1Chars, T.d1 + 0.02)
      tl.fromTo('.d1 .d__meta', { opacity: 0 }, { opacity: 1, duration: 0.2 }, T.d1 + 0.45)
      tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: T.dot[1] - T.dot[0], ease: 'expo.out' }, T.dot[0])
      tl.to('.d1 .d__meta', { opacity: 0, duration: 0.12 }, T.zoom[0])
      tl.to(zp, { p: 1, duration: T.zoom[1] - T.zoom[0], ease: 'power2.in' }, T.zoom[0])

      // 03b Vulnerability management: the z-axis. Letters arrive from depth and leave through the lens.
      tl.set('.d2', { opacity: 1 }, T.d2)
      d2Chars.forEach((chars, li) => {
        tl.fromTo(
          chars,
          { scale: 0, '--wdth': 25 },
          {
            scale: 1,
            '--wdth': fit2[li]?.wdth ?? 100,
            duration: 0.6,
            ease: 'expo.out',
            stagger: { each: 0.022, from: 'center' },
          },
          T.d2 + 0.03 + li * 0.14,
        )
      })
      tl.fromTo('.d2 .d__meta', { opacity: 0 }, { opacity: 1, duration: 0.2 }, T.d2 + 0.5)
      const flyD = 0.4
      tl.fromTo(
        flatD2,
        { scale: 1, x: 0, y: 0 },
        {
          scale: 14,
          x: (i: number) => d2Off[i].x * 13,
          y: (i: number) => d2Off[i].y * 13,
          duration: flyD,
          ease: 'power4.in',
          stagger: { amount: T.d2Out[1] - T.d2Out[0] - flyD, from: 'center' },
          immediateRender: false,
        },
        T.d2Out[0],
      )
      tl.to('.d2 .d__meta', { opacity: 0, duration: 0.12 }, T.d2Out[0])
      const slats = $('.slat')
      const slatD = 0.48
      slats.forEach((s, i) => {
        const from = i % 2 === 0 ? -101 : 101
        const at = T.slats[0] + (i * (T.slats[1] - T.slats[0] - slatD)) / (slats.length - 1)
        tl.fromTo(s, { xPercent: from }, { xPercent: 0, duration: slatD, ease: 'expo.inOut' }, at)
        const inner = s.querySelector('.slat__in')
        if (inner) tl.fromTo(inner, { xPercent: -from }, { xPercent: 0, duration: slatD, ease: 'expo.inOut' }, at)
      })

      // 03c AI enablement: nothing moves, the weight floods in.
      tl.set('.d3', { opacity: 1 }, T.d3)
      d3Chars.forEach((chars, li) => {
        tl.fromTo(
          chars,
          { '--wght': 100 },
          { '--wght': 1000, duration: 0.5, ease: 'power3.inOut', stagger: li === 0 ? 0.16 : 0.035 },
          T.d3 + 0.08 + li * 0.18,
        )
      })
      tl.fromTo('.d3 .d__meta', { opacity: 0 }, { opacity: 1, duration: 0.2 }, T.d3 + 0.3)

      // 03d Exceptional vibe coding: the stem of the I becomes a column, then the whole frame.
      // Its lines arrive sideways, from opposite edges, leaning into the move and braking upright.
      tl.set(win, { opacity: 1 }, T.win[0])
      tl.to(ws, { y: winSy, duration: 0.3, ease: 'expo.inOut' }, T.win[0])
      tl.to(ws, { x: winSx, duration: T.win[1] - T.win[0] - 0.22, ease: 'power3.inOut' }, T.win[0] + 0.22)
      d4Chars.forEach((chars, li) => {
        const dir = li % 2 === 0 ? -1 : 1
        tl.fromTo(
          chars,
          { x: dir * W * 1.05 },
          { x: 0, duration: 0.5, ease: 'expo.out', stagger: { each: 0.026, from: dir < 0 ? 'end' : 'start' } },
          T.d4 + li * 0.14,
        )
        tl.fromTo(d4Lines[li], { skewX: dir * 18 }, { skewX: 0, duration: 0.75, ease: 'power3.out' }, T.d4 + li * 0.14)
      })
      tl.fromTo('.d4 .d__meta', { opacity: 0 }, { opacity: 1, duration: 0.2 }, T.d4 + 0.6)

      // Any further disciplines: a field wipes up, the lines rise.
      dxEls.forEach((_, j) => {
        const at = T.extra + j * EXTRA_BEAT
        riseOf(`.rise--dx[data-x="${j}"]`, at, 0.75)
        maskedRise(dxChars[j], at + 0.5)
      })

      // 04 Work: the reel wipes up. First LinkedIn, then GitHub and the repos.
      riseOf('.rise--work', T.reelRise[0], T.reelRise[1] - T.reelRise[0])
      maskedRise(panelChars[0], T.seeIn, 200)
      tl.fromTo('.see__sub > *', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', stagger: 0.08 }, T.seeIn + 0.3)

      const stepEase = 'power2.inOut'
      for (let k = 1; k < panels.length; k++) {
        tl.to(track, { x: -k * W, duration: STEP, ease: stepEase }, T.reel + (k - 1) * STEP)
      }
      panels.forEach((panel, k) => {
        panel.dataset.at = String(T.reel + k * STEP)
        const back = panel.querySelector<HTMLElement>('.panel__num, .work__sub, .see__sub')
        const front = panel.querySelector<HTMLElement>('.panel__name, .work__h, .see__h')
        if (k >= 1) {
          const tIn = T.reel + (k - 1) * STEP
          if (back) tl.fromTo(back, { x: -0.3 * W }, { x: 0, duration: STEP, ease: stepEase }, tIn)
          if (front) tl.fromTo(front, { x: 0.16 * W }, { x: 0, duration: STEP, ease: stepEase }, tIn)
          tl.fromTo(
            panelChars[k].flat(),
            { yPercent: 108, '--wght': 300 },
            { yPercent: 0, '--wght': 900, duration: STEP * 0.5, ease: 'expo.out', stagger: { amount: STEP * 0.2 } },
            tIn + STEP * 0.3,
          )
          tl.fromTo(
            panel.querySelectorAll('.panel__info > *, .work__top, .work__sub > *'),
            { opacity: 0, y: 26 },
            { opacity: 1, y: 0, duration: STEP * 0.3, ease: 'power3.out', stagger: STEP * 0.04 },
            tIn + STEP * 0.56,
          )
        }
        if (k < panels.length - 1) {
          const tOut = T.reel + k * STEP
          if (back) tl.fromTo(back, { x: 0 }, { x: 0.3 * W, duration: STEP, ease: stepEase, immediateRender: false }, tOut)
          if (front) tl.fromTo(front, { x: 0 }, { x: -0.16 * W, duration: STEP, ease: stepEase, immediateRender: false }, tOut)
        }
      })

      // 05 Contact: two shutters close from opposite sides.
      const endD = T.end[1] - T.end[0]
      tl.fromTo('.shut--a', { xPercent: -100 }, { xPercent: 0, duration: endD, ease: 'expo.inOut' }, T.end[0])
      tl.fromTo('.shut--a .shut__in', { xPercent: 100 }, { xPercent: 0, duration: endD, ease: 'expo.inOut' }, T.end[0])
      tl.fromTo('.shut--b', { xPercent: 100 }, { xPercent: 0, duration: endD, ease: 'expo.inOut' }, T.end[0])
      tl.fromTo('.shut--b .shut__in', { xPercent: -100 }, { xPercent: 0, duration: endD, ease: 'expo.inOut' }, T.end[0])
      $('.biglink').forEach((a, i) => {
        a.dataset.at = String(T.total)
        tl.fromTo(
          a.querySelectorAll('.bl'),
          { yPercent: 112 },
          { yPercent: 0, duration: 0.45, ease: 'expo.out', stagger: 0.022 },
          T.end[0] + endD * 0.5 + i * 0.08,
        )
      })
      tl.fromTo('.biglink__meta, .foot', { opacity: 0 }, { opacity: 1, duration: 0.3 }, T.end[0] + endD * 0.75)
      $1('.foot').dataset.at = String(T.total)
      tl.to({}, { duration: 0.01 }, T.total - 0.01)

      // Rest points: the composed frame of every scene and every reel panel. When scrolling
      // stops the playhead eases to one of them, so the film never rests mid-wipe or with a
      // panel half off screen. A scroll that has covered more than a seventh of the way to the
      // next rest point carries on to it; a smaller nudge returns. Any new wheel, touch or key
      // input cancels the ease, so the viewer is never held.
      const rests = [
        0,
        1.5, // role, ink on lime
        2.8, // role, inverted
        T.d1 + 0.75,
        T.d2 + 1.0,
        T.d3 + 0.85,
        T.d4 + 1.25,
        ...dxEls.map((_, j) => T.extra + j * EXTRA_BEAT + 1.15),
        ...panels.map((_, k) => T.reel + k * STEP),
        T.total,
      ]
      el.dataset.rests = rests.map((r) => r.toFixed(2)).join(',')
      const snapTo = (progress: number, self?: ScrollTrigger) => {
        const t = progress * T.total
        let lo = rests[0]
        let hi = rests[rests.length - 1]
        for (const r of rests) {
          if (r <= t + 1e-4) lo = r
          if (r >= t - 1e-4) {
            hi = r
            break
          }
        }
        if (hi <= lo) return lo / T.total
        const f = (t - lo) / (hi - lo)
        const forward = (self?.direction ?? 1) >= 0
        return (forward ? (f > 0.14 ? hi : lo) : f < 0.86 ? lo : hi) / T.total
      }

      const st = ScrollTrigger.create({
        trigger: spacer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        animation: tl,
        snap: { snapTo, delay: 0.12, duration: { min: 0.25, max: 0.9 }, ease: 'power2.inOut', inertia: false },
      })

      /* ---------------------------------------------------------------- */
      /* Title card intro (time-based, plays once)                         */
      /* ---------------------------------------------------------------- */
      if (!introDone.current && window.scrollY < 8) {
        const lineEls = $('.name__line')
        const intro = gsap.timeline({
          delay: 0.15,
          onComplete: () => {
            introDone.current = true
          },
        })
        lineEls.forEach((line, li) => {
          intro.fromTo(
            line.querySelectorAll('.name__l'),
            { yPercent: 118 },
            { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: { each: 0.055, from: li % 2 === 0 ? 'start' : 'end' } },
            li * 0.12,
          )
        })
        intro.fromTo(engine.state, { sweep: 0, sweepAmt: 1 }, { sweep: 1, duration: 2.1, ease: 'power2.inOut' }, 0)
        intro.to(engine.state, { sweepAmt: 0, duration: 1.1, ease: 'power2.out' }, 1.6)
        intro.fromTo(
          '.s1__foot > *',
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09 },
          0.95,
        )
        intro.fromTo('.s1 .hud, .s1__cue', { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.out' }, 0.95)
      }

      /* ---------------------------------------------------------------- */
      /* Per-frame: everything derived from the playhead in one pass       */
      /* ---------------------------------------------------------------- */
      const tcNodes = $('.tc')
      const countNodes = $('.count')
      const fills = $('.bar__fill')
      const ovls = panels.map((p) => p.querySelector<HTMLElement>('.panel__ovl'))
      const bandPos: Record<string, number> = { '-1': 0, '1': 0 }
      const lead = LEAD - 1 // the counter and bar count projects only
      let lastTc = ''
      let lastIdx = -1
      let lastTx = NaN
      let lastInv = NaN
      let lastZoom = NaN
      let lastWx = NaN
      let lastWy = NaN
      let vel = 0

      const frame = (time: number, delta: number) => {
        const t = tl.time()
        const dt = Math.min(0.05, delta / 1000)

        const tc = timecode(t)
        if (tc !== lastTc) {
          lastTc = tc
          for (const n of tcNodes) n.textContent = tc
        }

        if (t < T.lime[1] + 0.05) engine.frame(time)

        vel += (st.getVelocity() - vel) * 0.12
        if (t > T.lime[0] - 0.1 && t < T.d1 + 0.1) {
          const speed = W * 0.07 + vel * 0.55
          bandPos['-1'] -= speed * dt
          bandPos['1'] += speed * dt
          const lean = clamp(vel / 170, -15, 15)
          for (const b of tracks) {
            const x = gsap.utils.wrap(-b.unit, 0, bandPos[String(b.dir)])
            b.el.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${(-b.dir * lean).toFixed(2)}deg)`
          }
        }

        if (inv.x !== lastInv) {
          lastInv = inv.x
          const lean = (H / 2) * Math.tan(rad)
          const mid = W / 2 + inv.x / Math.cos(rad)
          s2b.style.clipPath = `polygon(${(mid + lean).toFixed(1)}px 0, ${W + 4}px 0, ${W + 4}px ${H}px, ${(mid - lean).toFixed(1)}px ${H}px)`
        }

        if (zp.p !== lastZoom) {
          lastZoom = zp.p
          zoom.style.transform = zp.p > 0 ? `scale(${Math.pow(zoomS, zp.p).toFixed(4)})` : 'none'
        }

        if (ws.x !== lastWx || ws.y !== lastWy) {
          lastWx = ws.x
          lastWy = ws.y
          const open = ws.x >= winSx - 1e-3
          win.classList.toggle('is-full', open)
          win.style.transform = `scale(${ws.x.toFixed(5)}, ${ws.y.toFixed(5)})`
          winIn.style.transform = `scale(${(1 / ws.x).toFixed(7)}, ${(1 / ws.y).toFixed(7)})`
        }

        const tx = Number(gsap.getProperty(track, 'x')) || 0
        if (tx !== lastTx) {
          lastTx = tx
          for (let k = 0; k < panels.length; k++) {
            const sx = k * W + tx
            const o = ovls[k]
            if (o && sx > -W - 2 && sx < W + 2) o.style.transform = `translate3d(${(-sx).toFixed(2)}px,0,0)`
          }
          const pos = -tx / W - lead
          const prog = clamp(pos / Math.max(1, panels.length - 1 - lead), 0, 1)
          for (const f of fills) f.style.transform = `scaleX(${prog.toFixed(4)})`
          const idx = Math.max(0, Math.round(pos))
          if (idx !== lastIdx) {
            lastIdx = idx
            const s = pad2(idx)
            for (const c of countNodes) c.textContent = s
          }
        }
      }
      gsap.ticker.add(frame)
      frame(gsap.ticker.time, 16)
      el.classList.add('is-ready')

      // Keyboard: a focused link may be in a scene that is not on screen. Move the playhead to it.
      const onFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement | null
        if (!target?.matches?.(':focus-visible')) return
        const at = target.closest<HTMLElement>('[data-at]')?.dataset.at
        if (at == null) return
        const y = st.start + (Number(at) / tl.duration()) * (st.end - st.start)
        if (Math.abs(window.scrollY - y) < 4) return
        const lenis = lenisRef.current
        if (lenis) lenis.scrollTo(y, { duration: 0.9 })
        else window.scrollTo({ top: y, behavior: 'smooth' })
      }
      el.addEventListener('focusin', onFocus)

      const raf = requestAnimationFrame(() => ScrollTrigger.refresh())

      return () => {
        cancelAnimationFrame(raf)
        gsap.ticker.remove(frame)
        el.removeEventListener('focusin', onFocus)
        engine.destroy()
        win.classList.remove('is-full')
        for (const n of [zoom, win, winIn, ...tracks.map((b) => b.el), ...fills]) n.style.transform = ''
        s2b.style.clipPath = ''
        for (const o of ovls) if (o) o.style.transform = ''
        delete el.dataset.rests
      }
    },
    { scope: root, dependencies: [fonts, layout], revertOnUpdate: true },
  )

  const toStart = () => {
    const lenis = lenisRef.current
    if (lenis) lenis.scrollTo(0, { duration: 2.4 })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const d = person.disciplines

  return (
    <div className="film" ref={root}>
      <div className="stage">
        {/* 01 Title: the name, with the role and tagline. */}
        <section className="s1 t-ink" aria-label="Title">
          <Hud scene={1} quiet />
          <h1 className="name">
            <span className="sr">{person.name}</span>
            {NAME_LINES.map((letters, li) => (
              <span className="name__line" aria-hidden="true" key={li}>
                <span className="name__in">
                  {letters.map((ch, i) => (
                    <span className="name__l" key={i}>
                      {ch}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </h1>
          <div className="s1__foot">
            <p className="s1__role">{person.role}</p>
            <p className="s1__tag">{person.tagline}</p>
          </div>
          <p className="s1__cue" aria-hidden="true">
            Scroll <Arrow dir="down" />
          </p>
        </section>

        {/* 02 Role */}
        <div className="rise s2a" aria-hidden="true">
          <div className="rise__in t-lime">
            <Bands />
            <Hud scene={2} />
          </div>
        </div>
        <div className="s2b t-ink" aria-hidden="true">
          <Bands />
          <Hud scene={2} />
        </div>

        {/* 03 Disciplines: four choreographed takeovers, plus a plain one for any further item. */}
        {d[0] && (
          <section className="d d1 t-ink" aria-label="Disciplines">
            <h2 className="sr">Disciplines</h2>
            <div className="zoom">
              <span className="dot" aria-hidden="true" />
              <DLines text={d[0]} />
            </div>
            <DMeta i={0} />
            <Hud scene={3} />
          </section>
        )}
        {d[1] && (
          <section className="d d2 t-uv" aria-label={d[1]}>
            <DLines text={d[1]} centre />
            <DMeta i={1} />
            <Hud scene={3} />
          </section>
        )}
        <div className="slats" aria-hidden="true">
          {SLATS.map((i) => (
            <div className="slat" style={{ top: `${i * 20}%` }} key={i}>
              {i === 0 && (
                <div className="slat__in">
                  <Hud scene={3} />
                </div>
              )}
            </div>
          ))}
        </div>
        <section className="d d3 t-lime" aria-label={d[2]}>
          {d[2] && <DLines text={d[2]} />}
          {d[2] && <DMeta i={2} />}
          <Hud scene={3} />
        </section>
        <div className="win">
          <div className="win__in">
            <section className="d d4 t-ink" aria-label={d[3]}>
              {d[3] && <DLines text={d[3]} />}
              {d[3] && <DMeta i={3} />}
              <Hud scene={3} />
            </section>
          </div>
        </div>
        {EXTRAS.map((text, j) => (
          <div className="rise rise--dx" data-x={j} key={text}>
            <div className="rise__in">
              <section className={`d dx ${j % 2 === 0 ? 't-bone' : 't-ink'}`} aria-label={text}>
                <DLines text={text} />
                <DMeta i={j + 4} />
                <Hud scene={3} />
              </section>
            </div>
          </div>
        ))}

        {/* 04 Work: LinkedIn first, then GitHub leading the repos. */}
        <div className="rise rise--work">
          <div className="rise__in">
            <section className="work" aria-label="Work">
              <div className="track">
                <div className="panel panel--see t-lime">
                  <a className="see" href={see.linkedin.url} target="_blank" rel="noopener noreferrer">
                    <span className="see__wipe" aria-hidden="true" />
                    <span className="sr">
                      {see.linkedin.label} {see.linkedin.handle} (opens in a new tab)
                    </span>
                    <span className="see__sub" aria-hidden="true">
                      <em>{see.linkedin.handle}</em>
                      <Arrow dir="ne" weight={2.2} />
                    </span>
                    <span className="see__h" aria-hidden="true">
                      <FitLines lines={bodyLast(see.linkedin.label)} />
                    </span>
                  </a>
                  <div className="panel__ovl">
                    <Hud scene={4} />
                  </div>
                </div>
                <div className="panel panel--title t-ink">
                  <div className="work__top">
                    <SeeLink {...see.github} />
                  </div>
                  <h2 className="work__h">
                    <span className="sr">{work.heading}</span>
                    <FitLines lines={work.heading.split(' ')} />
                  </h2>
                  <div className="work__sub">
                    <p className="work__note">{work.note}</p>
                    <p className="work__n" aria-hidden="true">
                      <b>{pad2(projects.length)}</b> repositories <Arrow />
                    </p>
                  </div>
                  <div className="panel__ovl">
                    <Hud scene={4} reel />
                  </div>
                </div>
                {projects.map((p, i) => (
                  <Panel p={p} i={i} key={p.name} />
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* 05 Contact */}
        <section className="end" aria-label={contact.heading}>
          <h2 className="sr">{contact.heading}</h2>
          {links.slice(0, 2).map((l, i) => (
            <div className={i === 0 ? 'shut shut--a' : 'shut shut--b'} key={l.url}>
              <div className="shut__in t-ink">
                {i === 0 && <Hud scene={5} />}
                <BigLink n={i + 1} {...l} />
                {i === 1 && (
                  <footer className="foot">
                    <span>
                      © {person.year} {person.name}
                    </span>
                    <button type="button" className="foot__top" onClick={toStart}>
                      Back to start <Arrow dir="up" />
                    </button>
                  </footer>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
      <div className="spacer" aria-hidden="true" style={{ height: `${(T.total * UNIT + 1) * 100}vh` }} />
    </div>
  )
}
