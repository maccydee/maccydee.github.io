// One Points object, one ShaderMaterial. Every particle carries all four
// target shapes as attributes; the vertex shader blends between them and adds
// curl-noise drift, pointer repulsion and the hover pulse.

// Simplex noise: Ian McEwan / Ashima Arts, MIT licence (webgl-noise).
const noise = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 snoise3(vec3 x){
  return vec3(
    snoise(x),
    snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
    snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
  );
}

// Divergence-free field: the curl of a vector noise potential.
vec3 curl(vec3 p){
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 px0 = snoise3(p - dx), px1 = snoise3(p + dx);
  vec3 py0 = snoise3(p - dy), py1 = snoise3(p + dy);
  vec3 pz0 = snoise3(p - dz), pz1 = snoise3(p + dz);
  float x = py1.z - py0.z - pz1.y + pz0.y;
  float y = pz1.x - pz0.x - px1.z + px0.z;
  float z = px1.y - px0.y - py1.x + py0.x;
  return vec3(x, y, z) / (2.0 * e);
}
`

export const vertexShader = /* glsl */ `
#define PI 3.141592653589793

uniform float uTime;
uniform float uIntro;
uniform float uMorph;
uniform float uPixelRatio;
uniform float uSize;
uniform float uDim;
uniform float uVel;
uniform float uScroll;

uniform float uSphere;
uniform float uNameWidth;
uniform vec3 uNameOffset;
uniform float uNameHalfH;
uniform float uNameLines;
uniform float uNameSplit;
uniform float uNameSize;
uniform float uGalaxyScale;
uniform vec3 uGalaxyOffset;
uniform vec4 uClusterC[8];
uniform float uClusterActive;
uniform float uClusterActiveAmt;
uniform float uLatScaleX;
uniform float uLatRot;
uniform float uRingScale;
uniform vec3 uRingOffset;

uniform vec3 uRayO;
uniform vec3 uRayD;
uniform vec3 uRayD2;
uniform float uPointerAmt;

uniform float uActive;
uniform float uActiveAmt;
uniform float uWarm;
uniform vec3 uPulseO;
uniform float uPulseR;
uniform float uPulseAmt;

attribute vec3 aName;
attribute vec3 aGalaxy;
attribute vec4 aCluster;
attribute vec3 aLatA;
attribute vec3 aLatB;
attribute vec3 aRing;
attribute vec4 aRand;
attribute vec2 aMeta;

varying vec3 vColor;
varying float vAlpha;

${noise}

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float stage(float m, float delay){
  float x = clamp((clamp(m, 0.0, 1.0) - delay * 0.3) / 0.7, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

vec3 repel(vec3 p, vec3 rayD, float radius, float push, float swirl){
  vec3 v = p - uRayO;
  vec3 perp = v - dot(v, rayD) * rayD;
  float d = length(perp);
  float f = exp(-(d * d) / (radius * radius)) * uPointerAmt;
  vec3 dir = perp / max(d, 0.0001);
  return dir * f * push + cross(rayD, dir) * f * swirl;
}

void main(){
  float kind = aMeta.y;
  float dust = 1.0 - step(0.5, kind);
  float body = 1.0 - dust;
  float t = uTime;

  float s0 = stage(uMorph, aRand.y);
  float s1 = stage(uMorph - 1.0, aRand.y);
  float s2 = stage(uMorph - 2.0, aRand.y);
  float s3 = stage(uMorph - 3.0, aRand.y);
  float inCluster = s1 * (1.0 - s2);
  float inLattice = s2 * (1.0 - s3);

  // target 0: name (or globe)
  vec3 pN = aName;
  if (uSphere > 0.5) {
    pN.xz = rot(t * 0.11) * pN.xz;
    pN.yz = rot(0.34) * pN.yz;
    pN.xy = rot(-0.22) * pN.xy;
  }
  pN = pN * uNameWidth + uNameOffset;

  // target 1: galaxy, spin then tilt
  vec3 pG = aGalaxy;
  float gr = length(pG.xz);
  // rigid spin plus a bounded differential sway, so the arms never wind up
  pG.xz = rot(-t * 0.04 - sin(t * 0.06) * 0.5 / (0.8 + gr)) * pG.xz;
  pG.yz = rot(0.98) * pG.yz;
  pG.xy = rot(-0.42) * pG.xy;
  pG = pG * uGalaxyScale + uGalaxyOffset;

  // target 2: one constellation per discipline, parked on its label
  float cIdx = floor(aCluster.w);
  float cPart = floor(fract(aCluster.w) * 4.0);
  vec4 cc = uClusterC[int(cIdx)];
  vec3 pC = aCluster.xyz;
  // the figure turns slowly inside its boundary; the boundary itself stays put
  float spin = t * 0.07 * (mod(cIdx, 2.0) < 0.5 ? 1.0 : -1.0);
  if (cPart < 1.5 || cPart > 2.5) pC.xy = rot(spin) * pC.xy;
  pC = vec3(cc.xy, 0.0) + pC * cc.z;
  float cLit = cc.w;

  // target 3: lattice, particles stream along their edge
  float flow = fract(aRand.z + t * 0.012 * (0.4 + aRand.w));
  vec3 pL = mix(aLatA, aLatB, flow);
  pL.xz = rot(uLatRot) * pL.xz;
  pL.x *= uLatScaleX;

  // target 4: ring seen close to edge-on, reads as a horizon
  vec3 pR = aRing;
  pR.xz = rot(t * 0.04) * pR.xz;
  pR.yz = rot(-0.09) * pR.yz;
  pR.xy = rot(0.045) * pR.xy;
  pR = pR * uRingScale + uRingOffset;

  vec3 p = mix(pN, pG, s0);
  p = mix(p, pC, s1);
  p = mix(p, pL, s2);
  p = mix(p, pR, s3);

  // dust keeps one position and drifts past with the scroll
  vec3 pD = aGalaxy;
  pD.y = mod(pD.y + uScroll * (0.5 + aRand.w) + 10.0, 20.0) - 10.0;
  p = mix(p, pD, dust);

  // curl-noise drift, strongest mid-morph so shapes dissolve like fluid
  float turb = sin(PI * s0) + sin(PI * s1) + sin(PI * s2) + sin(PI * s3);
  float nameDrift = mix(0.004, 0.012, uSphere);
  float drift = mix(mix(mix(mix(nameDrift, 0.13, s0), 0.005, s1), 0.03, s2), 0.01, s3);
  drift = mix(drift, 0.28, dust);
  vec3 c = curl(p * 0.23 + vec3(0.0, 0.0, t * 0.035) + aRand.x * 0.15);
  p += c * (drift + turb * body * 1.25 + abs(uVel) * 0.22 * body);
  p.y += uVel * (0.1 + aRand.z * 0.55) * body;

  // intro: rush in from chaos along a curved path
  // the name writes itself left to right, the second line a beat behind
  float lineLag = (uNameLines > 1.5 && aName.y < uNameSplit) ? 0.07 : 0.0;
  float delay = uSphere > 0.5 ? aRand.x * 0.5 : (aName.x + 0.5) * 0.38 + lineLag + aRand.x * 0.09;
  delay = mix(delay, aRand.x * 0.5, dust);
  float ti = clamp((uIntro - delay) / 0.46, 0.0, 1.0);
  float ei = 1.0 - pow(1.0 - ti, 4.0);
  vec3 start = position;
  start.xy = rot((1.0 - ei) * 1.7) * start.xy;
  p = mix(start, p, ei);

  // pointer: push away from the cursor ray and swirl around it
  p += repel(p, uRayD, 0.62, 0.42, 0.3) * body;
  p += repel(p, uRayD2, 1.3, 0.16, -0.16) * body;
  p += repel(p, uRayD, 1.6, 0.25, 0.1) * dust;

  // pulse: a shell expanding from the hovered row
  float pd = distance(p, uPulseO);
  float pw = exp(-pow((pd - uPulseR) / 0.75, 2.0)) * uPulseAmt;
  p += normalize(p - uPulseO + vec3(0.0001)) * pw * 0.16;

  // colour
  vec3 ice = vec3(0.87, 0.93, 1.0);
  vec3 blue = vec3(0.13, 0.38, 1.0);
  vec3 amber = vec3(1.0, 0.66, 0.24);
  float w = aRand.w;
  vec3 col = mix(blue, ice, smoothstep(0.1, 0.95, w));
  // name: mostly ice, cooling to blue towards the foot of each letter
  float inName = (1.0 - s0) * body * (1.0 - uSphere);
  // height within its own line, -1 at the foot to 1 at the cap
  float upper = step(uNameSplit, aName.y);
  float lineTop = uNameLines > 1.5 ? mix(uNameSplit, uNameHalfH, upper) : uNameHalfH;
  float lineBot = uNameLines > 1.5 ? mix(-uNameHalfH, uNameSplit, upper) : -uNameHalfH;
  float inLine = (aName.y - lineBot) / max(lineTop - lineBot, 0.0001) * 2.0 - 1.0;
  vec3 nameCol = mix(mix(blue, ice, 0.5), ice, smoothstep(-0.95, 0.35, inLine + (w - 0.5) * 0.9));
  col = mix(col, nameCol, inName * 0.85);
  // galaxy: white-hot core, electric blue arms
  float inGalaxy = s0 * (1.0 - s1) * body;
  vec3 galCol = mix(ice, mix(blue, ice, w * w * 0.6), smoothstep(0.2, 3.4, gr));
  col = mix(col, galCol, inGalaxy * 0.9);
  float spark = step(0.972, aRand.x);
  col = mix(col, amber, spark);

  float node = step(0.5, kind) * (1.0 - step(1.5, kind));
  float act = body * uActiveAmt * inLattice * (1.0 - step(0.5, abs(aMeta.x - uActive)));
  // clusters: cool until their label lands, then ice with a few hot stars
  float cStar = 1.0 - step(0.5, cPart);
  float cLine = step(0.5, cPart) * (1.0 - step(1.5, cPart));
  float cRing = step(1.5, cPart) * (1.0 - step(2.5, cPart));
  vec3 clusterCol = mix(mix(blue, ice, 0.25), mix(blue, ice, 0.55 + 0.45 * cStar), cLit);
  col = mix(col, clusterCol, inCluster * body * (1.0 - spark));
  float cAct = body * inCluster * uClusterActiveAmt * (1.0 - step(0.5, abs(cIdx - uClusterActive)));
  col = mix(col, amber, clamp(act * 0.92 + cAct * 0.85 + pw * 0.85 + uWarm * 0.35 * body, 0.0, 1.0));

  // brightness
  float a = mix(mix(0.5, 0.9, (1.0 - s0) * (1.0 - uSphere)), 0.42, dust);
  a = mix(a, mix(1.0, 0.62, smoothstep(0.0, 4.5, gr)), inGalaxy);
  a = mix(a, mix(0.5, 1.0, node), inLattice * body);
  float cA = cStar * 0.8 + cLine * 0.55 + cRing * 0.42 + (1.0 - cStar - cLine - cRing) * 0.3;
  a = mix(a, cA * mix(0.3, 1.0, cLit), inCluster * body);
  a *= mix(uDim, 1.0, dust * 0.6);
  a *= 0.78 + 0.22 * sin(t * (0.6 + aRand.z * 1.6) + aRand.x * 40.0);
  a *= smoothstep(0.0, 0.2, ti);
  a += act * mix(0.32, 0.8, node) + cAct * mix(0.3, 0.7, cStar) + pw * 0.7 + spark * 0.25 * body;
  a += uWarm * 0.18 * body;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  a *= mix(0.3, 1.0, smoothstep(26.0, 9.0, depth));

  float size = uSize * (0.55 + aRand.w * 1.0);
  size *= mix(1.0, uNameSize, (1.0 - s0) * body * (1.0 - uSphere));
  size *= 1.0 + spark * 0.9 + dust * 0.5 + act * 0.7 + pw * 0.8 + inGalaxy * 0.3;
  size *= mix(1.0, mix(0.82, 1.25, node), inLattice * body);
  size *= mix(1.0, mix(0.8, 1.3, cStar), inCluster * body);
  float px = size * uPixelRatio * (10.0 / max(depth, 0.5));
  // below one pixel, keep the point and spend the difference on alpha
  a *= clamp(px, 0.35, 1.0);

  vColor = col;
  vAlpha = a;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(px, 1.0, 42.0);
}
`

export const fragmentShader = /* glsl */ `
uniform float uLinear;
varying vec3 vColor;
varying float vAlpha;

void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vAlpha;
  vec3 c = vColor;
  // When a linear post chain follows, convert so a single sprite still lands
  // on the same display colour as the direct path.
  if (uLinear > 0.5) {
    c = pow(c, vec3(2.2));
    a = pow(a, 2.2);
  }
  gl_FragColor = vec4(c, a);
}
`
