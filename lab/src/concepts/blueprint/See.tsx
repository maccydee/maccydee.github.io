import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { see } from '../../content'
import { Typed, typeOn } from './util'

/**
 * C. The first place to see the work: LinkedIn, as a single plate inked in the
 * signal colour. It comes directly after the disciplines and before GitHub.
 */
export default function See({ motion }: { motion: boolean }) {
  const root = useRef<HTMLElement>(null)
  const l = see.linkedin

  useGSAP(
    () => {
      if (!motion) return
      const q = gsap.utils.selector(root)
      gsap.set(q('.bp-sec__letter'), { scale: 0 })
      gsap.set(q('.bp-stamp'), { '--stamp': 0 })
      gsap.set(q('.bp-rise'), { yPercent: 105 })
      gsap.set(q('.bp-plate__rivets i'), { scale: 0 })
      gsap.set(q('.bp-stamp__under'), { scaleX: 0 })
      gsap.set(q('.bp-plate__arrow'), { scaleX: 0 })
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 72%', once: true },
        defaults: { ease: 'power3.out' },
      })
      tl.to(q('.bp-sec__letter'), { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 0)
        .to(q('.bp-frame .d'), { strokeDashoffset: 0, duration: 1.2, ease: 'power3.inOut' }, 0)
        // the signal colour floods the plate from the left, like ink taking to a stamp
        .to(q('.bp-stamp'), { '--stamp': 1, duration: 1.0, ease: 'power3.inOut' }, 0.2)
        .to(q('.bp-rise'), { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.55)
        .to(q('.bp-plate__rivets i'), { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.06 }, 0.8)
        .to(q('.bp-stamp__under'), { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, 0.7)
        .to(q('.bp-plate__arrow'), { scaleX: 1, duration: 0.7, ease: 'power3.inOut', clearProps: 'transform' }, 1.1)
      typeOn(tl, q('.bp-sec__meta .bp-type'), 0.2, 0.02)
      typeOn(tl, q('.bp-stamp .bp-type'), 0.9, 0.03)
    },
    { scope: root, dependencies: [motion] },
  )

  return (
    <section id="bp-c" className="bp-see" ref={root} aria-label={l.label}>
      <div className="bp-sec__meta">
        <span className="bp-sec__letter" aria-hidden="true">
          C
        </span>
        <Typed className="bp-label">Fig. 2 / Profile</Typed>
      </div>
      <a className="bp-stamp" href={l.url} target="_blank" rel="noreferrer">
        <span className="bp-stamp__face">
          <svg className="bp-frame" aria-hidden="true">
            <rect className="d" pathLength={1} x="0.5" y="0.5" />
          </svg>
          <span className="bp-plate__rivets" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <h2 className="bp-stamp__label">
            <span className="bp-mask">
              <span className="bp-rise">{l.label}</span>
            </span>
          </h2>
          <i className="bp-stamp__under" aria-hidden="true" />
          <span className="bp-stamp__foot">
            <span className="bp-stamp__handle">
              <Typed>{l.handle}</Typed>
            </span>
            <span className="bp-plate__arrow" aria-hidden="true">
              <i />
              <svg viewBox="0 0 12 14" width="12" height="14">
                <path d="M0 0L12 7L0 14Z" />
              </svg>
            </span>
          </span>
          <span className="bp-sr"> (opens in a new tab)</span>
        </span>
      </a>
    </section>
  )
}
