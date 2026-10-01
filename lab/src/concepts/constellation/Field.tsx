import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { FieldStore } from './store'
import { buildField, MAX_CLUSTERS } from './targets'
import { fragmentShader, vertexShader } from './shaders'

const BG = '#06070c'
const CAM_Z = 10
const FOV = 50
const INTRO_SECONDS = 2.0

export type FieldProps = {
  store: FieldStore
  /** Text sampled into the first target; a newline stacks it on two lines. */
  name: string
  /** Number of project rows, so each gets its own share of lattice nodes. */
  groups: number
  /** Number of disciplines, one constellation each. */
  clusters: number
  count: number
  /** Real type carries the name, so the first target is a globe. */
  sphere: boolean
  /** Reduced motion: one settled frame, no loop. */
  still: boolean
  bloom: boolean
  paused: boolean
  dprMax: number
  /** Dev only: frames are stepped by hand through window.__cstStep. */
  manual?: boolean
  onFail: () => void
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Field brightness per morph stop, so text always wins over the effect.
const DIM = [1, 0.95, 1, 0.72, 0.95]
function dimAt(m: number) {
  const c = Math.min(DIM.length - 1.0001, Math.max(0, m))
  const i = Math.floor(c)
  return lerp(DIM[i], DIM[i + 1], c - i)
}

function Particles({ store, name, groups, clusters, count, sphere, still, linear }: Omit<FieldProps, 'bloom' | 'paused' | 'dprMax' | 'onFail' | 'manual'> & { linear: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const built = useMemo(() => buildField(count, sphere, name, groups, clusters), [count, sphere, name, groups, clusters])
  const globe = built.usedSphere

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uMorph: { value: 0 },
          uPixelRatio: { value: 1 },
          uSize: { value: 2.6 },
          uDim: { value: 1 },
          uVel: { value: 0 },
          uScroll: { value: 0 },
          uSphere: { value: 0 },
          uNameWidth: { value: 10 },
          uNameOffset: { value: new THREE.Vector3() },
          uNameHalfH: { value: 0.05 },
          uNameLines: { value: 1 },
          uNameSplit: { value: 0 },
          uNameSize: { value: 0.82 },
          uGalaxyScale: { value: 1 },
          uGalaxyOffset: { value: new THREE.Vector3() },
          uClusterC: { value: Array.from({ length: MAX_CLUSTERS }, () => new THREE.Vector4(0, 0, 1, 0)) },
          uClusterActive: { value: -1 },
          uClusterActiveAmt: { value: 0 },
          uLatScaleX: { value: 1 },
          uLatRot: { value: 0 },
          uRingScale: { value: 1 },
          uRingOffset: { value: new THREE.Vector3() },
          uRayO: { value: new THREE.Vector3(0, 0, CAM_Z) },
          uRayD: { value: new THREE.Vector3(0, 0, -1) },
          uRayD2: { value: new THREE.Vector3(0, 0, -1) },
          uPointerAmt: { value: 0 },
          uActive: { value: -1 },
          uActiveAmt: { value: 0 },
          uWarm: { value: 0 },
          uPulseO: { value: new THREE.Vector3() },
          uPulseR: { value: 0 },
          uPulseAmt: { value: 0 },
          uLinear: { value: 0 },
        },
      }),
    [],
  )

  useEffect(() => () => built.geometry.dispose(), [built])
  useEffect(() => () => material.dispose(), [material])

  const sim = useRef({
    time: 0,
    introAt: -1,
    p1: new THREE.Vector2(),
    p2: new THREE.Vector2(),
    pointerAmt: 0,
    activeAmt: 0,
    clusterAmt: 0,
    clustersAt: -1,
    warm: 0,
    pulseId: 0,
    pulseAt: -100,
    introPulse: false,
    frames: 0,
    fpsClock: 0,
    ray: new THREE.Raycaster(),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    hit: new THREE.Vector3(),
  })

  useFrame((state, rawDelta) => {
    const s = sim.current
    const u = material.uniforms
    const delta = Math.min(rawDelta, 1 / 20)
    const k = (rate: number) => 1 - Math.exp(-delta * rate)

    // fps readout (real, averaged over half a second)
    s.frames += 1
    s.fpsClock += rawDelta
    if (s.fpsClock >= 0.5) {
      store.fps = Math.round(s.frames / s.fpsClock)
      s.frames = 0
      s.fpsClock = 0
    }

    // layout: fit each target to the visible frustum at z = 0
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
    const visW = visH * (state.size.width / Math.max(1, state.size.height))
    const wide = THREE.MathUtils.clamp(visW / 16.6, 0, 1.15)
    u.uPixelRatio.value = state.gl.getPixelRatio()
    u.uLinear.value = linear ? 1 : 0
    u.uSphere.value = globe ? 1 : 0
    if (globe) {
      u.uNameWidth.value = Math.min(visW, visH) * 0.52
      u.uNameOffset.value.set(0, visH * 0.17, -0.5)
      store.nameBottom = 0
    } else {
      const stacked = built.nameLines > 1
      const aspect = Math.max(0.05, built.nameAspect)
      // as wide as the gutters allow, unless the window is so wide the block would get too tall
      const nameW = Math.min(visW * (stacked ? 0.9 : 0.86), (visH * (stacked ? 0.54 : 0.34)) / aspect)
      const nameY = visH * (stacked ? 0.05 : 0.035)
      u.uNameWidth.value = nameW
      u.uNameOffset.value.set(0, nameY, 0)
      u.uNameHalfH.value = aspect / 2
      u.uNameLines.value = built.nameLines
      u.uNameSplit.value = built.nameSplit
      // large letterforms spread the same particles thinner, so each one grows a little
      u.uNameSize.value = stacked ? 1.12 : 0.82
      // tell the DOM where the block ends so the role line can sit under it
      store.nameBottom = (0.5 - (nameY - (nameW * aspect) / 2) / visH) * state.size.height
    }
    const portrait = visW < visH * 0.9
    if (portrait) {
      u.uGalaxyScale.value = THREE.MathUtils.clamp(visW / 9, 0.42, 0.8)
      // On a narrow screen the tagline sits under the galaxy and then scrolls up
      // through where it was, so past that point the galaxy rides up with the page.
      const lift = still ? 0 : Math.max(0, store.scroll - store.roleAt) * visH
      u.uGalaxyOffset.value.set(visW * 0.12, visH * 0.2 + lift, -1)
      u.uRingScale.value = THREE.MathUtils.clamp(visW / 9, 0.45, 0.8)
      u.uRingOffset.value.set(0, -visH * 0.2, 0)
    } else {
      u.uGalaxyScale.value = Math.max(0.6, wide)
      u.uGalaxyOffset.value.set(visW * 0.295, visH * 0.09, -1)
      u.uRingScale.value = Math.max(0.6, wide) * 0.82
      u.uRingOffset.value.set(0, -visH * 0.255, 0)
    }
    u.uLatScaleX.value = THREE.MathUtils.clamp(visW / 16.6, 0.36, 1.2)
    // fewer particles on mid-size windows, so each one carries a little more
    u.uSize.value = portrait ? 2.2 : 2.6 * THREE.MathUtils.clamp(Math.sqrt(72000 / count), 1, 1.4)

    if (still) {
      // one settled frame: the galaxy, calm and dim, nothing reacting
      u.uTime.value = 42
      u.uIntro.value = 1.6
      u.uMorph.value = 1
      u.uDim.value = 0.55
      u.uPointerAmt.value = 0
      u.uPulseAmt.value = 0
      u.uActiveAmt.value = 0
      camera.position.set(0, 0, CAM_Z)
      camera.lookAt(0, 0, 0)
      return
    }

    s.time += delta
    if (s.introAt < 0) s.introAt = s.time
    const introT = (s.time - s.introAt) / INTRO_SECONDS
    u.uTime.value = s.time
    u.uIntro.value = Math.min(introT, 1.6)
    u.uMorph.value = store.morph
    u.uDim.value = dimAt(store.morph) * (portrait ? 0.82 : 1)
    u.uVel.value = lerp(u.uVel.value, THREE.MathUtils.clamp(store.vel, -1, 1), k(7))
    u.uScroll.value = store.scroll * 1.1
    u.uLatRot.value = -0.28 + store.workProg * 0.56 + Math.sin(s.time * 0.09) * 0.07

    // pointer: two smoothed rays, a tight one and a slow wake behind it
    s.p1.x = lerp(s.p1.x, store.ndcX, k(9))
    s.p1.y = lerp(s.p1.y, store.ndcY, k(9))
    s.p2.x = lerp(s.p2.x, store.ndcX, k(2.6))
    s.p2.y = lerp(s.p2.y, store.ndcY, k(2.6))
    s.pointerAmt = lerp(s.pointerAmt, store.pointerOn * Math.min(1, Math.max(0, introT - 0.6)), k(4))
    u.uPointerAmt.value = s.pointerAmt

    // slight camera parallax, always looking at the centre
    camera.position.x = lerp(camera.position.x, s.p2.x * 0.42, k(3))
    camera.position.y = lerp(camera.position.y, s.p2.y * 0.26, k(3))
    camera.position.z = CAM_Z
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    s.ray.setFromCamera(s.p1, camera)
    u.uRayO.value.copy(s.ray.ray.origin)
    u.uRayD.value.copy(s.ray.ray.direction)
    s.ray.setFromCamera(s.p2, camera)
    u.uRayD2.value.copy(s.ray.ray.direction)

    // discipline clusters ride on their labels and light one after another
    if (store.clustersIn && s.clustersAt < 0) s.clustersAt = s.time
    const cu = u.uClusterC.value as THREE.Vector4[]
    const n = Math.min(MAX_CLUSTERS, store.clusters.length)
    for (let i = 0; i < MAX_CLUSTERS; i++) {
      const c = store.clusters[n ? i % n : 0]
      if (!c) {
        // not measured yet: a row across the middle, so nothing piles up at the origin
        cu[i].set(((i + 0.5) / clusters - 0.5) * visW * 0.8, 0, visH * 0.12, 0)
        continue
      }
      const lit = s.clustersAt < 0 ? 0 : THREE.MathUtils.smoothstep((s.time - s.clustersAt - 0.25 - i * 0.22) / 0.8, 0, 1)
      cu[i].set(c.x * visW, -c.y * visH, c.r * visH * 0.94, lit)
    }
    if (store.clusterActive >= 0) u.uClusterActive.value = store.clusterActive
    s.clusterAmt = lerp(s.clusterAmt, store.clusterActive >= 0 ? 1 : 0, k(store.clusterActive >= 0 ? 7 : 3))
    u.uClusterActiveAmt.value = s.clusterAmt

    // hovered project lights its node group
    if (store.active >= 0) u.uActive.value = store.active
    s.activeAmt = lerp(s.activeAmt, store.active >= 0 ? 1 : 0, k(store.active >= 0 ? 7 : 3))
    u.uActiveAmt.value = s.activeAmt
    s.warm = lerp(s.warm, store.warm, k(4))
    u.uWarm.value = s.warm

    // pulses: one sweep across the name when the intro lands, then on hover
    if (!s.introPulse && introT > 0.92) {
      s.introPulse = true
      s.pulseAt = s.time
      u.uPulseO.value.set(-visW * 0.62, 0, 0)
    }
    if (store.pulseId !== s.pulseId) {
      s.pulseId = store.pulseId
      s.pulseAt = s.time
      s.ray.setFromCamera(new THREE.Vector2(store.pulseX, store.pulseY), camera)
      if (s.ray.ray.intersectPlane(s.plane, s.hit)) u.uPulseO.value.copy(s.hit)
    }
    const age = s.time - s.pulseAt
    u.uPulseR.value = age * 9.5
    u.uPulseAmt.value = Math.max(0, 1 - age / 2.1)
  })

  return <points geometry={built.geometry} material={material} frustumCulled={false} />
}

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFail()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function ContextWatch({ onFail }: { onFail: () => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
      onFail()
    }
    el.addEventListener('webglcontextlost', lost)
    return () => el.removeEventListener('webglcontextlost', lost)
  }, [gl, onFail])
  return null
}

// Dev only. A hidden browser pane throttles rAF to a crawl, so this lets the
// page and the field be advanced a fixed number of frames for inspection.
function ManualStepper() {
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    const dev = window as unknown as { __cstStep?: (frames?: number, dt?: number) => number; __cstTick?: (now: number) => void }
    let t = 0
    dev.__cstStep = (frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) {
        t += dt
        dev.__cstTick?.(t * 1000)
        advance(t)
      }
      return t
    }
    return () => {
      delete dev.__cstStep
    }
  }, [advance])
  return null
}

export default function Field({ store, name, groups, clusters, count, sphere, still, bloom, paused, dprMax, manual, onFail }: FieldProps) {
  const useBloom = bloom && !still
  return (
    <Boundary onFail={onFail}>
      <Canvas
        className="cst-canvas"
        aria-hidden="true"
        flat
        dpr={[1, dprMax]}
        frameloop={still ? 'demand' : paused || manual ? 'never' : 'always'}
        camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 80 }}
        gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }}
        fallback={null}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <color attach="background" args={[BG]} />
        <ContextWatch onFail={onFail} />
        {manual && <ManualStepper />}
        <Particles store={store} name={name} groups={groups} clusters={clusters} count={count} sphere={sphere} still={still} linear={useBloom} />
        {useBloom && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.78} luminanceThreshold={0.18} luminanceSmoothing={0.35} radius={0.74} />
          </EffectComposer>
        )}
      </Canvas>
    </Boundary>
  )
}
