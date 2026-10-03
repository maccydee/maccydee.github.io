// Shared mutable state for the concept. Everything here is written from event
// handlers / animation frames and read from other animation frames, so none of
// it goes through React state.

export type Rect = { x: number; y: number; w: number; h: number }

export const bus = {
  pointer: {
    x: -9999,
    y: -9999,
    /** performance.now() of the last real pointer move */
    moved: -1e9,
    /** true once a mouse (fine pointer) has moved */
    seen: false,
  },
  fluid: {
    /** 0 = seen through letterforms, 1 = full bleed behind light type */
    light: 0,
    /** 1 = nothing is set over or against the water, so highlights may run to white */
    peak: 0,
    tint: [0.016, 0.13, 0.38] as [number, number, number],
    tintAmt: 0,
  },
  /** Screen rect the preview swatch should copy from the water, or null. */
  lens: null as Rect | null,
  lensCanvas: null as HTMLCanvasElement | null,
  /**
   * Screen rects where the water can actually be seen right now. The renderer
   * scissors to these, so most of the time it shades a fraction of the screen.
   * null = whole viewport.
   */
  windows: null as Rect[] | null,
  /** Drop something into the water at a viewport point (set by the renderer). */
  splash: null as ((x: number, y: number, strength?: number) => void) | null,
  /** Smoothed frames per second of the water, for the readout. */
  fps: 0,
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Progress of v through [a, b], clamped to 0..1. */
export const span = (v: number, a: number, b: number) => clamp((v - a) / (b - a))
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOut = (t: number, p = 3) => 1 - Math.pow(1 - t, p)

/**
 * Sea states, cycled by project index: the body colour of the water in the
 * arch. The shader derives its depths and its lit crests from it.
 */
export const WATERS: readonly [number, number, number][] = [
  [0.016, 0.13, 0.38], // open ocean
  [0.15, 0.22, 0.3], // storm grey-blue
  [0.02, 0.3, 0.36], // shallows
  [0.008, 0.045, 0.16], // deep trench
  [0.2, 0.3, 0.44], // dawn
  [0.03, 0.22, 0.17], // kelp green
  [0.0, 0.2, 0.34], // gulf
  [0.09, 0.16, 0.24], // squall
]
