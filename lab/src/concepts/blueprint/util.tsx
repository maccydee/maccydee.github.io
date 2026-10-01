import type { ReactNode } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import type Lenis from 'lenis'
import { contact, see, work } from '../../content'

/** The page's sections, in story order. Zone letters, the rail and the sheet count all read from this. */
export const SECTIONS = [
  { id: 'bp-a', letter: 'A', name: 'Title' },
  { id: 'bp-b', letter: 'B', name: 'Disciplines' },
  { id: 'bp-c', letter: 'C', name: see.linkedin.label },
  { id: 'bp-d', letter: 'D', name: work.heading },
  { id: 'bp-e', letter: 'E', name: contact.heading },
] as const

/** Shared smooth-scroll handle so chrome links can drive Lenis when it exists. */
export const scroller: { lenis: Lenis | null } = { lenis: null }

/** Grid unit in px. The backdrop grid, spacing and the "GRID" readout all use it. */
export const GRID = 24

export function prefersReduced(): boolean {
  if (typeof window === 'undefined') return false
  // `?static` forces the reduced-motion rendering so it can be inspected directly.
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    new URLSearchParams(window.location.search).has('static')
  )
}

export const finePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

export const pad = (n: number, w = 4) => String(Math.max(0, Math.round(n))).padStart(w, '0')

/** FNV-1a string hash. */
export function hash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Text that will be typed on. The real string stays available to assistive
 * tech; the visible copy is what gets split into characters.
 */
export function Typed({ children, className }: { children: string; className?: string }) {
  return (
    <span className={className}>
      <span className="bp-sr">{children}</span>
      <span className="bp-type" aria-hidden="true">
        {children}
      </span>
    </span>
  )
}

/** Splits every `.bp-type` inside the targets and types the characters on. */
export function typeOn(
  tl: gsap.core.Timeline,
  targets: Element | Element[] | NodeListOf<Element> | null | undefined,
  position: gsap.Position,
  each = 0.018,
): gsap.core.Timeline {
  if (!targets) return tl
  const list = targets instanceof Element ? [targets] : Array.from(targets)
  const els: Element[] = []
  list.forEach((t) => {
    if (t.classList.contains('bp-type')) els.push(t)
    else els.push(...Array.from(t.querySelectorAll('.bp-type')))
  })
  if (!els.length) return tl
  const split = new SplitText(els, { type: 'words,chars', aria: 'none', wordsClass: 'bp-w', charsClass: 'bp-c' })
  gsap.set(split.chars, { opacity: 0 })
  tl.to(split.chars, { opacity: 1, duration: 0.01, ease: 'none', stagger: each }, position)
  return tl
}

/** Section header used by B, C and D. */
export function SectionHead({
  letter,
  title,
  note,
  fig,
  lead,
  children,
}: {
  letter: string
  title: string
  note?: string
  fig?: string
  /** Rendered between the zone letter and the title. */
  lead?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="bp-sec">
      <div className="bp-sec__meta">
        <span className="bp-sec__letter" aria-hidden="true">
          {letter}
        </span>
        {fig && <Typed className="bp-label">{fig}</Typed>}
      </div>
      {lead}
      <h2 className="bp-sec__title">
        <span className="bp-sec__title-in">{title}</span>
      </h2>
      {note && (
        <p className="bp-sec__note">
          <Typed>{note}</Typed>
        </p>
      )}
      {children}
      <i className="bp-sec__rule" aria-hidden="true" />
    </header>
  )
}

/** Entrance for a SectionHead. Returns the timeline so callers can extend it. */
export function sectionHeadIn(head: Element, trigger?: Element): gsap.core.Timeline {
  const q = gsap.utils.selector(head)
  const tl = gsap.timeline({
    scrollTrigger: { trigger: trigger ?? head, start: 'top 78%', once: true },
    defaults: { ease: 'power3.out' },
  })
  gsap.set(q('.bp-sec__rule'), { scaleX: 0 })
  gsap.set(q('.bp-sec__letter'), { scale: 0 })
  gsap.set(q('.bp-sec__title-in'), { yPercent: 105 })
  tl.to(q('.bp-sec__rule'), { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, 0)
    .to(q('.bp-sec__letter'), { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 0.1)
    .to(q('.bp-sec__title-in'), { yPercent: 0, duration: 0.9 }, 0.15)
  typeOn(tl, q('.bp-sec__meta .bp-type'), 0.3, 0.02)
  typeOn(tl, q('.bp-sec__note .bp-type'), 0.55, 0.012)
  return tl
}
