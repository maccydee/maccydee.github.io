// Open sea, seen from above.
//
// Two passes.
//   SIM      a low-resolution heightfield stepped with the 2D wave equation in
//            a ping-pong float framebuffer. Pointer movement and presses inject
//            drops; rings spread, bounce softly off the edges and damp out.
//   DISPLAY  one fullscreen triangle. A long rolling swell with wind chop on
//            top, plus the simulated ripples, gives a surface normal. That
//            normal picks up sky on the faces that tilt away, sun glitter on
//            the faces that tilt toward the light, and foam where a crest
//            would break. Beneath it the water is layered blue with no floor:
//            lighter through the crests, near-navy in the troughs.
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
#define CHOP ${opts.lite ? 3 : 4}

varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uLight;    // 0 = seen through letterforms on the page, 1 = full bleed behind light type
uniform float uPeak;     // 0 = highlights held under the contrast line, 1 = free (nothing is set over it)
uniform float uScale;
uniform vec3 uTint;      // body colour of the sea state for the active project
uniform float uTintAmt;
#ifdef PROC
uniform vec4 uTrail[5];  // xy = position, zw = velocity (field space)
uniform vec3 uClick;     // xy = position, z = age in seconds
#else
uniform sampler2D uSim;
uniform vec2 uSimTexel;
#endif

const vec3 BONE = vec3(0.93725, 0.91765, 0.88627);
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

// arithmetic hash (no sin): cheap, and identical across GPUs
vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// the long swell: three wave trains rolling the same general way, crests
// peaked and troughs wide. x = height, y = 0..1 position on the main wave
vec2 swell(vec2 p, float t) {
  // crests are never ruler straight
  vec2 w = p + 0.3 * vec2(gnoise(p * 0.3 + t * 0.02), gnoise(p * 0.3 + 7.3 - t * 0.017));
  float a = 0.5 + 0.5 * sin(dot(w, vec2(0.31, 0.95)) * 3.3 + t * 0.62);
  float b = 0.5 + 0.5 * sin(dot(w, vec2(-0.36, 0.93)) * 5.4 + t * 0.83 + 1.7);
  float c = sin(dot(w, vec2(0.78, 0.63)) * 8.1 + t * 1.05);
  float h = 0.62 * pow(a, 1.8) + 0.26 * pow(b, 1.5) + 0.07 * c;
  return vec2(h, a);
}

// wind chop: small ridged wavelets riding on the swell
float chop(vec2 p, float t) {
  float h = 0.0;
  float amp = 0.5;
  vec2 q = p * 4.4 + vec2(t * 0.42, t * 0.3);
  for (int i = 0; i < CHOP; i++) {
    h += amp * (1.0 - 2.4 * abs(gnoise(q)));
    q = ROT * q * 1.93 + vec2(t * 0.21, -t * 0.16);
    amp *= 0.5;
  }
  return h;
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

  // --- the pointer's ripples: a disturbance sitting on top of the swell
  vec2 ripple;
  float focus;
#ifdef PROC
  float re = 0.01;
  float r0 = rings(p);
  ripple = vec2(rings(p + vec2(re, 0.0)) - r0, rings(p + vec2(0.0, re)) - r0) / re * 0.22;
  focus = -r0 * 3.0;
#else
  float c = texture2D(uSim, vUv).r;
  float l = texture2D(uSim, vUv - vec2(uSimTexel.x, 0.0)).r;
  float r = texture2D(uSim, vUv + vec2(uSimTexel.x, 0.0)).r;
  float d = texture2D(uSim, vUv - vec2(0.0, uSimTexel.y)).r;
  float u = texture2D(uSim, vUv + vec2(0.0, uSimTexel.y)).r;
  ripple = vec2(r - l, u - d) * 2.6;
  focus = (4.0 * c - (l + r + u + d)) * 3.0;
#endif

  // --- surface: swell and chop, differentiated into a normal
  float e = 0.02;
  vec2 s0 = swell(p, t);
  vec2 gs = vec2(swell(p + vec2(e, 0.0), t).x - s0.x, swell(p + vec2(0.0, e), t).x - s0.x) / e;
  float c0 = chop(p, t);
  vec2 gc = vec2(chop(p + vec2(e, 0.0), t) - c0, chop(p + vec2(0.0, e), t) - c0) / e;
  vec2 slope = gs * 0.36 + gc * 0.022 + ripple;
  vec3 n = normalize(vec3(-slope, 1.0));
  float crest = s0.x;                       // 0 in the troughs, about 0.9 on the crests

  // --- the water itself: layered blue, no floor. Near-navy in the troughs
  // and the depths, ultramarine in open water, teal where light gets through
  // the thin water of a crest
  float deepField = 0.5 + 0.5 * gnoise(p * 0.22 + vec2(t * 0.012, -t * 0.008));
  vec3 navy = vec3(0.006, 0.030, 0.090);
  vec3 ultra = vec3(0.016, 0.110, 0.300);
  vec3 teal = vec3(0.010, 0.250, 0.330);
  vec3 open = mix(ultra, uTint, uTintAmt);
  vec3 through = mix(teal, min(uTint * 1.7 + vec3(0.0, 0.05, 0.04), vec3(0.5)), uTintAmt);
  vec3 body = mix(mix(navy, open * 0.42, uTintAmt * 0.6), open, smoothstep(0.15, 0.85, deepField) * 0.75 + 0.25 * crest);
  body = mix(body, through, smoothstep(0.42, 0.95, crest) * 0.62 + 0.10 * c0);

  // light shafts fading into the depth: faint, slow, only where the water is open
  float shaft = gnoise(vec2(p.x * 1.6 + p.y * 0.5, p.y * 0.35) + vec2(t * 0.05, 0.0));
  body += through * 0.10 * smoothstep(0.1, 0.6, shaft) * (1.0 - crest);

  // --- sky on the faces that tilt away from us
  vec3 V = normalize(vec3(0.0, -0.5, 0.87));
  vec3 L = normalize(vec3(0.42, 0.48, 0.77));
  float ndv = max(dot(n, V), 0.0);
  float fres = clamp(pow(1.0 - ndv, 2.2) * 2.6, 0.0, 1.0);
  vec3 sky = vec3(0.40, 0.56, 0.72);
  vec3 col = mix(body, sky, fres * 0.72);

  // --- sun: a soft sheen along the swell faces and hard glitter off the chop
  vec3 H = normalize(L + V);
  float sheen = pow(max(dot(n, H), 0.0), 30.0);
  // glitter comes off the small wavelets, and breaks into points of light
  vec3 ng = normalize(vec3(-(gs * 0.36 + gc * 0.085 + ripple), 1.0));
  float spark = smoothstep(0.18, 0.62, gnoise(p * 34.0 + vec2(t * 1.3, -t * 0.9)));
  float glitter = pow(max(dot(ng, H), 0.0), 260.0) * spark;
  vec3 sun = vec3(1.0, 0.96, 0.88);
  col += sun * (sheen * 0.14 + glitter * 1.7);

  // --- foam: only where a crest would break, torn into streaks along it
  float streak = gnoise(vec2(dot(p, vec2(0.95, -0.31)) * 1.6, dot(p, vec2(0.31, 0.95)) * 14.0) + vec2(t * 0.2, 0.0));
  float breaking = gnoise(p * 0.55 + vec2(3.1, t * 0.06));       // most crests do not break
  float foam = smoothstep(0.955, 0.998, s0.y) * smoothstep(0.0, 0.35, streak + 0.4 * c0) * smoothstep(0.05, 0.4, breaking);
  foam += smoothstep(0.3, 0.9, focus) * 0.35;   // a press throws up a little white
  // held back where the contrast guard would only turn it into grey
  col = mix(col, vec3(0.90, 0.93, 0.93), clamp(foam, 0.0, 1.0) * mix(0.3, 0.8, uPeak));

  // dither against banding
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;
  col = max(col, 0.0);

  // --- contrast guard. Where type depends on this water (the name reads
  // against the page through it; light type sits on it at full bleed) the
  // relative luminance is held under a ceiling at every pixel of every frame:
  // 0.21 behind the letterforms (3:1 against the page for display type),
  // 0.13 at full bleed (4.5:1 for the bone type). Hue is preserved.
  vec3 lin = pow(col, vec3(2.2));
  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float cap = mix(mix(0.21, 0.13, uLight), 4.0, uPeak);
  lin *= min(1.0, cap / max(lum, 1e-4));
  col = pow(lin, vec3(1.0 / 2.2));

  // never brighter than the page: this is what makes the lighten mask work
  gl_FragColor = vec4(min(col, BONE), 1.0);
}
`
