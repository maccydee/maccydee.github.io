// Measures the ink box of each glyph in a heading so the letters can become
// static colliders. The DOM gives each glyph's pen position and the baseline;
// canvas text metrics give the ink extents around that origin.

import { CAT_STATIC, staticRect } from './scene'
import type Matter from 'matter-js'

export interface Ink {
  ch: string
  x: number
  y: number
  w: number
  h: number
  /** Top of an x-height letter set in the same font, for split colliders. */
  xTop: number
}

let ctx: CanvasRenderingContext2D | null = null

export function measureInk(lines: HTMLElement[], origin: { left: number; top: number }): Ink[] {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  const out: Ink[] = []
  if (!ctx) return out
  for (const line of lines) {
    const bl = line.querySelector('.grv-bl')
    if (!bl) continue
    const baseline = bl.getBoundingClientRect().bottom
    const spans = line.querySelectorAll<HTMLElement>('.grv-ch')
    let xHeight = 0
    for (const span of spans) {
      const ch = span.textContent ?? ''
      if (!ch.trim()) continue
      const cs = getComputedStyle(span)
      const size = parseFloat(cs.fontSize)
      ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`
      if (!xHeight) xHeight = ctx.measureText('x').actualBoundingBoxAscent
      const m = ctx.measureText(ch)
      const r = span.getBoundingClientRect()
      const ls = parseFloat(cs.letterSpacing) || 0
      // Canvas cannot be told the width axis, so scale its horizontal metrics
      // to the advance the DOM actually laid out.
      const sx = m.width > 0 ? clampScale((r.width - ls) / m.width) : 1
      const left = r.left - m.actualBoundingBoxLeft * sx
      const right = r.left + m.actualBoundingBoxRight * sx
      const top = baseline - m.actualBoundingBoxAscent
      const bottom = baseline + m.actualBoundingBoxDescent
      out.push({
        ch,
        x: left - origin.left,
        y: top - origin.top,
        w: right - left,
        h: bottom - top,
        xTop: baseline - xHeight - origin.top,
      })
    }
  }
  return out
}

const clampScale = (v: number) => (v > 0.6 && v < 1.4 ? v : 1)

// Corner rounding per glyph as a fraction of the shorter side: TL, TR, BR, BL.
// Only has to be believable enough that pills roll off round shoulders.
const ROUND: Record<string, [number, number, number, number]> = {
  C: [0.42, 0.3, 0.3, 0.42],
  O: [0.46, 0.46, 0.46, 0.46],
  D: [0.05, 0.42, 0.42, 0.05],
  M: [0.04, 0.04, 0.02, 0.02],
  a: [0.32, 0.32, 0.08, 0.3],
  c: [0.44, 0.3, 0.3, 0.44],
  e: [0.44, 0.44, 0.3, 0.44],
  o: [0.47, 0.47, 0.47, 0.47],
  u: [0.04, 0.04, 0.34, 0.34],
  m: [0.2, 0.3, 0.02, 0.02],
  n: [0.2, 0.36, 0.02, 0.02],
  r: [0.2, 0.3, 0.02, 0.02],
  s: [0.36, 0.36, 0.36, 0.36],
  p: [0.2, 0.42, 0.3, 0.02],
  l: [0.06, 0.06, 0.06, 0.06],
}

/** Builds the static bodies for one glyph. `floor` clips descenders. */
export function letterBodies(ink: Ink, category = CAT_STATIC, floor = Infinity): Matter.Body[] {
  const bottom = Math.min(ink.y + ink.h, floor)
  const h = bottom - ink.y
  if (h < 4 || ink.w < 2) return []

  // Letters with a tall stem beside a low bowl would otherwise carry a slab
  // of empty air above the bowl.
  const stemRight = ink.ch === 'd'
  const stemLeft = ink.ch === 'b' || ink.ch === 'h' || ink.ch === 'k'
  if ((stemRight || stemLeft) && ink.xTop > ink.y + 6) {
    const stemW = ink.w * 0.31
    const bowlH = bottom - ink.xTop
    const bowlR = Math.min(ink.w, bowlH) * 0.36
    const stemX = stemRight ? ink.x + ink.w - stemW : ink.x
    return [
      staticRect(stemX, ink.y, stemW, h, { category, chamfer: stemW * 0.12 }),
      staticRect(ink.x, ink.xTop, ink.w, bowlH, {
        category,
        chamfer: stemRight ? [bowlR, 1, 1, bowlR] : [1, bowlR, bowlR, 1],
      }),
    ]
  }

  const f = ROUND[ink.ch] ?? [0.08, 0.08, 0.08, 0.08]
  const s = Math.min(ink.w, h)
  return [staticRect(ink.x, ink.y, ink.w, h, { category, chamfer: f.map((v) => Math.max(1, v * s)) })]
}
