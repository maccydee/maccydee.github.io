import { useEffect, useState } from 'react'
import { bus } from './bus'

export type Env = {
  /** A real mouse / trackpad: hover works and the pointer is precise. */
  fine: boolean
  /** Narrow layout. */
  small: boolean
  /** prefers-reduced-motion: reduce */
  still: boolean
}

const queries = {
  fine: '(hover: hover) and (pointer: fine)',
  small: '(max-width: 860px)',
  still: '(prefers-reduced-motion: reduce)',
} as const

const read = (): Env => ({
  fine: window.matchMedia(queries.fine).matches,
  small: window.matchMedia(queries.small).matches,
  still: window.matchMedia(queries.still).matches,
})

export function useEnv(): Env {
  const [env, setEnv] = useState<Env>(read)
  useEffect(() => {
    const lists = Object.values(queries).map((q) => window.matchMedia(q))
    const on = () => setEnv(read())
    lists.forEach((l) => l.addEventListener('change', on))
    return () => lists.forEach((l) => l.removeEventListener('change', on))
  }, [])
  return env
}

/** Tracks the mouse into the shared bus. Touch and pen input are ignored. */
export function usePointerBus() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      bus.pointer.x = e.clientX
      bus.pointer.y = e.clientY
      bus.pointer.moved = performance.now()
      bus.pointer.seen = true
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      bus.pointer.seen = false
      bus.pointer.x = bus.pointer.y = -9999
    }
  }, [])
}
