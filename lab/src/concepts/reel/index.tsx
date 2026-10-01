import { useEffect, useState } from 'react'
import '@fontsource-variable/roboto-flex/full.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './reel.css'
import Film from './Film'
import Still from './Still'

const QUERY = '(prefers-reduced-motion: reduce)'
// ?c=reel&still previews the reduced-motion edition without changing an OS setting.
const FORCE_STILL = new URLSearchParams(window.location.search).has('still')

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => FORCE_STILL || window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setReduced(FORCE_STILL || mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * 04 REEL. A kinetic-typography scroll film: five scenes, type as the only
 * imagery, scrolling as the playhead. Reduced-motion visitors get the same
 * content as a static typographic page.
 */
export default function Reel() {
  const reduced = useReducedMotion()

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = { html: html.style.background, body: body.style.background, overflowX: body.style.overflowX }
    html.style.background = '#0B0B0C'
    body.style.background = '#0B0B0C'
    body.style.overflowX = 'clip'
    return () => {
      html.style.background = prev.html
      body.style.background = prev.body
      body.style.overflowX = prev.overflowX
    }
  }, [])

  return <div className="reel">{reduced ? <Still /> : <Film />}</div>
}
