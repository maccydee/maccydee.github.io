import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import './gravity.css'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { contact, links, person, projects, see, work } from '../../content'
import { disciplineTone } from './chips'
import { createHeroStage, type HeroStageApi } from './heroStage'
import { createContactStage, type ContactStageApi } from './contactStage'
import { ProjectCard, type CardTone } from './ProjectCard'

// Colour and paper alternate like a chequerboard at every column count and
// for any number of projects; the coloured cells walk through this sequence.
const CARD_COLOURS: readonly CardTone[] = ['cobalt', 'marigold', 'ink', 'tomato']
function cardTones(count: number, cols: number): CardTone[] {
  let n = 0
  return Array.from({ length: count }, (_, i) => {
    const coloured = (Math.floor(i / cols) + (i % cols)) % 2 === 0
    return coloured ? CARD_COLOURS[n++ % CARD_COLOURS.length] : 'paper'
  })
}

const LINK_TONES = ['cobalt', 'ink'] as const
const linkTone = (label: string, i: number) => (label === 'LinkedIn' ? 'cobalt' : label === 'GitHub' ? 'ink' : LINK_TONES[i % LINK_TONES.length])

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

function useColumns(): number {
  const two = useMedia('(max-width: 1080px)')
  const one = useMedia('(max-width: 680px)')
  return one ? 1 : two ? 2 : 3
}

/** One line of a heading, split per glyph so each can be measured as a collider. */
function Line({ text }: { text: string }) {
  return (
    <span className="grv-line" aria-hidden="true">
      {[...text].map((c, i) =>
        c === ' ' ? (
          <span key={i} className="grv-sp">
            {' '}
          </span>
        ) : (
          <span key={i} className="grv-ch">
            {c}
          </span>
        ),
      )}
      <i className="grv-bl" />
    </span>
  )
}

const Arrow = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7" />
    <path d="M8.5 7H17v8.5" />
  </svg>
)

export default function Gravity() {
  const prefersReduce = useMedia('(prefers-reduced-motion: reduce)')
  const fine = useMedia('(hover: hover) and (pointer: fine)')
  const cols = useColumns()
  const tones = cardTones(projects.length, cols)
  const stageRef = useRef<HTMLDivElement>(null)
  const contactRef = useRef<HTMLElement>(null)
  const heroApi = useRef<HeroStageApi | null>(null)
  const contactApi = useRef<ContactStageApi | null>(null)
  const params = new URLSearchParams(window.location.search)
  const debug = params.has('debug')
  // ?still previews the reduced-motion arrangement without changing OS settings.
  const reduce = prefersReduce || params.has('still')
  // Test hook: keeps the simulation running in a background tab.
  const nopause = params.has('nopause')

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = { html: html.style.background, body: body.style.background, ox: body.style.overflowX }
    html.style.background = '#F3EFE6'
    body.style.background = '#F3EFE6'
    body.style.overflowX = 'clip'
    return () => {
      html.style.background = prev.html
      body.style.background = prev.body
      body.style.overflowX = prev.ox
    }
  }, [])

  useEffect(() => {
    if (!stageRef.current) return
    const api = createHeroStage(stageRef.current, { reduce, debug, nopause })
    heroApi.current = api
    return () => {
      api.destroy()
      heroApi.current = null
    }
  }, [reduce, debug, nopause])

  useEffect(() => {
    if (!contactRef.current) return
    const api = createContactStage(contactRef.current, { reduce, debug, nopause })
    contactApi.current = api
    return () => {
      api.destroy()
      contactApi.current = null
    }
  }, [reduce, debug, nopause])

  return (
    <div className={`grv${reduce ? ' grv--still' : ''}${debug ? ' grv--debug' : ''}`} id="top">
      <div className="grv-stage" ref={stageRef}>
        {/* 1. The name. 2. Who he is. 3. What he does. */}
        <section className="grv-hero" aria-label="Introduction">
          <div className="grv-scene">
            <h1 className="grv-name" data-grv="name" aria-label={person.name}>
              <Line text={person.firstName} />
              <br aria-hidden="true" />
              <Line text={person.lastName} />
            </h1>
          </div>
          <div className="grv-floor" data-grv="floor" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="grv-strip">
            <div className="grv-who">
              <p className="grv-role">
                <span className="grv-dot" aria-hidden="true" />
                {person.role}
              </p>
              <p className="grv-tagline">{person.tagline}</p>
            </div>
            <ul className="grv-disc" aria-label="Disciplines">
              {person.disciplines.map((d, i) => (
                <li key={d} className={`grv-disc-chip grv-t--${disciplineTone(i)}`}>
                  {d}
                </li>
              ))}
            </ul>
            {!reduce && (
              <div className="grv-controls">
                <button type="button" className="grv-btn" onClick={() => heroApi.current?.dropAgain()}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v13" />
                    <path d="m6.5 12 5.5 5.5 5.5-5.5" />
                    <path d="M5 21h14" />
                  </svg>
                  Drop again
                </button>
                <p className="grv-readout">
                  <span>Drag anything</span>
                  <span data-grv="readout">0 bodies, 0 awake</span>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 4a. See what he does: LinkedIn first. The poured pile lands on it. */}
        <section className="grv-band" aria-label={see.linkedin.label}>
          <motion.a
            className="grv-link grv-link--cobalt grv-see"
            data-grv="see"
            href={see.linkedin.url}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={reduce ? undefined : { scale: 1.025 }}
            whileFocus={reduce ? undefined : { scale: 1.025 }}
            whileTap={reduce ? undefined : { scale: 0.975 }}
            transition={{ type: 'spring', stiffness: 520, damping: 9, mass: 0.7 }}
            onHoverStart={() => heroApi.current?.kickSee()}
            onFocus={() => heroApi.current?.kickSee()}
          >
            <span className="grv-link-text">
              <span className="grv-link-label">{see.linkedin.label}</span>
              <span className="grv-link-handle">{see.linkedin.handle}</span>
            </span>
            <span className="grv-link-arrow" aria-hidden="true">
              <Arrow />
            </span>
          </motion.a>
        </section>
        <div className="grv-floor grv-floor--fixed" data-grv="floor2" aria-hidden="true">
          <i />
          <i />
        </div>

        <div className="grv-layer" data-grv="layer" aria-hidden="true" />
      </div>

      {/* 4b. Then GitHub, leading the pinned repos. */}
      <section className="grv-work" aria-labelledby="grv-work">
        <div className="grv-work-head">
          <a className="grv-cta" href={see.github.url} target="_blank" rel="noopener noreferrer">
            <span className="grv-cta-label">{see.github.label}</span>
            <span className="grv-cta-handle">{see.github.handle}</span>
            <span className="grv-cta-arrow" aria-hidden="true">
              <Arrow size={16} />
            </span>
          </a>
          <h2 className="grv-worktitle" id="grv-work">
            {work.heading}
          </h2>
          <p className="grv-note">{work.note}</p>
          <p className="grv-count">{projects.length} projects</p>
        </div>
        <ul className="grv-grid">
          {projects.map((p, i) => (
            <ProjectCard key={p.name} project={p} index={i} tone={tones[i]} order={i % cols} fine={fine} reduce={reduce} />
          ))}
        </ul>
      </section>

      {/* 5. Where to contact him. */}
      <section className="grv-contact" ref={contactRef} aria-labelledby="grv-contact">
        <h2 className="grv-contact-title" id="grv-contact">
          {contact.heading}
        </h2>
        <div className="grv-links">
          {links.map((l, i) => (
            <motion.a
              key={l.url}
              className={`grv-link grv-link--${linkTone(l.label, i)}`}
              data-grv="link"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={reduce ? undefined : { scale: 1.035 }}
              whileFocus={reduce ? undefined : { scale: 1.035 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 520, damping: 9, mass: 0.7 }}
              onHoverStart={() => contactApi.current?.kick(i)}
              onFocus={() => contactApi.current?.kick(i)}
            >
              <span className="grv-link-text">
                <span className="grv-link-label">{l.label}</span>
                <span className="grv-link-handle">{l.handle}</span>
              </span>
              <span className="grv-link-arrow" aria-hidden="true">
                <Arrow />
              </span>
            </motion.a>
          ))}
        </div>
        <div className="grv-floor grv-floor--fixed" data-grv="floor3" aria-hidden="true">
          <i />
          <i />
        </div>
        <div className="grv-layer" data-grv="layer" aria-hidden="true" />
      </section>

      <footer className="grv-foot">
        <p>
          © {person.year} {person.name}
        </p>
        <a href="#top">Back to top</a>
      </footer>
    </div>
  )
}
