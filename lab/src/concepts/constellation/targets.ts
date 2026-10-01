import * as THREE from 'three'

// Builds every target shape once on the CPU. All motion between them happens
// in the vertex shader; these buffers are never touched again after upload.

// Small seeded PRNG so the field is the same on every load.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number) {
  let u = 0
  while (u === 0) u = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

type NameSample = { fill: Float32Array; edge: Float32Array; aspect: number; lines: number; split: number }

/**
 * Rasterises the name (one line, or a justified two-line block) into an
 * offscreen canvas and returns the lit pixels as normalised points (x in
 * -0.5..0.5, y scaled by the same factor), split into interior and outline so
 * the outline can be weighted for crisper letterforms.
 */
function sampleName(lines: string[]): NameSample | null {
  const W = 2400
  const pad = 40
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return null

  const family = '"Syne Variable", "Syne", system-ui, sans-serif'
  const setFont = (ctx: CanvasRenderingContext2D, size: number) => {
    ctx.font = `800 ${size}px ${family}`
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * 0.03}px`
  }
  // Each line is set at its own size so both span the full width: a justified
  // block, the shorter first name in larger letters above the surname.
  const base = 300
  const laid = lines.map((text) => {
    setFont(probe, base)
    const size = Math.floor(base * ((W - pad * 2) / probe.measureText(text).width))
    setFont(probe, size)
    const m = probe.measureText(text)
    return { text, size, width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent }
  })
  const gap = Math.min(...laid.map((l) => l.ascent)) * 0.2
  const blockH = laid.reduce((sum, l) => sum + l.ascent, 0) + gap * (laid.length - 1) + laid[laid.length - 1].descent
  const H = Math.ceil(blockH + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let top = pad
  const splits: number[] = [] // canvas y where one line ends and the next begins
  laid.forEach((l, i) => {
    setFont(ctx, l.size)
    ctx.fillText(l.text, (W - l.width) / 2, top + l.ascent)
    top += l.ascent + gap
    if (i < laid.length - 1) splits.push(top - gap / 2)
  })

  const data = ctx.getImageData(0, 0, W, H).data
  const lit = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 110
  const fill: number[] = []
  const edge: number[] = []
  let minX = W
  let maxX = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!lit(x, y)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      const isEdge = !lit(x - 2, y) || !lit(x + 2, y) || !lit(x, y - 2) || !lit(x, y + 2)
      ;(isEdge ? edge : fill).push(x, y)
    }
  }
  if (fill.length < 200) return null
  const span = maxX - minX
  const cx = (minX + maxX) / 2
  const cy = pad + blockH / 2
  const norm = (src: number[]) => {
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 2) {
      out[i] = (src[i] - cx) / span
      out[i + 1] = -(src[i + 1] - cy) / span
    }
    return out
  }
  // where the first line break falls, in the same normalised units as the points
  const split = splits.length ? -(splits[0] - cy) / span : 0
  return { fill: norm(fill), edge: norm(edge), aspect: blockH / span, lines: lines.length, split }
}

type Built = { geometry: THREE.BufferGeometry; nameAspect: number; nameLines: number; nameSplit: number; usedSphere: boolean }

/**
 * @param count   total particles
 * @param sphere  true: first target is a globe (used when real type carries
 *                the name); false: first target is the sampled name.
 * @param nameText name to sample, lines separated by a newline
 * @param groups  number of project rows; lattice nodes are dealt into this
 *                many groups so each row can light its own share
 * @param clusters number of disciplines; one small constellation each
 */
export const MAX_CLUSTERS = 8 // uniform array size in the shader; more disciplines than this share clusters

export function buildField(count: number, sphere: boolean, nameText: string, groups: number, clusters: number): Built {
  const groupCount = Math.max(1, Math.floor(groups))
  const clusterCount = Math.min(MAX_CLUSTERS, Math.max(1, Math.floor(clusters)))
  const rand = mulberry32(20261001)
  const g = () => gaussian(rand)

  const chaos = new Float32Array(count * 3)
  const name = new Float32Array(count * 3)
  const galaxy = new Float32Array(count * 3)
  const cluster = new Float32Array(count * 4) // xyz inside a unit disc, w: cluster index + part / 4
  const latA = new Float32Array(count * 3)
  const latB = new Float32Array(count * 3)
  const ring = new Float32Array(count * 3)
  const rnd = new Float32Array(count * 4)
  const meta = new Float32Array(count * 2) // x: lattice group, y: kind (0 dust, 1 node, 2 edge)

  const dustN = Math.floor(count * 0.13)
  const bodyN = count - dustN

  const sample = sphere ? null : sampleName(nameText.split('\n'))
  const usedSphere = !sample

  // ---- lattice graph -----------------------------------------------------
  const nodes: THREE.Vector3[] = []
  const NX = 7
  const NY = 4
  const NZ = 2
  for (let iz = 0; iz < NZ; iz++) {
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++) {
        nodes.push(
          new THREE.Vector3(
            ((ix + 0.5) / NX - 0.5) * 19 + (rand() - 0.5) * 1.7,
            ((iy + 0.5) / NY - 0.5) * 10.4 + (rand() - 0.5) * 1.6,
            -5.2 + iz * 5.2 + (rand() - 0.5) * 2.6,
          ),
        )
      }
    }
  }
  const edges: [number, number][] = []
  const seen = new Set<string>()
  nodes.forEach((n, i) => {
    const near = nodes
      .map((o, j) => ({ j, d: i === j ? Infinity : n.distanceTo(o) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    near.forEach(({ j }, k) => {
      if (k === 2 && rand() < 0.45) return
      const key = i < j ? `${i}:${j}` : `${j}:${i}`
      if (seen.has(key)) return
      seen.add(key)
      edges.push([i, j])
    })
  })
  const edgeLen = edges.map(([a, b]) => nodes[a].distanceTo(nodes[b]))
  const totalLen = edgeLen.reduce((s, l) => s + l, 0)
  const edgeCdf: number[] = []
  edgeLen.reduce((s, l) => {
    const next = s + l / totalLen
    edgeCdf.push(next)
    return next
  }, 0)
  const pickEdge = () => {
    const r = rand()
    let lo = 0
    let hi = edgeCdf.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (edgeCdf[mid] < r) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  // ---- discipline constellations -----------------------------------------
  // Each is a handful of stars joined into a figure, inside a unit disc.
  const figures = Array.from({ length: clusterCount }, () => {
    const n = 5 + Math.floor(rand() * 3)
    const stars: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.9
      const r = 0.28 + rand() * 0.5
      stars.push([Math.cos(a) * r, Math.sin(a) * r])
    }
    const lines: [number, number][] = []
    for (let k = 0; k < n - 1; k++) lines.push([k, k + 1])
    // one or two chords so no two figures read the same
    lines.push([0, 2 + Math.floor(rand() * (n - 3))])
    if (rand() < 0.6) lines.push([1 + Math.floor(rand() * (n - 2)), n - 1])
    return { stars, lines }
  })

  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const isDust = i >= bodyN

    rnd[i * 4] = rand()
    rnd[i * 4 + 1] = rand()
    rnd[i * 4 + 2] = rand()
    rnd[i * 4 + 3] = rand()

    // chaos: a wide shell the intro rushes in from
    {
      const r = 9 + rand() * 16
      const th = rand() * Math.PI * 2
      const ph = Math.acos(2 * rand() - 1)
      chaos[i3] = r * Math.sin(ph) * Math.cos(th) * 1.5
      chaos[i3 + 1] = r * Math.sin(ph) * Math.sin(th)
      chaos[i3 + 2] = r * Math.cos(ph) * 0.8 - 2
    }

    if (isDust) {
      // background star dust: one position shared by every target
      const x = (rand() - 0.5) * 34
      const y = (rand() - 0.5) * 20
      const z = -15 + rand() * 18
      for (const arr of [name, galaxy, latA, latB, ring]) {
        arr[i3] = x
        arr[i3 + 1] = y
        arr[i3 + 2] = z
      }
      cluster[i * 4 + 3] = 0
      meta[i * 2] = -1
      meta[i * 2 + 1] = 0
      continue
    }

    // ---- target 0: name, or a globe when real type is on screen ----------
    if (sample) {
      const useEdge = rand() < 0.42 && sample.edge.length > 0
      const src = useEdge ? sample.edge : sample.fill
      const k = Math.floor(rand() * (src.length / 2)) * 2
      const halo = rand() < 0.07
      const j = halo ? 0.006 : 0.0004
      name[i3] = src[k] + (rand() - 0.5) * 0.0006 + g() * j
      name[i3 + 1] = src[k + 1] + (rand() - 0.5) * 0.0006 + g() * j
      name[i3 + 2] = g() * (halo ? 0.012 : 0.0025)
    } else {
      const pick = rand()
      if (pick < 0.2) {
        // an orbit around the globe, echoing the lattice nodes later on
        const a = rand() * Math.PI * 2
        const R = (pick < 0.15 ? 0.76 : 0.92) + g() * 0.004
        name[i3] = Math.cos(a) * R
        name[i3 + 1] = g() * 0.003
        name[i3 + 2] = Math.sin(a) * R
      } else {
        const shell = pick < 0.88
        const t = (i + 0.5) / bodyN
        const y = 1 - 2 * t
        const rr = Math.sqrt(Math.max(0, 1 - y * y))
        const th = golden * i
        const R = shell ? 0.5 + g() * 0.003 : 0.5 * Math.cbrt(rand()) * 0.9
        name[i3] = Math.cos(th) * rr * R
        name[i3 + 1] = y * R
        name[i3 + 2] = Math.sin(th) * rr * R
      }
    }

    // ---- target 1: spiral galaxy in its own xz plane ---------------------
    {
      const u = rand()
      if (u < 0.2) {
        // bulge
        const r = Math.abs(g()) * 0.46
        const th = rand() * Math.PI * 2
        const ph = Math.acos(2 * rand() - 1)
        galaxy[i3] = r * Math.sin(ph) * Math.cos(th)
        galaxy[i3 + 1] = r * Math.cos(ph) * 0.6
        galaxy[i3 + 2] = r * Math.sin(ph) * Math.sin(th)
      } else if (u < 0.95) {
        // two major arms and two fainter ones between them
        const major = rand() < 0.72
        const r = 0.35 + Math.pow(rand(), major ? 0.8 : 0.6) * 4.7
        const arm = (i % 2) / 2 + (major ? 0 : 0.25)
        const angle = arm * Math.PI * 2 + Math.log(1 + r) * 2.35
        const spread = (major ? 0.05 : 0.09) + r * (major ? 0.055 : 0.08)
        galaxy[i3] = Math.cos(angle) * r + g() * spread
        galaxy[i3 + 1] = g() * 0.07 * (1.25 - r / 6)
        galaxy[i3 + 2] = Math.sin(angle) * r + g() * spread
      } else {
        // sparse halo
        const r = 1.2 + rand() * 5
        const th = rand() * Math.PI * 2
        const ph = Math.acos(2 * rand() - 1)
        galaxy[i3] = r * Math.sin(ph) * Math.cos(th)
        galaxy[i3 + 1] = r * Math.cos(ph) * 0.5
        galaxy[i3 + 2] = r * Math.sin(ph) * Math.sin(th)
      }
    }

    // ---- target 2: one constellation per discipline -----------------------
    {
      const c = i % clusterCount
      const fig = figures[c]
      const pick = rand()
      let x: number
      let y: number
      let z: number
      let part: number // 0 star, 1 line, 2 boundary ring, 3 haze
      if (pick < 0.3) {
        const st = fig.stars[Math.floor(rand() * fig.stars.length)]
        const big = rand() < 0.3
        x = st[0] + g() * (big ? 0.05 : 0.018)
        y = st[1] + g() * (big ? 0.05 : 0.018)
        z = g() * 0.03
        part = 0
      } else if (pick < 0.68) {
        const ln = fig.lines[Math.floor(rand() * fig.lines.length)]
        const a = fig.stars[ln[0]]
        const b = fig.stars[ln[1]]
        const u = rand()
        x = a[0] + (b[0] - a[0]) * u + g() * 0.006
        y = a[1] + (b[1] - a[1]) * u + g() * 0.006
        z = g() * 0.01
        part = 1
      } else if (pick < 0.86) {
        // a dotted boundary, like a plate in a star atlas
        const a = (Math.floor(rand() * 72) / 72) * Math.PI * 2
        x = Math.cos(a) + g() * 0.004
        y = Math.sin(a) + g() * 0.004
        z = 0
        part = 2
      } else {
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * 0.95
        x = Math.cos(a) * r
        y = Math.sin(a) * r
        z = g() * 0.12
        part = 3
      }
      cluster[i * 4] = x
      cluster[i * 4 + 1] = y
      cluster[i * 4 + 2] = z
      cluster[i * 4 + 3] = c + part / 4 + 0.05
    }

    // ---- target 3: node lattice -----------------------------------------
    {
      if (rand() < 0.3) {
        const n = Math.floor(rand() * nodes.length)
        const node = nodes[n]
        let ox: number
        let oy: number
        let oz: number
        const pick = rand()
        if (pick < 0.34) {
          // a thin orbit drawn around the node
          const a = rand() * Math.PI * 2
          const rr = 0.27 + g() * 0.004
          ox = Math.cos(a) * rr
          oy = Math.sin(a) * rr
          oz = g() * 0.008
        } else if (pick < 0.5) {
          // a wider, dotted orbit
          const a = (Math.floor(rand() * 36) / 36) * Math.PI * 2
          const rr = 0.46
          ox = Math.cos(a) * rr + g() * 0.006
          oy = Math.sin(a) * rr + g() * 0.006
          oz = g() * 0.008
        } else {
          ox = g() * 0.032
          oy = g() * 0.032
          oz = g() * 0.032
        }
        latA[i3] = latB[i3] = node.x + ox
        latA[i3 + 1] = latB[i3 + 1] = node.y + oy
        latA[i3 + 2] = latB[i3 + 2] = node.z + oz
        meta[i * 2] = n % groupCount
        meta[i * 2 + 1] = 1
      } else {
        const e = pickEdge()
        const flip = rand() < 0.5
        const a = nodes[edges[e][flip ? 1 : 0]]
        const b = nodes[edges[e][flip ? 0 : 1]]
        const jx = g() * 0.012
        const jy = g() * 0.012
        const jz = g() * 0.012
        latA[i3] = a.x + jx
        latA[i3 + 1] = a.y + jy
        latA[i3 + 2] = a.z + jz
        latB[i3] = b.x + jx
        latB[i3 + 1] = b.y + jy
        latB[i3 + 2] = b.z + jz
        meta[i * 2] = edges[e][flip ? 1 : 0] % groupCount
        meta[i * 2 + 1] = 2
      }
    }

    // ---- target 4: ring in its own xz plane ------------------------------
    {
      const th = rand() * Math.PI * 2
      const u = rand()
      let r: number
      let y: number
      if (u < 0.56) {
        r = 6 + g() * 0.07
        y = g() * 0.02
      } else if (u < 0.86) {
        r = 6 + Math.abs(g()) * 1.5
        y = g() * 0.05
      } else {
        r = 6 - Math.abs(g()) * 0.8
        y = g() * 0.04
      }
      ring[i3] = Math.cos(th) * r
      ring[i3 + 1] = y
      ring[i3 + 2] = Math.sin(th) * r
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(chaos, 3))
  geometry.setAttribute('aName', new THREE.BufferAttribute(name, 3))
  geometry.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxy, 3))
  geometry.setAttribute('aCluster', new THREE.BufferAttribute(cluster, 4))
  geometry.setAttribute('aLatA', new THREE.BufferAttribute(latA, 3))
  geometry.setAttribute('aLatB', new THREE.BufferAttribute(latB, 3))
  geometry.setAttribute('aRing', new THREE.BufferAttribute(ring, 3))
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4))
  geometry.setAttribute('aMeta', new THREE.BufferAttribute(meta, 2))
  // Positions are rewritten in the vertex shader, so a computed bound would
  // be wrong. Give three a generous one and skip culling on the object.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60)

  return { geometry, nameAspect: sample ? sample.aspect : 1, nameLines: sample ? sample.lines : 1, nameSplit: sample ? sample.split : 0, usedSphere }
}
