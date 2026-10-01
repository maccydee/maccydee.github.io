// Fit a single line of Roboto Flex to an exact pixel width by solving the
// width axis (and, at the extremes, the font size). This is what lets every
// headline in the film sit edge to edge on any viewport, phone included.

export type FitOpts = {
  /** Width to fill, in px. */
  target: number
  /** Preferred font size in px (usually a height budget). */
  fMax: number
  /** If the line cannot fill at the widest setting, allow growing to this size. */
  fHard?: number
  lo?: number
  hi?: number
  /** Apply a width-axis value. Defaults to setting --wdth on the element. */
  apply?: (wdth: number) => void
  /** Natural (untransformed) width of the line. Defaults to offsetWidth. */
  measure?: () => number
  /** Element that receives the font size. Defaults to the element itself. */
  sizeEl?: HTMLElement
}

export type FitResult = { size: number; wdth: number }

export function fitLine(el: HTMLElement, o: FitOpts): FitResult {
  const lo = o.lo ?? 25
  const hi = o.hi ?? 151
  const apply = o.apply ?? ((w: number) => el.style.setProperty('--wdth', w.toFixed(2)))
  const measure = o.measure ?? (() => el.offsetWidth)
  const sizeEl = o.sizeEl ?? el
  const setF = (v: number) => {
    sizeEl.style.fontSize = `${v.toFixed(2)}px`
  }

  let f = o.fMax
  let wdth = hi
  setF(f)
  apply(hi)
  const wHi = measure()

  if (wHi <= o.target) {
    // Too short even at full width: grow the type if we are allowed to.
    f = Math.min(o.fHard ?? f, (f * o.target) / Math.max(1, wHi))
    setF(f)
  } else {
    apply(lo)
    const wLo = measure()
    if (wLo >= o.target) {
      // Too long even fully condensed: shrink the type.
      f = (f * o.target) / wLo
      wdth = lo
      setF(f)
    } else {
      let a = lo
      let b = hi
      for (let i = 0; i < 10; i++) {
        const m = (a + b) / 2
        apply(m)
        if (measure() > o.target) b = m
        else a = m
      }
      wdth = a
    }
  }

  apply(wdth)
  const w = measure()
  if (w > o.target) {
    f = (f * o.target) / w
    setF(f)
  }
  el.dataset.fitTarget = String(o.target)
  return { size: f, wdth }
}

/**
 * Once a fitted line has been split into per-letter boxes its width can grow
 * by a few pixels (each box rounds on its own). Trim the size so the line
 * still sits inside its target.
 */
export function refit(el: HTMLElement) {
  const target = Number(el.dataset.fitTarget)
  if (!target) return
  for (let i = 0; i < 2; i++) {
    const w = el.offsetWidth
    if (w <= target) return
    const f = parseFloat(el.style.fontSize || getComputedStyle(el).fontSize)
    el.style.fontSize = `${((f * target) / w - 0.02).toFixed(2)}px`
  }
}

/** Vertical centre of a capital letter inside a line box of the given height, in px from the box top. */
export function capCentre(fontPx: number, lineHeightEm: number): number {
  // Defaults measured from Roboto Flex; refined from the live font when the
  // canvas metrics API is available.
  let asc = 0.928
  let desc = 0.244
  let inkA = 0.722
  let inkD = 0.011
  try {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = `900 200px "Roboto Flex Variable"`
      const m = ctx.measureText('O')
      if (m.fontBoundingBoxAscent > 0 && m.actualBoundingBoxAscent > 0) {
        asc = m.fontBoundingBoxAscent / 200
        desc = m.fontBoundingBoxDescent / 200
        inkA = m.actualBoundingBoxAscent / 200
        inkD = m.actualBoundingBoxDescent / 200
      }
    }
  } catch {
    // keep defaults
  }
  const baseline = (lineHeightEm - (asc + desc)) / 2 + asc
  return (baseline - (inkA - inkD) / 2) * fontPx
}
