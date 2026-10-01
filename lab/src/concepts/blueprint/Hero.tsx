import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { person } from '../../content'
import { GRID, SECTIONS, Typed, typeOn } from './util'

const LINE1 = person.firstName.toUpperCase()
// Keep the lowercase "c" of "Mc": it is how the name is written.
const LINE2 = person.lastName.startsWith('Mc') ? `Mc${person.lastName.slice(2).toUpperCase()}` : person.lastName.toUpperCase()
const FACE = '700 200px "Barlow Condensed"'
/** Distance from the stage's bottom edge to the title block. Mirrors `.bp-hero__foot` in the CSS. */
const FOOT = 52
const FOOT_MOBILE = 58

// Rough outline length of each glyph in em, used only to pace the stroke draw.
const PERIMETER: Record<string, number> = { C: 3.6, A: 4.4, L: 2.9, U: 3.8, M: 6.2, c: 2.6, D: 3.9, O: 3.8, N: 5 }

type Metrics = { adv1: number; adv2: number; cap: number; o: { l: number; r: number } | null }

function measureFace(): Metrics {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return { adv1: 2.9, adv2: 3.8, cap: 0.7, o: null }
  ctx.font = FACE
  const m = (s: string) => ctx.measureText(s).width / 200
  const cap = ctx.measureText('H').actualBoundingBoxAscent / 200
  const oi = LINE2.indexOf('O')
  return {
    adv1: m(LINE1),
    adv2: m(LINE2),
    cap: cap || 0.7,
    o: oi >= 0 ? { l: m(LINE2.slice(0, oi)), r: m(LINE2.slice(0, oi + 1)) } : null,
  }
}

function layout(w: number, h: number, mt: Metrics, tbH: number) {
  const mobile = w < 720
  const x0 = mobile ? 34 : 72
  const right = mobile ? 2 : 20
  const top = mobile ? 58 : 76
  // Space kept clear for the title block, measured from the real element.
  const bottom = (mobile ? FOOT_MOBILE : FOOT) + tbH + 6
  const above = mobile ? 30 : 44
  const below = mobile ? 50 : 66
  const lineGap = 0.17
  const byW = (w - x0 - right) / Math.max(mt.adv1, mt.adv2)
  const availH = h - top - bottom - above - below
  const byH = availH / (2 * mt.cap + lineGap)
  const fs = Math.max(44, Math.min(byW, byH))
  const cap = mt.cap * fs
  const gap = lineGap * fs
  const block = cap * 2 + gap
  const yTop = top + above + Math.max(0, (availH - block) / 2)
  const y1 = yTop + cap
  const y2 = y1 + gap + cap
  const W1 = mt.adv1 * fs
  const W2 = mt.adv2 * fs
  const o = mt.o
    ? { cx: x0 + ((mt.o.l + mt.o.r) / 2) * fs, cy: y2 - cap / 2, hw: ((mt.o.r - mt.o.l) / 2) * fs }
    : null
  const dTop = yTop - (mobile ? 16 : 24) // width dimension, line 1
  const dBot = y2 + (mobile ? 30 : 40) // width dimension, line 2
  const dLeft = x0 - (mobile ? 16 : 30) // cap-height dimension
  // Where the type annotation and legend go: beside the first row when the
  // second row is long enough to leave room, otherwise above and below the name.
  const side = !mobile && W2 - W1 > 260 && cap > 150
  const sx = x0 + W1 + 72
  const anno = side
    ? { x: sx, y: yTop + cap * 0.3 - 31 }
    : dTop - top > 94
      ? { x: x0, y: dTop - 104 }
      : null
  const legend = side ? { x: sx, y: y1 - 80 } : h - bottom - dBot > 104 ? { x: x0, y: dBot + 20 } : null
  return { mobile, x0, fs, cap, gap, yTop, y1, y2, W1, W2, o, dTop, dBot, dLeft, side, anno, legend, w, h }
}

type L = ReturnType<typeof layout>

/** Horizontal dimension line with a centred label gap and arrowheads at both ends. */
function HDim({ xa, xb, y, labelW, textRef }: { xa: number; xb: number; y: number; labelW: number; textRef: (el: SVGTextElement | null) => void }) {
  const mid = (xa + xb) / 2
  const half = Math.min(labelW / 2, (xb - xa) / 2 - 12)
  return (
    <g className="bp-dim">
      <line className="d bp-dimline" pathLength={1} x1={mid - half} y1={y} x2={xa} y2={y} />
      <line className="d bp-dimline" pathLength={1} x1={mid + half} y1={y} x2={xb} y2={y} />
      <g transform={`translate(${xa} ${y})`}>
        <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
      </g>
      <g transform={`translate(${xb} ${y}) scale(-1 1)`}>
        <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
      </g>
      <text className="bp-dimtext" x={mid} y={y + 4} textAnchor="middle" ref={textRef} />
    </g>
  )
}

export default function Hero({ motion }: { motion: boolean }) {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [metrics] = useState(measureFace)
  const tbEl = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number; tb: number } | null>(null)

  const lay = useMemo<L | null>(() => (size ? layout(size.w, size.h, metrics, size.tb) : null), [size, metrics])
  const layRef = useRef<L | null>(lay)
  layRef.current = lay

  // Live dimension labels. `count.p` runs 0..1 during the intro so they count in.
  const count = useRef({ p: motion ? 0 : 1 })
  const dims = useRef<Record<string, Element | null>>({})
  const writeDims = useCallback(() => {
    const l = layRef.current
    if (!l) return
    const p = count.current.p
    const set = (k: string, v: string) => {
      const el = dims.current[k]
      if (el && el.textContent !== v) el.textContent = v
    }
    set('w1', `${Math.round(l.W1 * p)}`)
    set('w2', `${Math.round(l.W2 * p)} PX`)
    set('cap', `${Math.round(l.cap * p)}`)
    set('fs', `${Math.round(l.fs * p)} px`)
    set('capA', `${Math.round(l.cap * p)} px`)
    set('wA', `${Math.round(l.W2 * p)} px`)
  }, [])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      const tb = Math.round(tbEl.current?.offsetHeight ?? 0)
      setSize((p) => (p && p.w === w && p.h === h && p.tb === tb ? p : { w, h, tb }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    if (tbEl.current) ro.observe(tbEl.current)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [])

  useEffect(() => {
    writeDims()
  }, [lay, writeDims])

  const hasLayout = !!lay

  useGSAP(
    () => {
      if (!hasLayout || !motion) return
      const l = layRef.current
      if (!l) return
      const q = gsap.utils.selector(root)
      const chars = q('.bp-ch') as unknown as SVGTSpanElement[]

      // Initial states
      chars.forEach((c) => {
        const len = (PERIMETER[c.textContent ?? ''] ?? 4.6) * l.fs
        gsap.set(c, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len })
      })
      gsap.set(q('.bp-name--hatch, .bp-name--solid'), { clipPath: 'inset(-6% 106% -6% -6%)' })
      gsap.set(q('.bp-arrow'), { scale: 0, transformOrigin: '0% 50%' })
      gsap.set(q('.bp-cl'), { scale: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.bp-dot'), { scale: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.bp-rule-h'), { scaleX: 0 })
      gsap.set(q('.bp-tb'), { '--rule': 0, '--tb': 0 })
      gsap.set(q('.bp-rise'), { yPercent: 105 })
      gsap.set(q('.bp-num'), { opacity: 0 })
      gsap.set(q('.bp-legend i'), { scaleX: 0 })
      gsap.set(q('.bp-cue__line'), { scaleY: 0 })

      const tl = gsap.timeline({ delay: 0.2, defaults: { ease: 'power3.inOut' } })

      // 1. Construction geometry
      tl.to(q('.bp-reg .d'), { strokeDashoffset: 0, duration: 0.7, stagger: 0.03 }, 0)
        .to(q('.bp-c-h'), { strokeDashoffset: 0, duration: 1.1, stagger: 0.09 }, 0.05)
        .to(q('.bp-c-v'), { strokeDashoffset: 0, duration: 1.0, stagger: 0.1 }, 0.25)
      typeOn(tl, q('.bp-hero__top .bp-type'), 0.3, 0.02)
      tl.to(q('.bp-hero__top .bp-num'), { opacity: 1, duration: 0.01 }, 0.6)

      // 2. Letter outlines
      chars.forEach((c, i) => {
        tl.to(c, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' }, 0.55 + i * 0.07)
      })
      const outlineEnd = 0.55 + chars.length * 0.07 + 1.5

      // 3. Dimensions, measured from the rendered type
      tl.to(q('.bp-dimline'), { strokeDashoffset: 0, duration: 0.9, stagger: 0.05 }, 1.5)
        .to(q('.bp-arrow'), { scale: 1, duration: 0.4, ease: 'back.out(2.4)', stagger: 0.04 }, 2.1)
        .to(count.current, { p: 1, duration: 1.3, ease: 'power2.out', onUpdate: writeDims }, 1.6)
        .to(q('.bp-cl'), { scale: 1, duration: 0.7, stagger: 0.08 }, 2.0)
        .to(q('.bp-dot'), { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.05 }, 2.2)
        .to(q('.bp-leader'), { strokeDashoffset: 0, duration: 0.7 }, 2.1)
      typeOn(tl, q('.bp-hero__anno .bp-type'), 2.5, 0.018)
      tl.to(q('.bp-hero__anno .bp-num'), { opacity: 1, duration: 0.01, stagger: 0.12 }, 2.6)

      // 4. Ink: hatch first, then solid
      tl.to(q('.bp-name--hatch'), { clipPath: 'inset(-6% -6% -6% -6%)', duration: 1.0, ease: 'power2.inOut', stagger: 0.08 }, outlineEnd - 0.9)
        .to(q('.bp-name--solid'), { clipPath: 'inset(-6% -6% -6% -6%)', duration: 1.0, ease: 'power2.inOut', stagger: 0.08 }, outlineEnd - 0.45)
        .set(chars, { strokeDasharray: 'none' })
        .set(q('.bp-name--hatch, .bp-name--solid'), { clipPath: 'none' })

      // Scrolling away lifts the solid ink again, back to the hatched outline.
      gsap.fromTo(
        q('.bp-ink--solid'),
        { clipPath: 'inset(-6% -6% -6% -6%)' },
        {
          clipPath: 'inset(-6% -6% -6% 106%)',
          ease: 'none',
          scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom 30%', scrub: 0.4 },
        },
      )

      // 5. Title block
      const tb = 2.3
      tl.to(q('.bp-tb .d'), { strokeDashoffset: 0, duration: 1.1 }, tb)
        .to(q('.bp-tb'), { '--tb': 1, duration: 0.8, ease: 'power2.out' }, tb + 0.3)
        .to(q('.bp-rule-h'), { scaleX: 1, duration: 0.8, stagger: 0.1 }, tb + 0.25)
        .to(q('.bp-tb'), { '--rule': 1, duration: 0.7 }, tb + 0.5)
        .to(q('.bp-rise'), { yPercent: 0, duration: 0.9, ease: 'power3.out' }, tb + 0.4)
      typeOn(tl, q('.bp-tb .bp-label .bp-type'), tb + 0.3, 0.03)
      typeOn(tl, q('.bp-tb__tag .bp-type'), tb + 0.6, 0.012)
      typeOn(tl, q('.bp-tb__cells dd .bp-type'), tb + 0.9, 0.04)

      // 6. Legend and scroll cue
      tl.to(q('.bp-legend i'), { scaleX: 1, duration: 0.6, stagger: 0.08 }, tb + 0.5)
      typeOn(tl, q('.bp-legend .bp-type'), tb + 0.6, 0.015)
      typeOn(tl, q('.bp-cue .bp-type'), tb + 1.0, 0.05)
      // The cue line keeps drawing downward for as long as the hero is on screen.
      gsap.fromTo(
        q('.bp-cue__line'),
        { scaleY: 0 },
        { scaleY: 1, duration: 1.5, ease: 'power2.inOut', repeat: -1, repeatDelay: 0.6, delay: tb + 1.3 },
      )
    },
    { scope: root, dependencies: [hasLayout, motion] },
  )

  const l = lay

  return (
    <section id="bp-a" className="bp-hero" ref={root} aria-label="Title">
      <h1 className="bp-sr">{person.name}</h1>
      <div className="bp-hero__stage" ref={stage}>
        {l && (
          <svg className="bp-hero__svg" width={l.w} height={l.h} viewBox={`0 0 ${l.w} ${l.h}`} aria-hidden="true">
            <defs>
              <pattern id="bp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#f4f6ff" strokeWidth="1.4" />
              </pattern>
            </defs>

            {/* Registration marks at the stage corners */}
            <g className="bp-reg">
              {[
                [10, 10],
                [l.w - 10, 10],
                [10, l.h - 10],
                [l.w - 10, l.h - 10],
              ].map(([x, y], i) => (
                <g key={i}>
                  <circle className="d" pathLength={1} cx={x} cy={y} r={5} />
                  <line className="d" pathLength={1} x1={x - 10} y1={y} x2={x + 10} y2={y} />
                  <line className="d" pathLength={1} x1={x} y1={y - 10} x2={x} y2={y + 10} />
                </g>
              ))}
            </g>

            {/* Construction lines: cap height and baseline for both rows, plus word extents */}
            <g className="bp-con">
              {[l.yTop, l.y1, l.y2 - l.cap, l.y2].map((y, i) => (
                <line key={i} className="d bp-c-h" pathLength={1} x1={0} y1={y} x2={l.w} y2={y} />
              ))}
              <line className="d bp-c-v" pathLength={1} x1={l.x0} y1={0} x2={l.x0} y2={l.h} />
              <line className="d bp-c-v" pathLength={1} x1={l.x0 + l.W1} y1={l.dTop - 14} x2={l.x0 + l.W1} y2={l.y1 + 12} />
              <line className="d bp-c-v" pathLength={1} x1={l.x0 + l.W2} y1={l.yTop - 18} x2={l.x0 + l.W2} y2={l.dBot + 14} />
              <line className="d bp-c-v" pathLength={1} x1={l.x0 - 4} y1={l.yTop} x2={l.dLeft - 8} y2={l.yTop} />
              <line className="d bp-c-v" pathLength={1} x1={l.x0 - 4} y1={l.y1} x2={l.dLeft - 8} y2={l.y1} />
            </g>

            {/* The name: hatch layer, solid layer, outline */}
            {[
              { cls: 'bp-name bp-name--hatch', wrap: 'bp-ink bp-ink--hatch', fill: 'url(#bp-hatch)' },
              { cls: 'bp-name bp-name--solid', wrap: 'bp-ink bp-ink--solid', fill: undefined },
            ].map((layer) => (
              <g key={layer.cls} className={layer.wrap}>
                <text className={layer.cls} x={l.x0} y={l.y1} fontSize={l.fs} fill={layer.fill}>
                  {LINE1}
                </text>
                <text className={layer.cls} x={l.x0} y={l.y2} fontSize={l.fs} fill={layer.fill}>
                  {LINE2}
                </text>
              </g>
            ))}
            <text className="bp-name bp-name--outline" x={l.x0} y={l.y1} fontSize={l.fs}>
              {LINE1.split('').map((c, i) => (
                <tspan key={i} className="bp-ch">
                  {c}
                </tspan>
              ))}
            </text>
            <text className="bp-name bp-name--outline" x={l.x0} y={l.y2} fontSize={l.fs}>
              {LINE2.split('').map((c, i) => (
                <tspan key={i} className="bp-ch">
                  {c}
                </tspan>
              ))}
            </text>

            {/* Centre mark through the O */}
            {l.o && (
              <g className="bp-centre">
                <line className="bp-cl" x1={l.o.cx - l.o.hw - 16} y1={l.o.cy} x2={l.o.cx + l.o.hw + 16} y2={l.o.cy} />
                <line className="bp-cl" x1={l.o.cx} y1={l.o.cy - l.cap / 2 - 16} x2={l.o.cx} y2={l.o.cy + l.cap / 2 + 16} />
                <circle className="bp-dot" cx={l.o.cx} cy={l.o.cy} r={3} />
              </g>
            )}

            {/* Measured dimensions */}
            <HDim xa={l.x0} xb={l.x0 + l.W1} y={l.dTop} labelW={l.mobile ? 44 : 56} textRef={(el) => void (dims.current.w1 = el)} />
            <HDim xa={l.x0} xb={l.x0 + l.W2} y={l.dBot} labelW={l.mobile ? 70 : 96} textRef={(el) => void (dims.current.w2 = el)} />
            <g className="bp-dim">
              <line className="d bp-dimline" pathLength={1} x1={l.dLeft} y1={l.yTop} x2={l.dLeft} y2={l.y1} />
              <g transform={`translate(${l.dLeft} ${l.yTop}) rotate(90)`}>
                <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
              </g>
              <g transform={`translate(${l.dLeft} ${l.y1}) rotate(-90)`}>
                <path className="bp-arrow" d="M0 0L10 -3.2L10 3.2Z" />
              </g>
              <text
                className="bp-dimtext"
                textAnchor="middle"
                transform={`translate(${l.dLeft - 7} ${(l.yTop + l.y1) / 2}) rotate(-90)`}
                ref={(el) => void (dims.current.cap = el)}
              />
            </g>

            {/* Leader to the type annotation */}
            {l.side && (
              <g>
                <path
                  className="d bp-leader"
                  pathLength={1}
                  d={`M${l.x0 + l.W1 - l.fs * 0.03} ${l.yTop + l.cap * 0.3}L${l.x0 + l.W1 + 34} ${l.yTop + l.cap * 0.3 - 22}H${l.x0 + l.W1 + 64}`}
                />
                <circle className="bp-dot" cx={l.x0 + l.W1 - l.fs * 0.03} cy={l.yTop + l.cap * 0.3} r={3} />
              </g>
            )}
          </svg>
        )}

        <div className="bp-hero__top">
          <span className="bp-label">
            <Typed>Sheet A / Title</Typed>
          </span>
          <span className="bp-label bp-hero__top-r">
            <span className="bp-hero__vp">
              <Typed>Stage</Typed>{' '}
              <span className="bp-num">{size ? `${size.w} × ${size.h} px` : ''}</span>
            </span>
            <span className="bp-hero__grid">
              <Typed>Grid</Typed> <span className="bp-num">{GRID} px</span>
            </span>
          </span>
        </div>

        {l && l.anno && (
          <dl className="bp-hero__anno" style={{ left: l.anno.x, top: l.anno.y }} aria-hidden="true">
            <div>
              <dt>
                <span className="bp-type">Face</span>
              </dt>
              <dd>
                <span className="bp-type">Barlow Condensed 700</span>
              </dd>
            </div>
            <div>
              <dt>
                <span className="bp-type">Size</span>
              </dt>
              <dd className="bp-num" ref={(el) => void (dims.current.fs = el)} />
            </div>
            <div>
              <dt>
                <span className="bp-type">Cap</span>
              </dt>
              <dd className="bp-num" ref={(el) => void (dims.current.capA = el)} />
            </div>
            <div>
              <dt>
                <span className="bp-type">Width</span>
              </dt>
              <dd className="bp-num" ref={(el) => void (dims.current.wA = el)} />
            </div>
          </dl>
        )}

        {l && l.legend && (
          <ul className="bp-legend" style={{ left: l.legend.x, top: l.legend.y }} aria-hidden="true">
            <li>
              <i className="is-solid" />
              <span className="bp-type">Outline</span>
            </li>
            <li>
              <i className="is-thin" />
              <span className="bp-type">Construction</span>
            </li>
            <li>
              <i className="is-centre" />
              <span className="bp-type">Centre line</span>
            </li>
            <li>
              <i className="is-dim" />
              <span className="bp-type">Dimension, px</span>
            </li>
          </ul>
        )}

        {l && (
          <div className="bp-cue" style={{ left: l.dLeft, top: l.y2 - l.cap, height: l.cap }} aria-hidden="true">
            <span className="bp-cue__text">
              <span className="bp-type">Scroll</span>
            </span>
            <span className="bp-cue__line" />
          </div>
        )}

        <div className="bp-hero__foot">
          <div className="bp-tb" ref={tbEl}>
            <svg className="bp-frame" aria-hidden="true">
              <rect className="d" pathLength={1} x="0.5" y="0.5" />
            </svg>
            <div className="bp-tb__row">
              <span className="bp-label">
                <Typed>Role</Typed>
              </span>
              <p className="bp-tb__role">
                <span className="bp-mask">
                  <span className="bp-rise">{person.role}</span>
                </span>
              </p>
            </div>
            <i className="bp-rule-h" aria-hidden="true" />
            <div className="bp-tb__row">
              <span className="bp-label">
                <Typed>Scope</Typed>
              </span>
              <p className="bp-tb__tag">
                <Typed>{person.tagline}</Typed>
              </p>
            </div>
            <i className="bp-rule-h" aria-hidden="true" />
            <dl className="bp-tb__cells">
              <div>
                <dt className="bp-label">
                  <Typed>Sheet</Typed>
                </dt>
                <dd>
                  <Typed>{`A 1/${SECTIONS.length}`}</Typed>
                </dd>
              </div>
              <div>
                <dt className="bp-label">
                  <Typed>Scale</Typed>
                </dt>
                <dd>
                  <Typed>1:1</Typed>
                </dd>
              </div>
              <div>
                <dt className="bp-label">
                  <Typed>Units</Typed>
                </dt>
                <dd>
                  <Typed>px</Typed>
                </dd>
              </div>
              <div>
                <dt className="bp-label">
                  <Typed>Year</Typed>
                </dt>
                <dd>
                  <Typed>{String(person.year)}</Typed>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}
