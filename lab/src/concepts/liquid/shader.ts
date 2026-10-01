// Water. Clear, sunlit, seen from above.
//
// Two passes.
//   SIM      a low-resolution heightfield stepped with the 2D wave equation in
//            a ping-pong float framebuffer. Pointer movement and presses inject
//            drops; rings spread, bounce softly off the edges and damp out.
//   DISPLAY  one fullscreen triangle. The surface slope (simulated ripples plus
//            a slow procedural swell) is used as a normal: it refracts the pool
//            floor and the caustic light network beneath, focuses extra light
//            where the surface curves, and catches small sun glints.
//
// If float render targets are not available the display pass is compiled with
// PROC and draws procedural rings from the pointer trail instead of the sim.
//
// The output is clamped to the page's bone colour. The canvas is composited
// with `mix-blend-mode: lighten`, so it can never be brighter than the ground:
// it is invisible over bone and visible only where the page paints black.

export const VERT = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/** One step of the wave equation. R = height now, G = height one step ago. */
export const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDamp;
uniform float uAspect;
uniform vec4 uDrop;   // xy = end of the stroke (uv), z = radius, w = strength
uniform vec2 uFrom;   // start of the stroke (uv)

void main() {
  vec4 c = texture2D(uPrev, vUv);
  float l = texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
  float d = texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
  float u = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r;

  float next = (l + r + u + d) * 0.5 - c.g;
  // a touch of diffusion keeps the grid from ringing at its own frequency
  next = mix(next, (l + r + u + d) * 0.25, 0.012);
  next *= uDamp;

  if (uDrop.w != 0.0) {
    // distance to the pointer's stroke, so a fast move leaves a wake, not dots
    vec2 a = vec2(uAspect, 1.0);
    vec2 pa = (vUv - uFrom) * a;
    vec2 ba = (uDrop.xy - uFrom) * a;
    float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    float dist = length(pa - ba * k);
    next += uDrop.w * exp(-(dist * dist) / (uDrop.z * uDrop.z));
  }

  gl_FragColor = vec4(clamp(next, -4.0, 4.0), c.r, 0.0, 1.0);
}
`

export const displayFrag = (opts: { proc: boolean; lite: boolean }) => /* glsl */ `
precision highp float;
${opts.proc ? '#define PROC' : ''}
#define CAUSTIC_ITER ${opts.lite ? 3 : 4}

varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uLight;    // 0 = deep water (reads against the page), 1 = sunlit shallows (ink reads on it)
uniform float uScale;
uniform vec3 uTint;      // water colour of the active project
uniform float uTintAmt;
#ifdef PROC
uniform vec4 uTrail[5];  // xy = position, zw = velocity (field space)
uniform vec3 uClick;     // xy = position, z = age in seconds
#else
uniform sampler2D uSim;
uniform vec2 uSimTexel;
#endif

const vec3 BONE = vec3(0.93725, 0.91765, 0.88627);

// slow ambient swell: the water is never still
float swell(vec2 p, float t) {
  float s = sin(p.x * 1.15 + t * 0.42 + 1.3 * sin(p.y * 0.8 - t * 0.27));
  s += 0.7 * sin(p.y * 1.75 - t * 0.36 + 1.1 * sin(p.x * 1.2 + t * 0.19));
  s += 0.35 * sin((p.x + p.y) * 2.6 + t * 0.61);
  return s;
}

// caustic light network: light folded through a rippling surface (iterated
// sine warp, the classic pool-floor pattern)
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < CAUSTIC_ITER; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= float(CAUSTIC_ITER);
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

#ifdef PROC
float rings(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 d = p - uTrail[i].xy;
    float dd = dot(d, d);
    h += exp(-dd * 9.0) * min(length(uTrail[i].zw), 4.0) * 0.05 * sin(sqrt(dd) * 26.0 - uTime * 8.0);
  }
  float cd = length(p - uClick.xy);
  float front = uClick.z * 1.1;
  h += 0.12 * sin((cd - front) * 30.0) * exp(-abs(cd - front) * 6.0) * exp(-uClick.z * 1.2);
  return h;
}
#endif

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * uScale;
  float t = uTime;

  // --- surface slope: ripples + swell
  vec2 slope;
  float focus;
#ifdef PROC
  float e = 0.01;
  float r0 = rings(p);
  slope = vec2(rings(p + vec2(e, 0.0)) - r0, rings(p + vec2(0.0, e)) - r0) / e * 0.22;
  focus = -r0 * 3.0;
#else
  float c = texture2D(uSim, vUv).r;
  float l = texture2D(uSim, vUv - vec2(uSimTexel.x, 0.0)).r;
  float r = texture2D(uSim, vUv + vec2(uSimTexel.x, 0.0)).r;
  float d = texture2D(uSim, vUv - vec2(0.0, uSimTexel.y)).r;
  float u = texture2D(uSim, vUv + vec2(0.0, uSimTexel.y)).r;
  slope = vec2(r - l, u - d) * 2.5;
  // where the surface curves it acts as a lens and gathers light
  focus = (4.0 * c - (l + r + u + d)) * 4.4;
#endif
  float se = 0.04;
  float s0 = swell(p, t);
  slope += vec2(swell(p + vec2(se, 0.0), t) - s0, swell(p + vec2(0.0, se), t) - s0) / se * 0.055;

  // --- look down through it: everything beneath is displaced by the slope
  vec2 q = p + slope * 0.42;

  // pool floor: large pale tiles, seen only as their wobbling joints
  vec2 tile = abs(fract(q / 0.4) - 0.5);
  float joint = smoothstep(0.474, 0.494, max(tile.x, tile.y));

  // caustics: two networks drifting across each other
  float ca = caustic(q * 1.02 + vec2(0.0, t * 0.012), t * 0.5);
  ca += 0.45 * caustic(q * 0.57 + vec2(3.7, 1.9) - vec2(t * 0.009, 0.0), t * 0.36 + 4.0);
  ca = ca * 1.05 + max(focus, -0.25);
  ca = clamp(ca, 0.0, 1.6);

  // depth: slow, wide variation between shallows and deeper water
  float depth = 0.5 + 0.5 * sin(q.x * 0.55 + 1.4 * sin(q.y * 0.45 + t * 0.03) + t * 0.02);
  depth = mix(depth, 0.5 + 0.5 * sin(q.y * 0.9 - q.x * 0.3), 0.35);

  // --- deep water: saturated teal into deep blue, always darker than the page
  vec3 deepA = vec3(0.004, 0.095, 0.235);
  vec3 deepB = vec3(0.000, 0.275, 0.365);
  vec3 tintDeepA = uTint * 0.42;
  vec3 tintDeepB = uTint;
  vec3 dA = mix(deepA, tintDeepA, uTintAmt);
  vec3 dB = mix(deepB, tintDeepB, uTintAmt);
  vec3 deep = mix(dA, dB, depth);
  deep *= 1.0 - 0.14 * joint;
  // caustic peaks in deep water stay under the 3:1 line against the page
  vec3 deepLight = mix(vec3(0.18, 0.56, 0.60), min(uTint * 1.5 + 0.12, vec3(0.30, 0.60, 0.64)), uTintAmt);
  deep = mix(deep, deepLight, clamp(ca * 0.95, 0.0, 1.0));

  // --- sunlit shallows: pale aqua, caustics burn out to the paper white
  vec3 shA = vec3(0.500, 0.800, 0.830);
  vec3 shB = vec3(0.700, 0.900, 0.890);
  vec3 shallow = mix(shA, shB, depth);
  shallow = mix(shallow, shallow * mix(vec3(1.0), uTint + 0.45, 0.5), uTintAmt);
  shallow *= 1.0 - 0.05 * joint;
  // white-gold light: capped just under the paper so it never reads pink
  shallow = mix(shallow, vec3(0.918, 0.918, 0.842), clamp(ca, 0.0, 1.0) * 0.86);

  vec3 col = mix(deep, shallow, uLight);

  // sun glints on the steeper faces of the ripples
  vec3 n = normalize(vec3(-slope * 2.2, 1.0));
  float glint = pow(max(dot(n, normalize(vec3(0.16, 0.26, 0.95))), 0.0), 220.0);
  glint *= smoothstep(0.02, 0.12, length(slope));
  col += glint * mix(vec3(0.16, 0.20, 0.20), vec3(0.25), uLight);

  // dither against banding, then pin the ceiling to the page colour
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;
  gl_FragColor = vec4(min(max(col, 0.0), BONE), 1.0);
}
`
