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
    /** 0 = deep water, 1 = sunlit shallows */
    light: 0,
    tint: [0.03, 0.56, 0.6] as [number, number, number],
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
 * Water colours, cycled by project index. Each is the sunlit body colour of
 * the water in the arch; the shader derives its depths from it. All stay in
 * the water family.
 */
export const WATERS: readonly [number, number, number][] = [
  [0.03, 0.56, 0.6], // lagoon
  [0.04, 0.24, 0.52], // deep sea
  [0.0, 0.46, 0.44], // teal
  [0.3, 0.6, 0.72], // glacier
  [0.08, 0.5, 0.36], // sea green
  [0.24, 0.38, 0.58], // slate blue
  [0.0, 0.4, 0.62], // azure
  [0.14, 0.58, 0.52], // shallows
]
