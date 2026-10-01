import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { contact, links } from '../../content'
import { SectionHead, Typed, sectionHeadIn, typeOn } from './util'

export default function Contact({ motion }: { motion: boolean }) {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (!motion) return
      const q = gsap.utils.selector(root)
      const head = q('.bp-sec')[0]
      if (head) sectionHeadIn(head)

      q('.bp-plate').forEach((plate) => {
        const p = gsap.utils.selector(plate)
        gsap.set(p('.bp-rise'), { yPercent: 105 })
        gsap.set(p('.bp-plate__under'), { scaleX: 0 })
        gsap.set(p('.bp-plate__rivets i'), { scale: 0 })
        gsap.set(p('.bp-plate__arrow'), { scaleX: 0 })
        const tl = gsap.timeline({
          scrollTrigger: { trigger: plate, start: 'top 85%', once: true },
          defaults: { ease: 'power3.out' },
        })
        tl.to(p('.bp-frame .d'), { strokeDashoffset: 0, duration: 1.3, ease: 'power3.inOut', stagger: 0.15 }, 0)
          .to(p('.bp-plate__rivets i'), { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.06 }, 0.5)
          .to(p('.bp-rise'), { yPercent: 0, duration: 1.1, ease: 'power4.out' }, 0.25)
          .to(p('.bp-plate__under'), { scaleX: 1, duration: 1.2, ease: 'power3.inOut' }, 0.45)
          .to(p('.bp-plate__arrow'), { scaleX: 1, duration: 0.7, ease: 'power3.inOut', clearProps: 'transform' }, 0.9)
        typeOn(tl, p('.bp-type'), 0.6, 0.03)
      })
    },
    { scope: root, dependencies: [motion] },
  )

  return (
    <section id="bp-e" className="bp-contact" ref={root} aria-label={contact.heading}>
      <SectionHead letter="E" title={contact.heading} fig={`Links 01 to ${String(links.length).padStart(2, '0')}`} />
      <ul className="bp-links">
        {links.map((l, i) => (
          <li key={l.url}>
            <a className="bp-plate" href={l.url} target="_blank" rel="noreferrer">
              <span className="bp-plate__face">
                <svg className="bp-frame" aria-hidden="true">
                  <rect className="d" pathLength={1} x="0.5" y="0.5" />
                </svg>
                <span className="bp-plate__rivets" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="bp-plate__no" aria-hidden="true">
                  <Typed>{`Link 0${i + 1}`}</Typed>
                </span>
                <span className="bp-plate__label">
                  <span className="bp-mask">
                    <span className="bp-rise">{l.label}</span>
                  </span>
                </span>
                <span className="bp-plate__side">
                  <span className="bp-plate__handle">
                    <Typed>{l.handle}</Typed>
                  </span>
                  <span className="bp-plate__arrow" aria-hidden="true">
                    <i />
                    <svg viewBox="0 0 12 14" width="12" height="14">
                      <path d="M0 0L12 7L0 14Z" />
                    </svg>
                  </span>
                </span>
                <i className="bp-plate__under" aria-hidden="true" />
                <span className="bp-sr"> (opens in a new tab)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
