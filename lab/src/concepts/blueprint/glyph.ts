import { hash, rng } from './util'

// Procedural schematic glyphs. Each one is derived only from the project name,
// so the same name always produces the same drawing. They are decoration: no
// part of the geometry encodes anything about the project.

export type Glyph = {
  prim: { kind: 'circle' | 'square' | 'tri' | 'hex'; cx: number; cy: number; r: number; d: string; turn: number }
  inner: string
  ticks: string
  arcs: string[]
  traces: string[]
  pads: { x: number; y: number; solid: boolean }[]
}

const STEP = 16
const MIN = 12
const N = 7 // lattice points per side (12..108)
const at = (i: number) => MIN + i * STEP

function polygon(cx: number, cy: number, r: number, sides: number, rot: number): string {
  let d = ''
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`
  }
  return d + 'Z'
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + Math.cos(a0) * r
  const y0 = cy + Math.sin(a0) * r
  const x1 = cx + Math.cos(a1) * r
  const y1 = cy + Math.sin(a1) * r
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export function makeGlyph(name: string): Glyph {
  const r = rng(hash(name))
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))

  // Primary form
  const kind = pick(['circle', 'square', 'tri', 'hex'] as const)
  const cx = at(int(2, 4))
  const cy = at(int(2, 4))
  const pr = pick([20, 24, 28])
  let d: string
  let turn: number
  if (kind === 'circle') {
    d = `M${cx - pr} ${cy}A${pr} ${pr} 0 1 1 ${cx + pr} ${cy}A${pr} ${pr} 0 1 1 ${cx - pr} ${cy}Z`
    turn = 180
  } else if (kind === 'square') {
    d = polygon(cx, cy, pr, 4, Math.PI / 4)
    turn = 90
  } else if (kind === 'tri') {
    d = polygon(cx, cy, pr, 3, -Math.PI / 2)
    turn = 120
  } else {
    d = polygon(cx, cy, pr, 6, 0)
    turn = 60
  }

  // Inner detail: centre mark plus a chord or spokes
  let inner = `M${cx - 5} ${cy}H${cx + 5}M${cx} ${cy - 5}V${cy + 5}`
  const spokes = int(0, 3)
  for (let i = 0; i < spokes; i++) {
    const a = (i / Math.max(1, spokes)) * Math.PI * 2 + r() * 0.6
    inner += `M${(cx + Math.cos(a) * 9).toFixed(2)} ${(cy + Math.sin(a) * 9).toFixed(2)}L${(cx + Math.cos(a) * (pr - 5)).toFixed(2)} ${(cy + Math.sin(a) * (pr - 5)).toFixed(2)}`
  }

  // Tick ring
  let ticks = ''
  const tickN = pick([8, 12, 16, 24])
  const t0 = pr + 6
  for (let i = 0; i < tickN; i++) {
    const a = (i / tickN) * Math.PI * 2
    const len = i % (tickN / 4) === 0 ? 5 : 2.5
    ticks += `M${(cx + Math.cos(a) * t0).toFixed(2)} ${(cy + Math.sin(a) * t0).toFixed(2)}L${(cx + Math.cos(a) * (t0 + len)).toFixed(2)} ${(cy + Math.sin(a) * (t0 + len)).toFixed(2)}`
  }

  // Concentric arcs
  const arcs: string[] = []
  const arcN = int(1, 2)
  for (let i = 0; i < arcN; i++) {
    const a0 = r() * Math.PI * 2
    const sweep = (0.35 + r() * 0.75) * Math.PI
    arcs.push(arc(cx, cy, pr + 15 + i * 7, a0, a0 + sweep))
  }

  // Orthogonal traces walking the lattice from the frame edge inward
  const traces: string[] = []
  const pads: Glyph['pads'] = []
  const used = new Set<string>()
  const traceN = int(3, 4)
  for (let t = 0; t < traceN; t++) {
    const side = (t + int(0, 3)) % 4
    let gx = side === 0 ? 0 : side === 1 ? N - 1 : int(0, N - 1)
    let gy = side === 2 ? 0 : side === 3 ? N - 1 : int(0, N - 1)
    if (used.has(`${gx},${gy}`)) continue
    used.add(`${gx},${gy}`)
    let path = `M${at(gx)} ${at(gy)}`
    pads.push({ x: at(gx), y: at(gy), solid: r() > 0.5 })
    let horiz = side < 2
    const segs = int(2, 4)
    for (let s = 0; s < segs; s++) {
      const len = int(1, 3) * (r() > 0.5 ? 1 : -1)
      if (horiz) {
        const nx = Math.max(0, Math.min(N - 1, gx + (side === 0 ? Math.abs(len) : side === 1 ? -Math.abs(len) : len)))
        if (nx === gx) continue
        gx = nx
        path += `H${at(gx)}`
      } else {
        const ny = Math.max(0, Math.min(N - 1, gy + (side === 2 ? Math.abs(len) : side === 3 ? -Math.abs(len) : len)))
        if (ny === gy) continue
        gy = ny
        path += `V${at(gy)}`
      }
      horiz = !horiz
    }
    traces.push(path)
    pads.push({ x: at(gx), y: at(gy), solid: r() > 0.4 })
  }

  return { prim: { kind, cx, cy, r: pr, d, turn }, inner, ticks, arcs, traces, pads }
}
