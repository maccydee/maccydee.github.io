import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
import './picker.css'

// Each design is a self-contained page under src/concepts/<slug>/index.tsx.
// One is chosen at random on every load. Switching is always a full page
// load, so designs cannot leak styles, listeners or scroll state into each
// other.
export const concepts = [
  { slug: 'constellation', n: '01', title: 'Constellation' },
  { slug: 'liquid', n: '02', title: 'Water' },
  { slug: 'blueprint', n: '03', title: 'Blueprint' },
  { slug: 'reel', n: '04', title: 'Reel' },
  { slug: 'gravity', n: '05', title: 'Gravity' },
] as const

const loaders: Record<string, () => Promise<{ default: ComponentType }>> = {
  constellation: () => import('./concepts/constellation'),
  liquid: () => import('./concepts/liquid'),
  blueprint: () => import('./concepts/blueprint'),
  reel: () => import('./concepts/reel'),
  gravity: () => import('./concepts/gravity'),
}

const PICK = 'cm:pick' // sessionStorage: design chosen in the picker, used once
const LAST = 'cm:last' // localStorage: design shown last time, so a refresh never repeats it

const store = {
  take(area: 'session' | 'local', key: string) {
    try {
      const s = area === 'session' ? sessionStorage : localStorage
      const v = s.getItem(key)
      if (area === 'session') s.removeItem(key)
      return v
    } catch { return null }
  },
  put(area: 'session' | 'local', key: string, value: string) {
    try { (area === 'session' ? sessionStorage : localStorage).setItem(key, value); return true } catch { return false }
  },
}

function choose(): string {
  // 1. a deep link (?c=liquid) always wins, so one design can be shared
  const linked = new URLSearchParams(location.search).get('c')
  if (linked && loaders[linked]) return linked
  // 2. a choice just made in the picker
  const picked = store.take('session', PICK)
  if (picked && loaders[picked]) return picked
  // 3. otherwise random, never the one shown last time
  const last = store.take('local', LAST)
  const pool = concepts.map((c) => c.slug).filter((s) => s !== last)
  return pool[Math.floor(Math.random() * pool.length)]
}

const slug = choose()
store.put('local', LAST, slug)
const Concept = lazy(loaders[slug])

function go(next: string) {
  // Keep the address clean so the next refresh is random again.
  if (store.put('session', PICK, next)) location.assign(location.pathname)
  else location.assign(`?c=${next}`)
}

function Picker() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = concepts.find((c) => c.slug === slug)!

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.picker__btn')?.focus() }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey) }
  }, [open])

  const shuffle = () => {
    const pool = concepts.filter((c) => c.slug !== slug)
    go(pool[Math.floor(Math.random() * pool.length)].slug)
  }

  return (
    <div className="picker" data-open={open} ref={root}>
      <button
        type="button" className="picker__btn" aria-haspopup="true" aria-expanded={open} aria-controls="picker-menu"
        aria-label={`Design ${current.n}, ${current.title}. Choose another design`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker__word">Design</span>
        <span className="picker__n">{current.n}</span>
        <svg className="picker__chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3.2 5 7.2 9 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ul className="picker__menu" id="picker-menu" aria-label="Designs">
        <li className="picker__hint" aria-hidden="true">Five designs, one at random</li>
        {concepts.map((c) => (
          <li key={c.slug}>
            <button type="button" className="picker__item" tabIndex={open ? 0 : -1} aria-current={c.slug === slug}
              onClick={() => (c.slug === slug ? setOpen(false) : go(c.slug))}>
              <span className="picker__n">{c.n}</span>
              <span>{c.title}</span>
              <span className="picker__dot" aria-hidden="true" />
            </button>
          </li>
        ))}
        <li className="picker__sep" aria-hidden="true" />
        <li>
          <button type="button" className="picker__item" tabIndex={open ? 0 : -1} onClick={shuffle}>
            <span className="picker__n" aria-hidden="true">↻</span>
            <span>Shuffle</span>
            <span />
          </button>
        </li>
      </ul>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Suspense fallback={null}><Concept /></Suspense>
      <Picker />
    </>
  )
}
