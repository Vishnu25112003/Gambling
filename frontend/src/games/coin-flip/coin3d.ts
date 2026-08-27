import * as THREE from 'three';

/**
 * Standalone Three.js coin renderer — no React, no game logic. Mounts into
 * a container element and exposes a tiny imperative API (setTarget /
 * setSpinning / dispose) that Coin3D.tsx wraps in a React-friendly ref.
 *
 * Ported from the Claude Design prototype (`coin3d-view.js` in the
 * "Model 3D coin flip UI" design project) — the visuals and physics are
 * unchanged; only typing was added.
 */

function makeStripe(colorA: string, colorB: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const n = 96;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * (c.width / n), 0, c.width / n, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = rot + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function makeFaceTexture(letter: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  const grad = ctx.createRadialGradient(cx - 70, cy - 80, 30, cx, cy, 300);
  grad.addColorStop(0, '#fff8dc');
  grad.addColorStop(0.5, '#ffd35c');
  grad.addColorStop(1, '#c9962a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#a9791f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 224, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 196, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#b5842a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    drawStar(ctx, cx + Math.cos(a) * 210, cy + Math.sin(a) * 210, 10, a);
    ctx.fill();
  }

  ctx.save();
  ctx.font = '800 230px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(140,95,20,0.55)';
  ctx.fillText(letter, cx + 5, cy + 7);
  ctx.fillStyle = '#8a5f14';
  ctx.fillText(letter, cx, cy);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

  const R = 0.82;
  const T = 0.18;
  const geo = new THREE.CylinderGeometry(R, R, T, 72, 1, false);
  geo.rotateX(Math.PI / 2);
  const sideMap = makeStripe('#ffe9a8', '#a9791f');
  sideMap.repeat.set(40, 1);
  const sideMat = new THREE.MeshStandardMaterial({ map: sideMap, metalness: 0.7, roughness: 0.4, color: 0xffe9a8 });
  const headsTex = makeFaceTexture('H');
  const tailsTex = makeFaceTexture('T');
  const headsMat = new THREE.MeshStandardMaterial({ map: headsTex, metalness: 0.55, roughness: 0.32, color: 0xffffff });
  const tailsMat = new THREE.MeshStandardMaterial({ map: tailsTex, metalness: 0.55, roughness: 0.32, color: 0xffffff });
  const mesh = new THREE.Mesh(geo, [sideMat, headsMat, tailsMat]);
  mesh.name = 'coin';
  coinGroup.add(mesh);
  outer.rotation.x = 0.22;
  outer.rotation.z = -0.1;

  const state = {
    angle: 0,
    tween: null as { from: number; to: number; dur: number; start: number } | null,
    spinning: false,
    raf: 0,
    disposed: false,
  };

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
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    },
  };
}
