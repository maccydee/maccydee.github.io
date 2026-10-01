import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { person } from '../../content'
import { SectionHead, finePointer, hash, pad, rng, sectionHeadIn, typeOn } from './util'

// Isometric exploded assembly, projected by hand so every line stays a true
// vector hairline. World space: x/y lie on the plate, z is up.
//   screen.x = x cos(yaw) - y sin(yaw)
//   screen.y = (x sin(yaw) + y cos(yaw)) sin(elev) - z cos(elev)

const H = 100 // plate half-size, local units
const T = 16 // plate thickness
const DROP = 240 // assembly drop height
const DEG = Math.PI / 180
const BASE_YAW = 45 * DEG
const BASE_ELEV = Math.asin(1 / Math.sqrt(3)) // true isometric, 35.26 degrees
const SQ2 = Math.SQRT2

const NAMES = person.disciplines
const N = NAMES.length
/** Plate indices, top plate first. Everything below is derived from N. */
const IDX = NAMES.map((_, i) => i)
/** Draw order: bottom plate first, so upper plates hide what is behind them. */
const DRAW = [...IDX].reverse()
const MID = (N - 1) / 2

function geometry(w: number, h: number) {
  // List mode: narrow, portrait stages put the callouts under the figure.
  const mobile = w < 760 && h > w
  // Exploded gap between plates, local units. Tightens as plates are added so the figure keeps its size.
  const G = mobile ? Math.max(104, 168 - (N - 3) * 58) : Math.max(100, 138 - (N - 3) * 18)
  const stackH = 2 * H * SQ2 * 0.577 + (N - 1) * (T + G) * 0.816 + T * 0.816
  let k: number
  let cx: number
  let cy: number
  if (mobile) {
    const top = 118
    const bottom = 34 + N * 48 // room for the parts list
    const avail = Math.max(240, h - top - bottom)
    k = Math.min((w * 0.64) / (2 * H * SQ2), avail / stackH)
    cx = w * 0.5
    cy = top + avail / 2
  } else {
    const narrow = w < 760
    k = Math.min((w * (narrow ? 0.36 : 0.33)) / (2 * H * SQ2), (h - 200) / stackH, 1.7)
    cx = w * (narrow ? 0.36 : 0.42)
    cy = (h + 90) / 2
  }
  const lx = cx + k * H * SQ2 + Math.max(48, w * 0.065)
  const ly = IDX.map((i) => cy + (i - MID) * (T + G) * k * 0.816 - (T / 2) * k * 0.816)
  const dimX = cx - k * H * SQ2 - (mobile ? 20 : 40)
  return { mobile, G, k, cx, cy, lx, ly, dimX, w, h }
}

type Geo = ReturnType<typeof geometry>

/* ---------- Etched plate faces ---------- */

const HOLES = [
  [-78, -78],
  [78, -78],
  [-78, 78],
  [78, 78],
] as const

function Radar() {
  const ticks: string[] = []
  for (let a = 0; a < 360; a += 15) {
    const r0 = 66
    const r1 = a % 45 === 0 ? 73 : 70
    const c = Math.cos(a * DEG)
    const s = Math.sin(a * DEG)
    ticks.push(`M${(c * r0).toFixed(2)} ${(s * r0).toFixed(2)}L${(c * r1).toFixed(2)} ${(s * r1).toFixed(2)}`)
  }
  return (
    <g>
      <circle className="bp-pl-thin" r={26} />
      <circle className="bp-pl-thin" r={44} />
      <circle className="bp-pl-line dp" r={62} />
      <path className="bp-pl-thin" d="M-62 0H-14M14 0H62M0 -62V-14M0 14V62" />
      <path className="bp-pl-thin" d={ticks.join('')} />
      <g className="bp-radar">
        <path className="bp-pl-wedge" d="M0 0L62 0A62 62 0 0 0 43.84 -43.84Z" />
        <path className="bp-pl-signal" d="M14 0H62" />
      </g>
      <circle className="bp-blip" cx={31} cy={-24} r={2.6} />
      <circle className="bp-blip" cx={-36} cy={20} r={2.6} />
      <circle className="bp-blip" cx={14} cy={50} r={2.6} />
    </g>
  )
}

function Matrix() {
  const cells = useMemo(() => {
    const r = rng(hash('matrix'))
    const out: { x: number; y: number; kind: 0 | 1 | 2 }[] = []
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if ((row === 2 || row === 3) && (col === 2 || col === 3)) continue // clear the bore
        const v = r()
        out.push({ x: -57.5 + col * 20, y: -57.5 + row * 20, kind: v > 0.78 ? 2 : v > 0.52 ? 1 : 0 })
      }
    }
    return out
  }, [])
  return (
    <g>
      <path className="bp-pl-line dp" d="M-58 -68H-68V-58M58 -68H68V-58M-58 68H-68V58M58 68H68V58" />
      {cells.map((c, i) => (
        <g key={i}>
          <rect className={c.kind === 2 ? 'bp-pl-solid' : 'bp-pl-thin'} x={c.x} y={c.y} width={15} height={15} />
          {c.kind === 1 && <path className="bp-pl-thin" d={`M${c.x} ${c.y + 15}L${c.x + 15} ${c.y}M${c.x} ${c.y + 7.5}L${c.x + 7.5} ${c.y}M${c.x + 7.5} ${c.y + 15}L${c.x + 15} ${c.y + 7.5}`} />}
        </g>
      ))}
      <path className="bp-pl-signal bp-scan" d="M-66 0H-18M18 0H66" />
    </g>
  )
}

function Network() {
  const cols = [
    { x: -56, ys: [-40, 0, 40] },
    { x: 0, ys: [-58, -27, 27, 58] },
    { x: 56, ys: [-40, 0, 40] },
  ]
  const edges: string[] = []
  for (let c = 0; c < 2; c++) {
    for (const y0 of cols[c].ys) for (const y1 of cols[c + 1].ys) edges.push(`M${cols[c].x} ${y0}L${cols[c + 1].x} ${y1}`)
  }
  const pulses = [edges[1], edges[6], edges[10], edges[14], edges[19], edges[21]]
  return (
    <g>
      <path className="bp-pl-thin" d={edges.join('')} />
      {pulses.map((d, i) => (
        <path key={i} className="bp-pl-signal bp-pulse" style={{ animationDelay: `${-i * 0.55}s` }} d={d} />
      ))}
      {cols.map((c) => c.ys.map((y) => <circle key={`${c.x}${y}`} className="bp-pl-node" cx={c.x} cy={y} r={5.5} />))}
    </g>
  )
}

/**
 * Prompt-to-code loop: a prompt line and a block of code lines, joined by a
 * closed track that a signal runs round.
 */
function Loop() {
  const track = 'M-40 -54H40A24 24 0 0 1 64 -30V30A24 24 0 0 1 40 54H-40A24 24 0 0 1 -64 30V-30A24 24 0 0 1 -40 -54Z'
  return (
    <g>
      <path className="bp-pl-line dp" d={track} />
      <path className="bp-pl-thin" d="M-36 -46H36A16 16 0 0 1 52 -30V30A16 16 0 0 1 36 46H-36A16 16 0 0 1 -52 30V-30A16 16 0 0 1 -36 -46Z" />
      {/* direction of travel */}
      <path className="bp-pl-line" d="M-5 -59L4 -54L-5 -49M5 49L-4 54L5 59M59 -5L64 4L69 -5M-59 5L-64 -4L-69 5" />
      {/* prompt */}
      <path className="bp-pl-line" d="M-42 -37L-35 -31L-42 -25" />
      <path className="bp-pl-thin" d="M-28 -31H6M-28 -25H-12" />
      <rect className="bp-pl-solid bp-cursor" x={10} y={-37} width={6} height={12} />
      <path className="bp-pl-thin" d="M26 -37H40V-25H26Z" />
      {/* tokens passing the bore */}
      <path className="bp-pl-thin" d="M-44 -6H-36V2H-44ZM-32 -6H-24V2H-32ZM24 -2H32V6H24ZM36 -2H44V6H36Z" />
      <path className="bp-pl-solid" d="M-32 -6H-24V2H-32ZM24 -2H32V6H24Z" />
      {/* code */}
      <path className="bp-pl-line" d="M-42 20H-46V40H-42M42 20H46V40H42" />
      <path className="bp-pl-thin" d="M-38 22H-14M-30 28H12M-30 34H-4M-38 40H-22M22 22H38M26 28H38M22 40H34" />
      <path className="bp-pl-signal bp-loop" d={track} />
    </g>
  )
}

/** One etched face per plate, in discipline order. Extra disciplines reuse the set. */
const FACES = [<Radar key="radar" />, <Matrix key="matrix" />, <Network key="network" />, <Loop key="loop" />]

function PlateTop({ i }: { i: number }) {
  return (
    <>
      <rect className="bp-pl-face dp" x={-H} y={-H} width={2 * H} height={2 * H} />
      <rect className="bp-pl-thin" x={-91} y={-91} width={182} height={182} />
      {HOLES.map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle className="bp-pl-line" cx={x} cy={y} r={6.5} />
          <path className="bp-pl-thin" d={`M${x - 3} ${y}H${x + 3}M${x} ${y - 3}V${y + 3}`} />
        </g>
      ))}
      {FACES[i % FACES.length]}
      <circle className="bp-pl-bore" r={9} />
      <circle className="bp-pl-thin" r={13.5} />
      {/* Sized so the longest name still clears the corner holes */}
      <text className="bp-pl-etch" x={-62} y={87.5} style={{ fontSize: Math.min(8.5, 124 / (NAMES[i].length * 0.78)) }}>
        {NAMES[i].toUpperCase()}
      </text>
    </>
  )
}

function PlateSide({ label }: { label?: string }) {
  const shade: string[] = []
  for (let u = -H + 6; u < H; u += 6) shade.push(`M${u} 2V${T - 2}`)
  return (
    <>
      <rect className="bp-pl-side dp" x={-H} y={0} width={2 * H} height={T} />
      <path className="bp-pl-shade" d={shade.join('')} />
      {label && (
        <g>
          <rect className="bp-pl-face" x={-92} y={2.5} width={26} height={T - 5} />
          <text className="bp-pl-etch bp-pl-etch--side" x={-79} y={T - 4.6} textAnchor="middle">
            {label}
          </text>
        </g>
      )}
    </>
  )
}

/* ---------- Section ---------- */

export default function Stack({ motion: motionPref }: { motion: boolean }) {
  // Very short viewports (a phone on its side) cannot hold a pinned figure:
  // they get the finished, separated drawing instead.
  const [motion] = useState(() => motionPref && window.innerHeight >= 520)
  const root = useRef<HTMLElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const geo = useMemo<Geo | null>(() => (size ? geometry(size.w, size.h) : null), [size])
  const geoRef = useRef(geo)
  geoRef.current = geo

  const st = useRef({
    explode: motion ? 0 : 1,
    drop: IDX.map(() => (motion ? 1 : 0)),
    spin: motion ? 0 : 0.5,
    yaw: BASE_YAW,
    elev: BASE_ELEV,
    px: 0,
    py: 0,
    live: !motion,
  })

  const el = useRef({
    top: [] as (SVGGElement | null)[],
    sa: [] as (SVGGElement | null)[],
    sb: [] as (SVGGElement | null)[],
    axis: [] as (SVGLineElement | null)[],
    leader: [] as (SVGPathElement | null)[],
    dot: [] as (SVGGElement | null)[],
    balloon: [] as (SVGGElement | null)[],
    z: [] as (HTMLElement | null)[],
    dimLine: null as SVGLineElement | null,
    dimExtA: null as SVGLineElement | null,
    dimExtB: null as SVGLineElement | null,
    dimArrA: null as SVGGElement | null,
    dimArrB: null as SVGGElement | null,
    dimText: null as SVGTextElement | null,
    view: null as HTMLElement | null,
  })

  const render = useCallback(() => {
    const g = geoRef.current
    if (!g) return
    const s = st.current
    const e = el.current
    const { k, cx, cy, G } = g
    const c = Math.cos(s.yaw)
    const sn = Math.sin(s.yaw)
    const sp = Math.sin(s.elev)
    const cp = Math.cos(s.elev)
    const f = (n: number) => n.toFixed(3)
    const zTop: number[] = []

    for (const i of IDX) {
      const z = (MID - i) * (T + s.explode * G) + T / 2 + s.drop[i] * DROP
      zTop[i] = z
      const oy = cy - z * k * cp
      e.top[i]?.setAttribute('transform', `matrix(${f(k * c)} ${f(k * sn * sp)} ${f(-k * sn)} ${f(k * c * sp)} ${f(cx)} ${f(oy)})`)
      e.sa[i]?.setAttribute('transform', `matrix(${f(k * sn)} ${f(-k * c * sp)} 0 ${f(k * cp)} ${f(cx + k * H * c)} ${f(oy + k * H * sn * sp)})`)
      e.sb[i]?.setAttribute('transform', `matrix(${f(k * c)} ${f(k * sn * sp)} 0 ${f(k * cp)} ${f(cx - k * H * sn)} ${f(oy + k * H * c * sp)})`)

      // Leader: from the plate's right-hand corner out to its balloon
      const px = cx + k * H * (c + sn)
      const py = oy + k * H * (sn - c) * sp
      let bx: number
      let by: number
      let d: string
      if (g.mobile) {
        bx = Math.min(g.w - 13, px + 22)
        by = py - 26
        const len = Math.hypot(bx - px, by - py) || 1
        d = `M${f(px)} ${f(py)}L${f(bx - ((bx - px) / len) * 12)} ${f(by - ((by - py) / len) * 12)}`
      } else {
        bx = g.lx
        by = g.ly[i]
        const run = Math.min(Math.abs(by - py), Math.max(0, bx - 12 - px - 16))
        d = `M${f(px)} ${f(py)}L${f(px + run)} ${f(by)}H${f(bx - 12)}`
      }
      e.leader[i]?.setAttribute('d', d)
      e.dot[i]?.setAttribute('transform', `translate(${f(px)} ${f(py)})`)
      e.balloon[i]?.setAttribute('transform', `translate(${f(bx)} ${f(by)})`)

      const zel = e.z[i]
      if (zel) {
        const dz = Math.round((MID - i) * s.explode * G * k * cp)
        const txt = `Z ${dz > 0 ? '+' : dz < 0 ? '-' : ' '}${pad(Math.abs(dz), 3)} px`
        if (zel.textContent !== txt) zel.textContent = txt
      }
    }

    // Assembly axis through the bores
    const ax = (line: SVGLineElement | null, zA: number, zB: number) => {
      if (!line) return
      line.setAttribute('x1', f(cx))
      line.setAttribute('x2', f(cx))
      line.setAttribute('y1', f(cy - zA * k * cp))
      line.setAttribute('y2', f(cy - zB * k * cp))
    }
    // axis[i] rises from plate i: to the underside of the plate above, or free above the top plate
    for (const i of IDX) {
      if (i === 0) ax(e.axis[0], zTop[0], zTop[0] + 26 + s.explode * 46)
      else ax(e.axis[i], zTop[i], zTop[i - 1] - T)
    }

    // Overall height, measured between the left-hand corners
    const lxp = cx - k * H * (c + sn)
    const lyo = k * H * (c - sn) * sp
    const yA = cy - zTop[0] * k * cp + lyo
    const yB = cy - (zTop[N - 1] - T) * k * cp + lyo
    const dx = g.dimX
    e.dimLine?.setAttribute('x1', f(dx))
    e.dimLine?.setAttribute('x2', f(dx))
    e.dimLine?.setAttribute('y1', f(yA))
    e.dimLine?.setAttribute('y2', f(yB))
    const ext = (line: SVGLineElement | null, y: number) => {
      if (!line) return
      line.setAttribute('x1', f(lxp - 5))
      line.setAttribute('x2', f(dx - 7))
      line.setAttribute('y1', f(y))
      line.setAttribute('y2', f(y))
    }
    ext(e.dimExtA, yA)
    ext(e.dimExtB, yB)
    e.dimArrA?.setAttribute('transform', `translate(${f(dx)} ${f(yA)}) rotate(90)`)
    e.dimArrB?.setAttribute('transform', `translate(${f(dx)} ${f(yB)}) rotate(-90)`)
    if (e.dimText) {
      e.dimText.setAttribute('transform', `translate(${f(dx - 8)} ${f((yA + yB) / 2)}) rotate(-90)`)
      const txt = `${Math.round(yB - yA)} PX`
      if (e.dimText.textContent !== txt) e.dimText.textContent = txt
    }
    if (e.view) {
      const txt = `Yaw ${(s.yaw / DEG).toFixed(1)}°  Elev ${(s.elev / DEG).toFixed(1)}°  Gap ${pad(s.explode * G * k * cp, 3)} px`
      if (e.view.textContent !== txt) e.view.textContent = txt
    }
  }, [])

  useLayoutEffect(() => {
    const node = stage.current
    if (!node) return
    const read = () => {
      const w = Math.round(node.clientWidth)
      const h = Math.round(node.clientHeight)
      setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    render()
  }, [geo, render])

  // View follows the pointer (or sways gently on touch); only while on screen.
  useEffect(() => {
    if (!motion) return
    const node = root.current
    if (!node) return
    const s = st.current
    const fine = finePointer()
    const onMove = (ev: PointerEvent) => {
      s.px = (ev.clientX / window.innerWidth - 0.5) * 2
      s.py = (ev.clientY / window.innerHeight - 0.5) * 2
    }
    if (fine) window.addEventListener('pointermove', onMove, { passive: true })
    const io = new IntersectionObserver(
      ([en]) => {
        s.live = en.isIntersecting
        node.classList.toggle('is-live', en.isIntersecting)
      },
      { rootMargin: '10% 0px 10% 0px' },
    )
    io.observe(node)
    const tick = (time: number) => {
      if (!s.live) return
      const sway = fine ? 0 : Math.sin(time * 0.7) * 3 * DEG
      const ty = BASE_YAW + (s.spin - 0.5) * 16 * DEG + s.px * 8 * DEG + sway
      const te = BASE_ELEV - s.py * 4 * DEG
      s.yaw += (ty - s.yaw) * 0.08
      s.elev += (te - s.elev) * 0.08
      render()
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [motion, render])

  const hasGeo = !!geo

  useGSAP(
    () => {
      if (!hasGeo || !motion) return
      const s = st.current
      const q = gsap.utils.selector(root)
      const head = q('.bp-sec')[0]

      // Entrance: the three plates drop into place from above, bottom first.
      const plates = DRAW.map((i) => q(`.bp-plate-g--${i}`)[0])
      gsap.set(q('.bp-plate-g'), { opacity: 0 })
      gsap.set(q('.bp-plate-g .dp'), { strokeDasharray: '1500 1500', strokeDashoffset: 1500 })
      gsap.set(q('.bp-stack__dim'), { opacity: 0 })
      const enter = sectionHeadIn(head, root.current ?? undefined)
      ;DRAW.forEach((i, n) => {
        const at = 0.25 + n * (0.84 / N)
        enter
          .to(plates[n], { opacity: 1, duration: 0.25, ease: 'none' }, at)
          .to(s.drop, { [i]: 0, duration: 1.15, ease: 'power4.out' }, at)
          .to(plates[n].querySelectorAll('.dp'), { strokeDashoffset: 0, duration: 1.2, ease: 'power1.inOut' }, at)
      })
      enter
        .set(q('.bp-plate-g .dp'), { strokeDasharray: 'none' })
        .to(q('.bp-stack__dim'), { opacity: 1, duration: 0.3, ease: 'none' }, '-=0.5')
      typeOn(enter, q('.bp-stack__view .bp-type'), 0.9, 0.02)

      // Pinned scrub: plates separate, leaders and callouts draw out in turn.
      gsap.set(q('.bp-leader'), { strokeDashoffset: 1 })
      gsap.set(q('.bp-stack__dot circle, .bp-balloon > g'), { scale: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.bp-callout__meta'), { opacity: 0 })
      gsap.set(q('.bp-callout__no'), { scale: 0 })
      gsap.set(q('.bp-axis'), { opacity: 0 })
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pin.current,
          start: 'top top',
          end: `+=${80 + N * 50}%`,
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          // Refresh before the triggers further down the page, whatever order they were created in.
          refreshPriority: 1,
          invalidateOnRefresh: true,
        },
      })
      tl.to(s, { explode: 1, duration: 0.62, ease: 'power2.inOut' }, 0.04)
        .to(s, { spin: 1, duration: 1 }, 0)
        .to(q('.bp-axis'), { opacity: 1, duration: 0.08 }, 0.08)
      IDX.forEach((i) => {
        const at = 0.12 + i * (0.62 / N)
        tl.to(q(`.bp-stack__dot--${i} circle`), { scale: 1, duration: 0.04, ease: 'back.out(3)' }, at)
          .to(q(`.bp-leader--${i}`), { strokeDashoffset: 0, duration: 0.1, ease: 'power2.out' }, at + 0.02)
          .to(q(`.bp-balloon--${i} > g`), { scale: 1, duration: 0.05, ease: 'back.out(2.5)' }, at + 0.1)
          .to(q(`.bp-callout--${i} .bp-callout__no`), { scale: 1, duration: 0.05, ease: 'back.out(2.5)' }, at + 0.1)
          .to(q(`.bp-callout--${i} .bp-callout__meta`), { opacity: 1, duration: 0.01 }, at + 0.16)
        typeOn(tl, q(`.bp-callout--${i} .bp-type`), at + 0.11, 0.004)
        // The balloon of the plate being called out is inked; the one before it steps back.
        tl.to(q(`.bp-balloon--${i}, .bp-callout--${i}`), { '--on': 1, duration: 0.04 }, at + 0.1)
        if (i > 0) tl.to(q(`.bp-balloon--${i - 1}, .bp-callout--${i - 1}`), { '--on': 0, duration: 0.04 }, at + 0.1)
      })
      tl.to({}, { duration: 0.12 })
    },
    { scope: root, dependencies: [hasGeo, motion] },
  )

  const g = geo

  return (
    <section id="bp-b" className={`bp-stack${motion ? '' : ' is-static'}`} ref={root} aria-label="Disciplines">
      <div className="bp-stack__pin" ref={pin}>
        <SectionHead
          letter="B"
          title="Disciplines"
          fig="Fig. 1 / Exploded view"
          note={motion ? `Plates 1 to ${N}. Scroll to separate them.` : `Plates 1 to ${N}, shown separated.`}
        />
        <div className={`bp-stack__stage${g?.mobile ? ' is-list' : ''}`} ref={stage}>
          {g && (
            <svg className="bp-stack__svg" width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true">
              {DRAW.map((i) => (
                <Fragment key={i}>
                  <g className={`bp-plate-g bp-plate-g--${i}`}>
                    <g ref={(n) => void (el.current.sb[i] = n)}>
                      <PlateSide />
                    </g>
                    <g ref={(n) => void (el.current.sa[i] = n)}>
                      <PlateSide label={`0${i + 1}`} />
                    </g>
                    <g ref={(n) => void (el.current.top[i] = n)}>
                      <PlateTop i={i} />
                    </g>
                  </g>
                  <line className="bp-axis" ref={(n) => void (el.current.axis[i] = n)} />
                </Fragment>
              ))}

              <g className="bp-stack__dim">
                <line className="bp-con-line" ref={(n) => void (el.current.dimExtA = n)} />
                <line className="bp-con-line" ref={(n) => void (el.current.dimExtB = n)} />
                <line className="bp-dimline" ref={(n) => void (el.current.dimLine = n)} />
                <g ref={(n) => void (el.current.dimArrA = n)}>
                  <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
                </g>
                <g ref={(n) => void (el.current.dimArrB = n)}>
                  <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
                </g>
                <text className="bp-dimtext" textAnchor="middle" ref={(n) => void (el.current.dimText = n)} />
              </g>

              {IDX.map((i) => (
                <g key={i}>
                  <path className={`d bp-leader bp-leader--${i}`} pathLength={1} ref={(n) => void (el.current.leader[i] = n)} />
                  <g className={`bp-stack__dot bp-stack__dot--${i}`} ref={(n) => void (el.current.dot[i] = n)}>
                    <circle className="bp-dot" r={3.5} />
                  </g>
                  <g className={`bp-balloon bp-balloon--${i}`} ref={(n) => void (el.current.balloon[i] = n)}>
                    <g>
                      <circle r={12} />
                      <text y={4.2} textAnchor="middle">
                        {i + 1}
                      </text>
                    </g>
                  </g>
                </g>
              ))}
            </svg>
          )}

          <ol className="bp-callouts">
            {IDX.map((i) => (
              <li
                key={i}
                className={`bp-callout bp-callout--${i}`}
                style={g && !g.mobile ? { left: g.lx + 26, top: g.ly[i] } : undefined}
              >
                <span className="bp-callout__no" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="bp-callout__body">
                  <span className="bp-callout__name">
                    <span className="bp-sr">{NAMES[i]}</span>
                    <span className="bp-type" aria-hidden="true">
                      {NAMES[i]}
                    </span>
                  </span>
                  <span className="bp-callout__meta" aria-hidden="true">
                    Plate 0{i + 1} / <span ref={(n) => void (el.current.z[i] = n)} />
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <p className="bp-stack__view" aria-hidden="true">
            <span className="bp-type">View</span> <span ref={(n) => void (el.current.view = n)} />
          </p>
        </div>
      </div>
    </section>
  )
}
