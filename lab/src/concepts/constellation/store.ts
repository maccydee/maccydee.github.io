// Mutable bridge between the DOM layer (scroll, pointer, hover) and the WebGL
// field. Written from event handlers and the page rAF loop, read inside
// useFrame. Deliberately not React state: none of this should re-render.

export type FieldStore = {
  /** Smoothed morph position. 0 name, 1 galaxy, 2 lattice, 3 ring. */
  morph: number
  /** Scroll offset in viewport heights, used for dust parallax. */
  scroll: number
  /** Signed, normalised scroll velocity (about -1..1). */
  vel: number
  /** Scroll offset, in viewport heights, at which the role section is centred. */
  roleAt: number
  /** 0..1 progress through the work section, turns the lattice. */
  workProg: number
  /** Pointer in normalised device coordinates. */
  ndcX: number
  ndcY: number
  /** 1 while a fine pointer is over the page, else 0. */
  pointerOn: number
  /** Index of the hovered or focused project row, -1 for none. */
  active: number
  /** 1 while a contact link is hovered or focused. */
  warm: number
  /** Incremented to fire a pulse from pulseX / pulseY (NDC). */
  pulseId: number
  pulseX: number
  pulseY: number
  /** One entry per discipline: where its cluster sits, relative to the viewport centre (x in widths, y and r in heights, y down). */
  clusters: { x: number; y: number; r: number }[]
  /** True once the disciplines section has been revealed. */
  clustersIn: boolean
  /** Index of the hovered discipline, -1 for none. */
  clusterActive: number
  /** Measured frames per second, written by the field. */
  fps: number
  /** Bottom edge of the particle name in CSS pixels from the top, written by the field. 0 until known. */
  nameBottom: number
}

export function createStore(): FieldStore {
  return {
    morph: 0,
    scroll: 0,
    vel: 0,
    roleAt: 1,
    workProg: 0,
    ndcX: 0,
    ndcY: 0,
    pointerOn: 0,
    active: -1,
    warm: 0,
    pulseId: 0,
    pulseX: 0,
    pulseY: 0,
    clusters: [],
    clustersIn: false,
    clusterActive: -1,
    fps: 0,
    nameBottom: 0,
  }
}

export function firePulse(store: FieldStore, clientX: number, clientY: number) {
  store.pulseX = (clientX / window.innerWidth) * 2 - 1
  store.pulseY = -((clientY / window.innerHeight) * 2 - 1)
  store.pulseId += 1
}
