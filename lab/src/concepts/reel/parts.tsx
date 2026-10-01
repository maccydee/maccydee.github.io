import type { CSSProperties } from 'react'
import { contact, person, projects, type Project } from '../../content'
import { pad2, TOTAL_TC } from './timing'

export const SCENES = ['Title', 'Role', 'Disciplines', 'Work', contact.heading] as const

/** "CALLUM" and "McDONALD": capitals, with the c of Mc kept small as it is written. */
export const NAME_LINES: string[][] = [person.firstName, person.lastName].map((word) =>
  Array.from(word).map((ch, i) => (word.startsWith('Mc') && i === 1 ? ch : ch.toUpperCase())),
)

/** Repo names break at their hyphens once they are too long for one line. */
export function nameLines(name: string): string[] {
  if (name.length <= 9) return [name]
  const parts = name.split('-')
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}-` : p))
}

/** "17,807 employer boards" -> ["17,807", "employer boards"]. No values are altered. */
export function splitFigure(f: string): [string, string] {
  const i = f.indexOf(' ')
  return i < 0 ? [f, ''] : [f.slice(0, i), f.slice(i + 1)]
}

export const TONES = ['bone', 'ink', 'lime'] as const
/**
 * Panel fields cycle bone, ink, lime. The cycle is offset so that, for any
 * number of projects, neither the first nor the last panel is ink: the reel
 * is entered from an ink title panel and left for an ink end card, and both
 * cuts need a change of field.
 */
export const toneFor = (i: number, n: number = projects.length) => TONES[(i + (n % 3 === 0 ? 0 : 2)) % TONES.length]

export const repoPath = (p: Project) => p.url.replace(/^https?:\/\//, '')

const ROT = { right: 0, down: 90, left: 180, up: -90, ne: -45 } as const

export function Arrow({ dir = 'right', weight = 2 }: { dir?: keyof typeof ROT; weight?: number }) {
  return (
    <svg
      className="arw"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ transform: `rotate(${ROT[dir]}deg)` }}
    >
      <path d="M3 12h17M12.5 4.5 20 12l-7.5 7.5" fill="none" stroke="currentColor" strokeWidth={weight} />
    </svg>
  )
}

/**
 * The film's fixed readout: scene, name, playhead timecode. Every colour
 * field carries its own copy in its own ink, held stationary while the field
 * moves, so the readout inverts exactly along each wipe edge.
 */
export function Hud({ scene, reel = false, quiet = false }: { scene: 1 | 2 | 3 | 4 | 5; reel?: boolean; quiet?: boolean }) {
  return (
    <div className="hud" aria-hidden="true">
      <div className="hud__top">
        <span className="hud__scene">
          <b>{pad2(scene)}</b>
          <i>/{pad2(SCENES.length)}</i>
          <em>{SCENES[scene - 1]}</em>
        </span>
        <span className={quiet ? 'hud__who is-quiet' : 'hud__who'}>{person.name}</span>
        <span className="hud__time">
          <span className="tc">00:00:00</span>
          <i className="hud__total"> / {TOTAL_TC}</i>
        </span>
      </div>
      {reel && (
        <div className="hud__reel">
          <span className="hud__count">
            <b className="count">00</b>
            <i> / {pad2(projects.length)}</i>
          </span>
          <span className="bar">
            <span className="bar__fill" />
          </span>
        </div>
      )}
    </div>
  )
}

export function Bands() {
  const unit = (dir: 'left' | 'right', k: number) => (
    <span className="band__unit" key={k}>
      {person.role}
      <Arrow dir={dir} weight={2.6} />
    </span>
  )
  return (
    <div className="bands">
      <div className="band band--a">
        <div className="band__track" data-dir="-1">
          {[0, 1, 2, 3].map((k) => unit('left', k))}
        </div>
      </div>
      <div className="band band--b">
        <div className="band__track" data-dir="1">
          {[0, 1, 2, 3].map((k) => unit('right', k))}
        </div>
      </div>
    </div>
  )
}

/** "Exceptional vibe coding" -> ["Exceptional", "vibe coding"]: first word, then the rest. */
export function headTail(text: string): string[] {
  const i = text.indexOf(' ')
  return i < 0 ? [text] : [text.slice(0, i), text.slice(i + 1)]
}

/** "Posts on LinkedIn" -> ["Posts on", "LinkedIn"]: everything, then the last word. */
export function bodyLast(text: string): string[] {
  const i = text.lastIndexOf(' ')
  return i < 0 ? [text] : [text.slice(0, i), text.slice(i + 1)]
}

/** Width-fitted display lines: real text for assistive tech lives beside them, the lines are for the eye. */
export function FitLines({ lines, centre = false }: { lines: string[]; centre?: boolean }) {
  return (
    <>
      {lines.map((l, i) => (
        <span className={centre ? 'row row--c' : 'row'} aria-hidden="true" key={i}>
          <span className="fit v">{l}</span>
        </span>
      ))}
    </>
  )
}

/** A discipline set as two stacked, width-fitted lines. */
export function DLines({ text, centre = false }: { text: string; centre?: boolean }) {
  return (
    <p className="d__lines">
      <span className="sr">{text}</span>
      <FitLines lines={headTail(text)} centre={centre} />
    </p>
  )
}

/** The small "02 / 04 Vulnerability management" label inside each discipline scene. */
export function DMeta({ i }: { i: number }) {
  return (
    <p className="d__meta" aria-hidden="true">
      <b>{pad2(i + 1)}</b>
      <i> / {pad2(person.disciplines.length)}</i>
      <em>{person.disciplines[i]}</em>
    </p>
  )
}

/** A text link in the film's own voice: heavy condensed label, serif handle, arrow, lime rule. */
export function SeeLink({ label, handle, url }: { label: string; handle: string; url: string }) {
  return (
    <a className="seelink" href={url} target="_blank" rel="noopener noreferrer">
      <span>{label}</span>
      <em>{handle}</em>
      <Arrow dir="ne" />
      <span className="sr">(opens in a new tab)</span>
    </a>
  )
}

export function BigLink({ n, label, handle, url }: { n: number; label: string; handle: string; url: string }) {
  return (
    <a className="biglink" href={url} target="_blank" rel="noopener noreferrer">
      <span className="biglink__wipe" aria-hidden="true" />
      <span className="sr">
        {label} {handle} (opens in a new tab)
      </span>
      <span className="biglink__meta" aria-hidden="true">
        <b>{pad2(n)}</b>
        <em>{handle}</em>
        <Arrow dir="ne" />
      </span>
      <span className="biglink__arw" aria-hidden="true">
        <Arrow dir="ne" weight={2.4} />
      </span>
      <span className="biglink__row" aria-hidden="true">
        <span className="biglink__text">
          {Array.from(label).map((c, i) => (
            <span className="bl" style={{ '--i': i } as CSSProperties} key={i}>
              {c}
            </span>
          ))}
        </span>
      </span>
    </a>
  )
}

export function Panel({ p, i }: { p: Project; i: number }) {
  const lines = nameLines(p.name)
  return (
    <article className={`panel panel--p t-${toneFor(i)}`} data-i={i + 1}>
      <span className="panel__num v" aria-hidden="true">
        {pad2(i + 1)}
      </span>
      <h3 className="panel__name">
        <span className="sr">{p.name}</span>
        {lines.map((l, k) => (
          <span className="row" aria-hidden="true" key={k}>
            <span className="fit v">{l}</span>
          </span>
        ))}
      </h3>
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
      <div className="panel__ovl">
        <Hud scene={4} reel />
      </div>
    </article>
  )
}
