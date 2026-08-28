import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Standalone Three.js coin renderer — no React, no game logic. Mounts into
 * a container element and exposes a tiny imperative API (setTarget /
 * setSpinning / dispose) that Coin3D.tsx wraps in a React-friendly ref.
 *
 * The coin itself is a modeled asset (`gold-coin.glb`, served from
 * public/models/coin-flip) with baked heads/tails/rim textures, loaded
 * async on mount. Everything else — camera, lighting, the spin/land
 * animation loop — is unchanged from the original procedural-geometry
 * version this replaced.
 */

const MODEL_URL = '/models/coin-flip/gold-coin.glb';
// Matches the previous procedural coin's diameter (2 * its R = 0.82) so the
// model fills the same on-screen footprint under the same camera framing.
const TARGET_DIAMETER = 1.64;
// See the comment where this is applied, in the GLTF load callback below.
const COIN_YAW_CORRECTION = 4.4593179;

function disposeModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map?.dispose();
        material.metalnessMap?.dispose();
        material.roughnessMap?.dispose();
        material.normalMap?.dispose();
        material.aoMap?.dispose();
        material.emissiveMap?.dispose();
      }
      material.dispose();
    }
  });
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

const SPIN_SPEED = 430; // deg/sec, free-spin angular velocity

export interface CoinView {
  /** Tween the coin to an absolute Y-rotation (degrees). `instant` snaps with no tween. */
  setTarget: (deg: number, durationMs?: number, instant?: boolean) => void;
  /** Free continuous spin at SPIN_SPEED — used while the result isn't known yet. */
  setSpinning: (on: boolean) => void;
  dispose: () => void;
}

export function mountCoin(container: HTMLElement): CoinView {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2', { antialias: true, alpha: true, preserveDrawingBuffer: true }) ||
      canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as WebGLRenderingContext,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
  }
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0, 5.0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xfff2d0, 0x2a2010, 0.9));
  const key = new THREE.DirectionalLight(0xfff3d6, 2.4);
  key.position.set(2.2, 3, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x22c55e, 0.6);
  rim.position.set(-3, -1, 2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0);
  fill.position.set(-2.2, 1.6, 2.6);
  scene.add(fill);

  const outer = new THREE.Group();
  scene.add(outer);
  const coinGroup = new THREE.Group();
  outer.add(coinGroup);

  outer.rotation.x = 0.22;
  outer.rotation.z = -0.1;

  const state = {
    angle: 0,
    tween: null as { from: number; to: number; dur: number; start: number } | null,
    spinning: false,
    raf: 0,
    disposed: false,
  };

  let model: THREE.Object3D | null = null;
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      if (state.disposed) return;
      const root = gltf.scene;
      // The source asset's own root node carries an incidental ~15° rest
      // tilt from the authoring tool, with the heads/tails face normal
      // pointing mostly along local +X rather than +Z. This fixed yaw
      // (measured against this exact asset) re-points that normal at
      // world +Z, so coinGroup.rotation.y = 0 shows heads face-on and
      // +180° shows tails — matching what Coin3D.tsx's landOn() assumes.
      root.rotation.y = COIN_YAW_CORRECTION;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const diameter = Math.max(size.x, size.y);
      if (diameter > 0) root.scale.setScalar(TARGET_DIAMETER / diameter);
      // Re-measure post-scale so the center offset below is in the same
      // space as the final geometry — position is applied after
      // rotation/scale, so this exactly cancels any off-origin center.
      const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
      root.position.sub(center);
      coinGroup.add(root);
      model = root;
    },
    undefined,
    (err) => console.error('[coin3d] failed to load gold-coin.glb', err),
  );

  function resize(): void {
    const w = container.clientWidth || 220;
    const h = container.clientHeight || 220;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const t0 = performance.now();
  let lastNow = t0;
  function loop(): void {
    if (state.disposed) return;
    const now = performance.now();
    const frameDt = (now - lastNow) / 1000;
    lastNow = now;
    const dt = (now - t0) / 1000;

    if (state.tween) {
      const tw = state.tween;
      const t = Math.min(1, (now - tw.start) / Math.max(1, tw.dur));
      state.angle = tw.from + (tw.to - tw.from) * easeOutExpo(t);
      if (t >= 1) state.tween = null;
    } else if (state.spinning) {
      state.angle += SPIN_SPEED * frameDt;
    }

    coinGroup.rotation.y = (state.angle * Math.PI) / 180;
    outer.position.y = Math.sin(dt * 1.1) * 0.05;
    outer.rotation.x = 0.22 + Math.sin(dt * 0.7) * 0.025;
    renderer.render(scene, camera);
    state.raf = requestAnimationFrame(loop);
  }
  state.raf = requestAnimationFrame(loop);

  return {
    setTarget(deg, durationMs, instant) {
      if (instant) {
        state.tween = null;
        state.angle = deg;
        return;
      }
      if (deg === state.angle && !state.tween) return;
      state.tween = { from: state.angle, to: deg, dur: durationMs || 1200, start: performance.now() };
    },
    setSpinning(on) {
      state.spinning = !!on;
    },
    dispose() {
      state.disposed = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      ro.disconnect();
      if (model) disposeModel(model);
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    },
  };
}
