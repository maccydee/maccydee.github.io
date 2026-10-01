import { useEffect, useRef } from 'react'
import { contact, links, person, projects, see, work } from '../../content'
import { fitLine } from './fit'
import { Arrow, bodyLast, FitLines, headTail, NAME_LINES, repoPath, SeeLink, splitFigure, toneFor } from './parts'
import { pad2 } from './timing'

// Ultraviolet is used once (the second discipline); the rest cycle ink, lime, bone.
const CYCLE = ['t-ink', 't-lime', 't-bone'] as const
const toneOf = (i: number) => (i === 1 ? 't-uv' : CYCLE[(i > 1 ? i - 1 : i) % CYCLE.length])

/**
 * The reduced-motion edition: the same content, palette and width-fitted
 * headlines, set as a normal scrolling page. Nothing pins, nothing scrubs.
 */
export default function Still() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    let live = true
    const fit = () => {
      if (!live) return
      const w = el.clientWidth
      const pad = Math.round(Math.min(36, Math.max(16, w * 0.022)))
      el.style.setProperty('--pad', `${pad}px`)
      const h = window.innerHeight
      el.querySelectorAll<HTMLElement>('.fit').forEach((line) => {
        const fMax = Math.min(h * 0.34, w * 0.5)
        fitLine(line, { target: w - pad * 2, fMax, fHard: fMax * 1.2 })
      })
    }
    fit()
    // Fit again once the real typeface is in: the first pass may have measured a fallback.
    Promise.all([
      document.fonts.load('900 48px "Roboto Flex Variable"', 'CALUMcDON'),
      document.fonts.load('italic 400 24px "Instrument Serif"', 'Engineering'),
    ])
      .then(() => document.fonts.ready)
      .then(fit, fit)
    let id = 0
    let lastW = window.innerWidth
    const onResize = () => {
      if (window.innerWidth === lastW) return
      lastW = window.innerWidth
      window.clearTimeout(id)
      id = window.setTimeout(fit, 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      live = false
      window.clearTimeout(id)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="still" ref={root}>
      <section className="still__hero t-ink">
        <h1>
          <span className="sr">{person.name}</span>
          {NAME_LINES.map((letters, i) => (
            <span className="row" aria-hidden="true" key={i}>
              <span className="fit v" style={{ textTransform: 'none' }}>
                {letters.join('')}
              </span>
            </span>
          ))}
        </h1>
        <div className="still__lede">
          <p className="still__role">{person.role}</p>
          <p className="still__tag">{person.tagline}</p>
        </div>
      </section>

      {person.disciplines.map((d, i) => (
        <section className={toneOf(i)} key={d}>
          <p className="still__label">
            {pad2(i + 1)} / {pad2(person.disciplines.length)}
            <em>Disciplines</em>
          </p>
          <p>
            <span className="sr">{d}</span>
            <FitLines lines={headTail(d)} />
          </p>
        </section>
      ))}

      <section className="t-lime" aria-label={see.linkedin.label}>
        <a className="still__see" href={see.linkedin.url} target="_blank" rel="noopener noreferrer">
          <span className="sr">
            {see.linkedin.label} {see.linkedin.handle} (opens in a new tab)
          </span>
          <em aria-hidden="true">{see.linkedin.handle}</em>
          <span aria-hidden="true">
            <FitLines lines={bodyLast(see.linkedin.label)} />
          </span>
        </a>
      </section>

      <section className="t-ink">
        <div className="still__top">
          <SeeLink {...see.github} />
        </div>
        <h2>
          <span className="sr">{work.heading}</span>
          <FitLines lines={work.heading.split(' ')} />
        </h2>
        <p className="still__note">{work.note}</p>
      </section>

      <ol className="still__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {projects.map((p, i) => (
          <li className={`t-${toneFor(i)}`} key={p.name}>
            <div className="still__head">
              <span className="still__num" aria-hidden="true">
                {pad2(i + 1)} / {pad2(projects.length)}
              </span>
              <h3 className="still__name">{p.name}</h3>
            </div>
            <div className="panel__info">
              <p className="panel__kind">
                <em>{p.kind}</em>
                <span>{p.lang}</span>
              </p>
              {p.figures.length > 0 && (
                <ul className="panel__figs">
                  {p.figures.map((f) => {
                    const [num, rest] = splitFigure(f)
                    return (
                      <li key={f}>
                        <b>{num}</b>
                        <span>{rest}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="panel__blurb">{p.blurb}</p>
              <a className="panel__link" href={p.url} target="_blank" rel="noopener noreferrer">
                <span>Open repo</span>
                <span className="panel__dest">
                  <span className="panel__url">{repoPath(p)}</span>
                  <Arrow dir="ne" />
                </span>
                <span className="sr">(opens in a new tab)</span>
              </a>
            </div>
          </li>
        ))}
      </ol>

      <section className="still__links t-ink" aria-label={contact.heading}>
        <h2 className="sr">{contact.heading}</h2>
        {links.map((l) => (
          <a href={l.url} target="_blank" rel="noopener noreferrer" key={l.url}>
            <em>{l.handle}</em>
            <b>{l.label}</b>
            <span className="sr">(opens in a new tab)</span>
          </a>
        ))}
      </section>

      <footer className="t-ink">
        © {person.year} {person.name}
      </footer>
    </div>
  )
}
