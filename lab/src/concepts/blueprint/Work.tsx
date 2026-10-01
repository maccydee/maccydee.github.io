import { useMemo, useRef } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import { projects, see, work, type Project } from '../../content'
import { makeGlyph } from './glyph'
import { SectionHead, Typed, finePointer, sectionHeadIn, typeOn } from './util'

const TOTAL = String(projects.length).padStart(2, '0')

/** "17,807 employer boards" -> value 17807, suffix "", label "employer boards". */
function parseFigure(s: string) {
  const m = /^([\d,]+)(\S*)\s+(.*)$/.exec(s)
  if (!m) return { text: s, value: null as number | null, suffix: '', label: '' }
  return { text: `${m[1]}${m[2]}`, value: Number(m[1].replace(/,/g, '')), suffix: m[2], label: m[3] }
}

function Sheet({ p, i, motion }: { p: Project; i: number; motion: boolean }) {
  const li = useRef<HTMLLIElement>(null)
  const no = String(i + 1).padStart(2, '0')
  const glyph = useMemo(() => makeGlyph(p.name), [p.name])
  const figs = useMemo(() => p.figures.map(parseFigure), [p.figures])

  useGSAP(
    (_ctx, contextSafe) => {
      if (!motion || !contextSafe) return
      const node = li.current
      if (!node) return
      const q = gsap.utils.selector(li)
      const sheet = q('.bp-sheet')[0] as HTMLElement
      const blurb = q('.bp-sheet__blurb')[0]
      let entered = false

      gsap.set(q('.bp-rule-h'), { scaleX: 0 })
      gsap.set(q('.bp-sheet__tb'), { '--rule': 0 })
      gsap.set(q('.bp-rise'), { yPercent: 105 })
      gsap.set(q('.bp-g-pad'), { scale: 0, transformOrigin: '50% 50%' })
      gsap.set(q('.bp-g-spin'), { '--r': `${-glyph.prim.turn}deg` })
      gsap.set(q('.bp-g-arcs'), { '--r': '0deg' })
      gsap.set(q('.bp-fig__ln'), { scaleX: 0 })
      gsap.set(q('.bp-fig__arr'), { scale: 0 })
      gsap.set(q('.bp-fig__num, .bp-sheet__open'), { opacity: 0 })
      gsap.set(blurb, { autoAlpha: 0 })
      gsap.set(sheet, { '--bg': 0 })

      const tl = gsap.timeline({
        scrollTrigger: { trigger: node, start: 'top 88%', once: true },
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          entered = true
        },
      })
      tl.to(q('.bp-frame .d'), { strokeDashoffset: 0, duration: 1.3, ease: 'power3.inOut' }, 0)
        .to(sheet, { '--bg': 1, duration: 0.9, ease: 'power2.out' }, 0.2)
        .to(q('.bp-rule-h'), { scaleX: 1, duration: 0.9, ease: 'power3.inOut', stagger: 0.08 }, 0.2)
        .to(q('.bp-sheet__tb'), { '--rule': 1, duration: 0.6, ease: 'power3.inOut' }, 0.6)
        .to(q('.bp-glyph .d'), { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.05 }, 0.25)
        .to(q('.bp-g-spin'), { '--r': '0deg', duration: 1.4, ease: 'power3.inOut' }, 0.25)
        .to(q('.bp-g-pad'), { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.04 }, 0.9)
        .to(q('.bp-rise'), { yPercent: 0, duration: 0.9 }, 0.35)
        .to(q('.bp-sheet__open'), { opacity: 1, duration: 0.01 }, 0.7)
        .add(
          contextSafe(() => {
            // Split at play time so the line breaks match the current width.
            const split = new SplitText(blurb, { type: 'lines', mask: 'lines', aria: 'none' })
            gsap.set(blurb, { autoAlpha: 1 })
            gsap.from(split.lines, {
              yPercent: 110,
              duration: 0.8,
              ease: 'power3.out',
              stagger: 0.06,
              onComplete: () => split.revert(),
            })
          }),
          0.5,
        )
        .to(q('.bp-fig__ln'), { scaleX: 1, duration: 0.6, ease: 'power3.inOut' }, 0.8)
        .to(q('.bp-fig__arr'), { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 1.2)
        .to(q('.bp-fig__num'), { opacity: 1, duration: 0.01 }, 0.85)
      typeOn(tl, q('.bp-sheet__top .bp-type'), 0.3, 0.03)
      typeOn(tl, q('.bp-sheet__topics .bp-type'), 0.55, 0.012)
      typeOn(tl, q('.bp-fig__label .bp-type'), 1.0, 0.014)
      typeOn(tl, q('.bp-sheet__tb .bp-type'), 0.75, 0.025)

      // Figures count up to the real value.
      const nums = q('.bp-fig__num')
      nums.forEach((el, n) => {
        const f = figs[n]
        if (!f || f.value === null) return
        const o = { v: 0 }
        const final = f.text
        tl.to(
          o,
          {
            v: f.value,
            duration: 1.1,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = `${Math.round(o.v).toLocaleString('en-GB')}${f.suffix}`
            },
            onComplete: () => {
              el.textContent = final
            },
          },
          0.85,
        )
      })

      // Hover: redraw the schematic, turn the primary form, tilt the sheet.
      const hover = gsap
        .timeline({ paused: true })
        .fromTo(q('.bp-g-trace'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut', stagger: 0.07, immediateRender: false }, 0)
        .fromTo(q('.bp-g-spin'), { '--r': '0deg' }, { '--r': `${glyph.prim.turn}deg`, duration: 1.1, ease: 'power3.inOut', immediateRender: false }, 0)
        .fromTo(q('.bp-g-arcs'), { '--r': '0deg' }, { '--r': '-360deg', duration: 1.4, ease: 'power2.inOut', immediateRender: false }, 0)
        .fromTo(q('.bp-g-pad'), { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', stagger: 0.04, immediateRender: false }, 0.45)

      const play = () => {
        if (entered) hover.restart()
      }
      const link = q('a')[0]
      link?.addEventListener('focus', play)

      const fine = finePointer()
      const rx = gsap.quickTo(sheet, 'rotationX', { duration: 0.5, ease: 'power3.out' })
      const ry = gsap.quickTo(sheet, 'rotationY', { duration: 0.5, ease: 'power3.out' })
      const tz = gsap.quickTo(sheet, 'z', { duration: 0.5, ease: 'power3.out' })
      let rect: DOMRect | null = null
      const onEnter = () => {
        rect = node.getBoundingClientRect()
        tz(36)
        play()
      }
      const onMove = (e: PointerEvent) => {
        if (!rect) rect = node.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width - 0.5
        const ny = (e.clientY - rect.top) / rect.height - 0.5
        ry(nx * 11)
        rx(-ny * 9)
      }
      const onLeave = () => {
        rect = null
        rx(0)
        ry(0)
        tz(0)
      }
      if (fine) {
        node.addEventListener('pointerenter', onEnter)
        node.addEventListener('pointermove', onMove)
        node.addEventListener('pointerleave', onLeave)
      }
      return () => {
        link?.removeEventListener('focus', play)
        node.removeEventListener('pointerenter', onEnter)
        node.removeEventListener('pointermove', onMove)
        node.removeEventListener('pointerleave', onLeave)
      }
    },
    { scope: li, dependencies: [motion] },
  )

  return (
    <li ref={li}>
      <article className="bp-sheet">
        <svg className="bp-frame" aria-hidden="true">
          <rect className="d" pathLength={1} x="0.5" y="0.5" />
        </svg>

        <div className="bp-sheet__top">
          <span className="bp-label">
            <Typed>{`Sheet ${no}`}</Typed>
          </span>
          <span className="bp-sheet__open" aria-hidden="true">
            GitHub
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path d="M2 10L10 2M4 2H10V8" />
            </svg>
          </span>
        </div>
        <i className="bp-rule-h" aria-hidden="true" />

        <div className="bp-sheet__panel">
          <svg className="bp-glyph" viewBox="0 0 120 120" aria-hidden="true">
            <path className="d bp-g-corner" pathLength={1} d="M0 8V0H8M112 0H120V8M120 112V120H112M8 120H0V112" />
            <g className="bp-g-arcs" style={{ transformOrigin: `${glyph.prim.cx}px ${glyph.prim.cy}px` }}>
              {glyph.arcs.map((d, n) => (
                <path key={n} className="d bp-g-arc" pathLength={1} d={d} />
              ))}
            </g>
            {glyph.traces.map((d, n) => (
              <path key={n} className="d bp-g-trace" pathLength={1} d={d} />
            ))}
            <g className="bp-g-spin" style={{ transformOrigin: `${glyph.prim.cx}px ${glyph.prim.cy}px` }}>
              <path className="d bp-g-prim" pathLength={1} d={glyph.prim.d} />
              <path className="d bp-g-inner" pathLength={1} d={glyph.inner} />
            </g>
            <path className="d bp-g-ticks" pathLength={1} d={glyph.ticks} />
            {glyph.pads.map((pd, n) => (
              <circle key={n} className={`bp-g-pad${pd.solid ? ' is-solid' : ''}`} cx={pd.x} cy={pd.y} r={3.2} />
            ))}
          </svg>
          <div className="bp-sheet__topics">
            <span className="bp-label">
              <Typed>Topics</Typed>
            </span>
            <ul>
              {p.topics.map((t) => (
                <li key={t}>
                  <Typed>{t}</Typed>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <i className="bp-rule-h" aria-hidden="true" />

        <div className="bp-sheet__body">
          <h3 className="bp-sheet__name">
            <a href={p.url} target="_blank" rel="noreferrer">
              <span className="bp-mask">
                <span className="bp-rise">{p.name}</span>
              </span>
              <span className="bp-sr"> on GitHub (opens in a new tab)</span>
            </a>
          </h3>
          <p className="bp-sheet__blurb">{p.blurb}</p>
          {figs.length > 0 && (
            <ul className="bp-figs">
              {figs.map((f) => (
                <li key={f.text + f.label} className="bp-fig">
                  <span className="bp-fig__dim">
                    <i className="bp-fig__arr" aria-hidden="true" />
                    <i className="bp-fig__ln" aria-hidden="true" />
                    <b className="bp-fig__num">{f.text}</b>
                    <i className="bp-fig__ln is-r" aria-hidden="true" />
                    <i className="bp-fig__arr is-r" aria-hidden="true" />
                  </span>
                  <span className="bp-fig__label">
                    <Typed>{f.label}</Typed>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <i className="bp-rule-h" aria-hidden="true" />
        <dl className="bp-sheet__tb">
          <div>
            <dt className="bp-label">
              <Typed>Kind</Typed>
            </dt>
            <dd>
              <Typed>{p.kind}</Typed>
            </dd>
          </div>
          <div>
            <dt className="bp-label">
              <Typed>Lang</Typed>
            </dt>
            <dd>
              <Typed>{p.lang}</Typed>
            </dd>
          </div>
          <div>
            <dt className="bp-label">
              <Typed>Licence</Typed>
            </dt>
            <dd>
              <Typed>MIT</Typed>
            </dd>
          </div>
          <div>
            <dt className="bp-label">
              <Typed>Sheet</Typed>
            </dt>
            <dd>
              <Typed>{`${no}/${TOTAL}`}</Typed>
            </dd>
          </div>
        </dl>
      </article>
    </li>
  )
}

export default function Work({ motion }: { motion: boolean }) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (!motion) return
      const head = root.current?.querySelector('.bp-sec')
      if (!head) return
      const q = gsap.utils.selector(root)
      gsap.set(q('.bp-lead .bp-rise'), { yPercent: 105 })
      gsap.set(q('.bp-lead .bp-plate__arrow'), { scaleX: 0 })
      const tl = sectionHeadIn(head)
      tl.to(q('.bp-lead .d'), { strokeDashoffset: 0, duration: 1.2, ease: 'power3.inOut' }, 0.05)
        .to(q('.bp-lead .bp-rise'), { yPercent: 0, duration: 0.9 }, 0.3)
        .to(q('.bp-lead .bp-plate__arrow'), { scaleX: 1, duration: 0.7, ease: 'power3.inOut', clearProps: 'transform' }, 0.8)
      typeOn(tl, q('.bp-lead .bp-type'), 0.6, 0.03)
    },
    { scope: root, dependencies: [motion] },
  )

  return (
    <section id="bp-d" className="bp-work" ref={root} aria-label={work.heading}>
      <SectionHead
        letter="D"
        title={work.heading}
        note={work.note}
        fig={`Sheets 01 to ${TOTAL}`}
        lead={
          /* GitHub leads the repo list: the second place to see the work, after LinkedIn. */
          <a className="bp-lead" href={see.github.url} target="_blank" rel="noreferrer">
            <svg className="bp-frame" aria-hidden="true">
              <rect className="d" pathLength={1} x="0.5" y="0.5" />
            </svg>
            <span className="bp-lead__label">
              <span className="bp-mask">
                <span className="bp-rise">{see.github.label}</span>
              </span>
            </span>
            <span className="bp-lead__side">
              <span className="bp-lead__handle">
                <Typed>{see.github.handle}</Typed>
              </span>
              <span className="bp-plate__arrow" aria-hidden="true">
                <i />
                <svg viewBox="0 0 12 14" width="12" height="14">
                  <path d="M0 0L12 7L0 14Z" />
                </svg>
              </span>
            </span>
            <span className="bp-sr"> (opens in a new tab)</span>
          </a>
        }
      />
      <ol className="bp-sheets">
        {projects.map((p, i) => (
          <Sheet key={p.name} p={p} i={i} motion={motion} />
        ))}
      </ol>
    </section>
  )
}
