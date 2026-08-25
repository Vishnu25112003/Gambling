import * as THREE from 'three';

/**
 * The three scenes from the design bundle (`site-scenes.js`), ported to the
 * npm `three` package and to TypeScript.
 *
 * Geometry, materials, camera framing and animation are unchanged from the
 * prototype — this is the same scene, drawn the same way. What is new is
 * teardown: the prototype mounted once into a page that never unmounted, while
 * here a route change can remove the canvas at any time, so every mount
 * returns a disposer that stops the loop and releases the GPU resources.
 *
 * This module is imported dynamically (see SceneCanvas), so three.js lands in
 * its own chunk and never blocks first paint.
 */

/* ── shared palette ───────────────────────────────────────────── */

interface Materials {
  shell: THREE.MeshStandardMaterial;
  pip: THREE.MeshStandardMaterial;
  neon: THREE.MeshStandardMaterial;
  neonSoft: THREE.MeshStandardMaterial;
  coin: THREE.MeshStandardMaterial;
  coinRim: THREE.MeshStandardMaterial;
  card: THREE.MeshStandardMaterial;
  violet: THREE.MeshStandardMaterial;
  blue: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
}

const mats = (): Materials => ({
  shell: new THREE.MeshStandardMaterial({ name: 'dice_shell', color: 0x2a5c39, roughness: 0.34, metalness: 0.28, emissive: 0x0c2c16 }),
  pip: new THREE.MeshStandardMaterial({ name: 'dice_pip', color: 0x63d98c, roughness: 0.35, emissive: 0x2fce66, emissiveIntensity: 1.15 }),
  neon: new THREE.MeshStandardMaterial({ name: 'neon', color: 0x2fe07a, roughness: 0.4, emissive: 0x24c364, emissiveIntensity: 1.35 }),
  neonSoft: new THREE.MeshStandardMaterial({ name: 'neon_soft', color: 0x0d4f2a, roughness: 0.7, emissive: 0x0a4423, emissiveIntensity: 0.32 }),
  coin: new THREE.MeshStandardMaterial({ name: 'coin_body', color: 0x102b1c, roughness: 0.28, metalness: 0.4, emissive: 0x082014 }),
  coinRim: new THREE.MeshStandardMaterial({ name: 'coin_rim', color: 0x4bf08a, roughness: 0.25, metalness: 0.3, emissive: 0x2ad275, emissiveIntensity: 1.25 }),
  card: new THREE.MeshStandardMaterial({ name: 'wallet_card', color: 0x0b1a12, roughness: 0.35, metalness: 0.3, emissive: 0x061309 }),
  violet: new THREE.MeshStandardMaterial({ name: 'solana_violet', color: 0x9945ff, roughness: 0.3, emissive: 0x5c22b8, emissiveIntensity: 0.7 }),
  blue: new THREE.MeshStandardMaterial({ name: 'solana_blue', color: 0x5b7cf5, roughness: 0.3, emissive: 0x3550bd, emissiveIntensity: 0.7 }),
  teal: new THREE.MeshStandardMaterial({ name: 'solana_teal', color: 0x19e5b0, roughness: 0.3, emissive: 0x0fae87, emissiveIntensity: 0.8 }),
});

/* ── geometry helpers ─────────────────────────────────────────── */

function roundedBoxGeo(size: number, radius: number, seg = 4): THREE.ExtrudeGeometry {
  const side = size - radius * 2;
  const rc = radius;
  const w = side / 2 - rc;
  const h = side / 2 - rc;
  const s = new THREE.Shape();
  s.moveTo(-w - rc, -h);
  s.lineTo(-w - rc, h);
  s.quadraticCurveTo(-w - rc, h + rc, -w, h + rc);
  s.lineTo(w, h + rc);
  s.quadraticCurveTo(w + rc, h + rc, w + rc, h);
  s.lineTo(w + rc, -h);
  s.quadraticCurveTo(w + rc, -h - rc, w, -h - rc);
  s.lineTo(-w, -h - rc);
  s.quadraticCurveTo(-w - rc, -h - rc, -w - rc, -h);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: side,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelSegments: seg,
    curveSegments: 12,
  });
  g.translate(0, 0, -side / 2);
  g.computeVertexNormals();
  return g;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, 1], [1, -1]],
  3: [[-1, 1], [0, 0], [1, -1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

interface Face {
  n: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  c: number;
}

const FACES: Face[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], c: 1 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], c: 6 },
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], c: 3 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], c: 4 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], c: 2 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], c: 5 },
];

function buildDie(size: number, M: Materials, name: string): THREE.Group {
  const die = new THREE.Group();
  die.name = name;
  const body = new THREE.Mesh(roundedBoxGeo(size, size * 0.16), M.shell);
  body.name = `${name}_shell`;
  die.add(body);

  const half = size / 2;
  const pipGeo = new THREE.SphereGeometry(size * 0.075, 16, 12);
  const spread = size * 0.26;

  FACES.forEach((f) => {
    const n = new THREE.Vector3(...f.n);
    const u = new THREE.Vector3(...f.u);
    const v = new THREE.Vector3(...f.v);
    PIPS[f.c].forEach(([a, b], i) => {
      const pip = new THREE.Mesh(pipGeo, M.pip);
      pip.name = `${name}_pip_${f.c}_${i + 1}`;
      pip.position
        .copy(n)
        .multiplyScalar(half * 0.945)
        .add(u.clone().multiplyScalar(a * spread))
        .add(v.clone().multiplyScalar(b * spread));
      die.add(pip);
    });
  });
  return die;
}

function solanaBar(width: number, skew: number, thickness: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const h = 0.115;
  const w = width / 2;
  s.moveTo(-w + skew, -h);
  s.lineTo(w + skew, -h);
  s.lineTo(w - skew, h);
  s.lineTo(-w - skew, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g;
}

function solanaMark(M: Materials, scale = 1, thickness = 0.05): THREE.Group {
  const mark = new THREE.Group();
  mark.name = 'solana_mark';
  const barMats = [M.violet, M.blue, M.teal];
  [0.34, 0, -0.34].forEach((y, i) => {
    const bar = new THREE.Mesh(
      solanaBar(1.25, i === 1 ? -0.09 : i === 0 ? 0.09 : -0.09, thickness),
      barMats[i],
    );
    bar.name = `solana_bar_${i + 1}`;
    bar.position.y = y;
    mark.add(bar);
  });
  mark.scale.setScalar(scale);
  return mark;
}

function buildCoin(M: Materials): THREE.Group {
  const coin = new THREE.Group();
  coin.name = 'solana_coin';

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.24, 64), M.coin);
  disc.name = 'coin_disc';
  disc.rotation.x = Math.PI / 2;
  coin.add(disc);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.51, 0.09, 18, 88), M.coinRim);
  rim.name = 'coin_rim';
  coin.add(rim);

  [1.18, 0.9].forEach((r, i) => {
    [0.13, -0.13].forEach((z, j) => {
      const g = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.017, 10, 72),
        i === 0 ? M.neon : M.neonSoft,
      );
      g.name = `coin_groove_${i + 1}_${j}`;
      g.position.z = z;
      coin.add(g);
    });
  });

  [0.15, -0.15].forEach((z, i) => {
    const mark = solanaMark(M, 0.82, 0.05);
    mark.name = `coin_mark_${i}`;
    mark.position.z = z;
    coin.add(mark);
  });
  return coin;
}

function buildWalletCard(M: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wallet_card';

  const body = new THREE.Mesh(roundedBoxGeo(2.6, 0.22), M.card);
  body.scale.set(1.25, 0.86, 0.05);
  body.name = 'wallet_card_body';
  g.add(body);

  // neon rim: the same silhouette, slightly larger, sitting just behind the face
  const rim = new THREE.Mesh(roundedBoxGeo(2.6, 0.22), M.neon);
  rim.name = 'wallet_card_rim';
  rim.scale.set(1.29, 0.91, 0.035);
  rim.position.z = -0.02;
  g.add(rim);

  const mark = solanaMark(M, 0.72, 0.07);
  mark.position.z = 0.12;
  g.add(mark);

  // a ghost card behind, like the stacked cards in the artwork
  const ghost = new THREE.Mesh(roundedBoxGeo(2.6, 0.22), M.card);
  ghost.scale.set(1.18, 0.8, 0.04);
  ghost.position.set(0.28, 0.34, -0.35);
  ghost.rotation.z = -0.12;
  ghost.name = 'wallet_card_ghost';
  g.add(ghost);
  return g;
}

function ringSet(M: Materials, radii: number[], y = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ripples';
  radii.forEach((r, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.02 - i * 0.003, 8, 80),
      i < 2 ? M.neon : M.neonSoft,
    );
    ring.name = `ripple_${i + 1}`;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y + i * 0.002;
    g.add(ring);
  });
  return g;
}

function gridFloor(M: Materials, w: number, d: number, step: number, y: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'grid_floor';
  for (let x = -w / 2; x <= w / 2 + 0.001; x += step) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, d), M.neonSoft);
    l.position.set(x, y, 0);
    g.add(l);
  }
  for (let z = -d / 2; z <= d / 2 + 0.001; z += step) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, 0.02), M.neonSoft);
    l.position.set(0, y, z);
    g.add(l);
  }
  return g;
}

function motes(M: Materials, count: number, spread: [number, number, number]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'motes';
  const geo = new THREE.IcosahedronGeometry(0.045, 0);
  // A fixed seed keeps the dust in the same places on every load, so the scene
  // is deterministic and matches the design's framing exactly.
  let seed = 8675309;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, M.pip);
    m.name = `mote_${i + 1}`;
    m.position.set(
      (rnd() - 0.5) * spread[0],
      (rnd() - 0.5) * spread[1],
      (rnd() - 0.5) * spread[2],
    );
    m.scale.setScalar(0.5 + rnd());
    g.add(m);
  }
  return g;
}

/* ── renderer plumbing ────────────────────────────────────────── */

type Vec3 = [number, number, number];
type Fit = [number, number] | [number, number, number];

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
  halfW: number;
  halfH: number;
  onLayout: ((halfW: number, halfH: number) => void) | null;
  destroy: () => void;
}

function makeStage(canvas: HTMLCanvasElement, camPos: Vec3, camTarget: Vec3, fit?: Fit): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(...camPos);
  camera.lookAt(...camTarget);

  scene.add(new THREE.HemisphereLight(0xbfffd8, 0x04120a, 0.55));
  const key = new THREE.DirectionalLight(0xd8ffe8, 1.5);
  key.position.set(4, 7, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x2fe07a, 0.9);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  const fill = new THREE.PointLight(0x22c55e, 14, 30);
  fill.position.set(0, 1.5, 4);
  scene.add(fill);

  const target = new THREE.Vector3(...camTarget);
  const dir = new THREE.Vector3(...camPos).sub(target).normalize();

  function resize() {
    const r = canvas.getBoundingClientRect();
    // hard clamp: a canvas can never grow the layout that sizes it
    const w = Math.min(Math.max(1, Math.round(r.width)), 2400);
    const h = Math.min(Math.max(1, Math.round(r.height)), 1400);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (fit) {
      // "cover" framing: the scene always fills the canvas, cropping the long axis
      const vHalf = Math.tan((camera.fov * Math.PI) / 360);
      const hHalf = vHalf * camera.aspect;
      const narrowW = fit[2] ?? fit[0];
      const fitW = Math.max(narrowW, Math.min(fit[0], fit[1] * camera.aspect));
      const dist = Math.max(fitW / 2 / hHalf, fit[1] / 2 / vHalf);
      camera.position.copy(target).add(dir.clone().multiplyScalar(dist));
    }
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    const d = camera.position.distanceTo(target);
    api.halfH = Math.tan((camera.fov * Math.PI) / 360) * d;
    api.halfW = api.halfH * camera.aspect;
    api.onLayout?.(api.halfW, api.halfH);
  }

  const api: Stage = {
    renderer,
    scene,
    camera,
    resize,
    halfW: 1,
    halfH: 1,
    onLayout: null,
    destroy: () => {
      observer.disconnect();
      disposeScene(scene);
      // dispose() releases every GPU-side resource this renderer holds —
      // programs, buffers, textures, render targets — which is the actual
      // memory this teardown exists to free. It deliberately stops short of
      // renderer.forceContextLoss(): that call doesn't just release memory,
      // it fires a real `webglcontextlost` event, which browsers report to
      // the console as a hard "WebGL context was lost" notice — on every
      // single ordinary navigation past this page, since this destroy() runs
      // on every unmount. At most two of these scenes are ever alive at once
      // (Landing's hero + strip), nowhere near a browser's live-context cap,
      // so there was nothing here forceContextLoss was actually protecting
      // against — only a scary, misleading message it was guaranteed to
      // produce. The underlying WebGLRenderingContext is still reclaimed
      // normally once the canvas element and this renderer are garbage
      // collected after React removes them from the DOM.
      renderer.dispose();
    },
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  return api;
}

function disposeScene(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const m = mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((mm) => materials.add(mm));
  });
  materials.forEach((m) => m.dispose());
  scene.clear();
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Drives the render loop. Returns a stop function.
 *
 * The visibility check from the prototype is kept — an offscreen canvas stops
 * rendering entirely, which is what keeps three simultaneous scenes cheap.
 */
function loop(stage: Stage, canvas: HTMLCanvasElement, tick: (t: number, dt: number) => void) {
  let t = 0;
  let last = performance.now();
  let n = 0;
  let onscreen = true;
  let raf = 0;
  let stopped = false;

  // Reduced motion: compose the scene once at t=0 and leave it there.
  if (prefersReducedMotion()) {
    tick(0, 0);
    stage.renderer.render(stage.scene, stage.camera);
    const onResize = () => {
      tick(0, 0);
      stage.renderer.render(stage.scene, stage.camera);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }

  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if ((n++ & 7) === 0) {
      const r = canvas.getBoundingClientRect();
      onscreen =
        canvas.offsetParent !== null &&
        r.width > 0 &&
        r.bottom > -200 &&
        r.top < window.innerHeight + 200;
      if (
        onscreen &&
        Math.abs(
          canvas.width -
            Math.round(Math.min(r.width, 2400)) * Math.min(window.devicePixelRatio, 1.5),
        ) > 2
      ) {
        stage.resize();
      }
    }
    if (!onscreen) return;

    t += dt;
    tick(t, dt);
    stage.renderer.render(stage.scene, stage.camera);
  }
  frame();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/** Every mount returns this: call it on unmount. */
export type SceneDisposer = () => void;

function finish(stage: Stage, stop: SceneDisposer): SceneDisposer {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    stop();
    stage.destroy();
  };
}

/* ── HERO scene (landing) ─────────────────────────────────────── */

export function mountHero(canvas: HTMLCanvasElement): SceneDisposer {
  const M = mats();
  const stage = makeStage(canvas, [0, 2.4, 13.5], [0, 1.6, 0], [30, 12.5, 13]);
  const root = new THREE.Group();
  stage.scene.add(root);

  const floor = gridFloor(M, 34, 26, 2.2, -5.4);
  floor.position.z = -4;
  root.add(floor);

  const ripples = ringSet(M, [1.7, 2.5, 3.4, 4.3], -5.35);
  ripples.position.set(-5.6, 0, 0.5);
  root.add(ripples);

  const heroDie = buildDie(2.15, M, 'hero_die');
  heroDie.position.set(-5.6, 2.1, 0.5);
  let flankX = 5.6;
  let heroYBase = 2.1;
  let coinYBase = 2.2;
  heroDie.rotation.set(0.5, -0.6, 0.3);
  root.add(heroDie);

  const coin = buildCoin(M);
  coin.position.set(5.8, 2.2, 0.2);
  coin.rotation.set(-0.1, -0.35, 0.12);
  root.add(coin);

  // mixed confetti: alternating mini dice and mini Solana coins
  interface Mini {
    d: THREE.Group;
    ph: number;
    sp: number;
    spin: boolean;
    bx: number;
    by: number;
    bs: number;
  }
  const minis: Mini[] = [];
  let nDie = 0;
  let nCoin = 0;
  (
    [
      [-7.6, 3.6, -1.5, 0.62, 'die'],
      [-8.4, -0.6, 0.6, 0.5, 'coin'],
      [-4.4, -1.5, 1.8, 0.72, 'die'],
      [-2.2, 3.9, -2.6, 0.42, 'coin'],
      [7.8, 3.4, -2.0, 0.5, 'die'],
      [8.4, -0.9, -0.5, 0.58, 'coin'],
      [3.4, -1.8, 1.4, 0.4, 'die'],
      [1.6, 4.3, -3.2, 0.36, 'coin'],
    ] as [number, number, number, number, 'die' | 'coin'][]
  ).forEach(([x, y, z, sc, kind], i) => {
    let d: THREE.Group;
    if (kind === 'coin') {
      d = buildCoin(M);
      d.name = `mini_coin_${++nCoin}`;
      d.scale.setScalar(sc * 0.62);
    } else {
      d = buildDie(sc, M, `mini_die_${++nDie}`);
    }
    d.position.set(x, y, z);
    d.rotation.set(i * 0.7, i * 1.1, i * 0.4);
    root.add(d);
    minis.push({ d, ph: i * 1.3, sp: 0.25 + i * 0.05, spin: kind === 'coin', bx: x, by: y, bs: d.scale.x });
  });

  const dust = motes(M, 40, [26, 12, 12]);
  root.add(dust);

  // the die and coin always sit at ~66% of the visible half-width, so they
  // flank the centred headline at every viewport instead of drifting onto it
  stage.onLayout = (halfW, halfH) => {
    const narrow = halfW / halfH < 0.95;
    const sc = Math.max(0.72, Math.min(halfH / 5.2, 1.2));
    if (narrow) {
      // phones: the copy owns the middle band, so the two hero objects sit in
      // opposite corners at full size instead of being squeezed to the edges
      flankX = halfW * 0.46;
      heroDie.position.set(-flankX, halfH * 0.6, 0.5);
      ripples.position.set(-flankX, halfH * 0.6 - 3.4, 0.5);
      coin.position.set(flankX * 0.86, -halfH * 0.56, 0.2);
      heroDie.scale.setScalar(sc * 1.06);
      coin.scale.setScalar(0.78 * sc * 1.06);
      heroYBase = halfH * 0.6;
      coinYBase = -halfH * 0.56;
    } else {
      flankX = Math.max(4.2, Math.min(halfW * 0.66, 11));
      heroDie.position.set(-flankX, 2.1, 0.5);
      ripples.position.set(-flankX, 0, 0.5);
      coin.position.set(flankX, 2.2, 0.2);
      heroDie.scale.setScalar(sc);
      coin.scale.setScalar(0.78 * sc);
      heroYBase = 2.1;
      coinYBase = 2.2;
    }
    // mini objects follow the frame so none of them drift off-canvas
    const kx = Math.max(0.42, Math.min(halfW / 12, 1));
    const ky = Math.max(0.6, Math.min(halfH / 5.6, 1));
    minis.forEach((m) => {
      m.d.position.x = m.bx * kx;
      m.d.position.y = m.by * ky;
      m.d.scale.setScalar(m.bs * (narrow ? 1.5 : 1));
    });
    dust.scale.set(Math.max(1, halfW / 12), 1, 1);
  };
  stage.onLayout(stage.halfW, stage.halfH);

  const stop = loop(stage, canvas, (t) => {
    heroDie.rotation.y = -0.6 + Math.sin(t * 0.22) * 0.5;
    heroDie.rotation.x = 0.5 + Math.sin(t * 0.17) * 0.18;
    heroDie.position.y = heroYBase + Math.sin(t * 0.7) * 0.28;
    coin.rotation.y = -0.35 + t * 0.32;
    coin.position.y = coinYBase + Math.sin(t * 0.6 + 1.2) * 0.3;
    ripples.children.forEach((r, i) => {
      const p = (t * 0.25 + i * 0.25) % 1;
      r.scale.setScalar(0.7 + p * 0.9);
      (r as THREE.Mesh).material = i < 2 ? M.neon : M.neonSoft;
    });
    minis.forEach(({ d, ph, sp, spin }) => {
      if (spin) {
        d.rotation.y += sp * 0.026; // coins spin on their own axis
        d.rotation.x = 0.35 + Math.sin(t * 0.5 + ph) * 0.22;
      } else {
        d.rotation.x += sp * 0.006 * 60 * 0.016;
        d.rotation.y += sp * 0.009 * 60 * 0.016;
      }
      d.position.y += Math.sin(t * 0.9 + ph) * 0.0035;
    });
    dust.rotation.y = t * 0.02;
  });

  return finish(stage, stop);
}

/* ── CARD scene (dashboard welcome panel) ─────────────────────── */

export function mountCard(canvas: HTMLCanvasElement): SceneDisposer {
  const M = mats();
  const stage = makeStage(canvas, [0, 1.3, 9.2], [0, 0.45, 0], [10.5, 6.4]);
  const root = new THREE.Group();
  stage.scene.add(root);

  const card = buildWalletCard(M);
  card.position.set(0, 0.55, 0);
  card.rotation.set(0.08, -0.28, 0.03);
  root.add(card);

  const ripples = ringSet(M, [1.15, 1.55, 1.95], -1.75);
  ripples.rotation.x = 0.0;
  root.add(ripples);

  const coin = buildCoin(M);
  coin.scale.setScalar(0.26);
  coin.position.set(1.75, 0.95, 1.3);
  root.add(coin);

  const minis: { d: THREE.Group; ph: number }[] = [];
  (
    [
      [-2.15, 1.3, 0.8, 0.5],
      [-1.9, -0.45, 1.2, 0.42],
      [-2.5, 0.35, -0.6, 0.34],
      [2.15, -0.5, 0.9, 0.46],
      [1.75, 0.95, -0.8, 0.34],
      [-1.2, 2.0, -0.4, 0.3],
      [1.25, 2.2, 0.4, 0.28],
    ] as [number, number, number, number][]
  ).forEach(([x, y, z, s], i) => {
    const d = buildDie(s, M, `card_die_${i + 1}`);
    d.position.set(x, y, z);
    d.rotation.set(i * 0.6, i * 0.9, i * 0.3);
    root.add(d);
    minis.push({ d, ph: i * 1.1 });
  });

  root.add(motes(M, 18, [9, 5, 5]));

  const stop = loop(stage, canvas, (t) => {
    card.rotation.y = -0.28 + Math.sin(t * 0.4) * 0.16;
    card.position.y = 0.55 + Math.sin(t * 0.8) * 0.09;
    coin.rotation.y = t * 0.5;
    coin.position.y = 0.95 + Math.sin(t * 0.9) * 0.12;
    ripples.children.forEach((r, i) => {
      const p = (t * 0.3 + i * 0.33) % 1;
      r.scale.setScalar(0.75 + p * 0.7);
    });
    minis.forEach(({ d, ph }) => {
      d.rotation.x += 0.004;
      d.rotation.y += 0.006;
      d.position.y += Math.sin(t * 1.1 + ph) * 0.003;
    });
  });

  return finish(stage, stop);
}

/* ── table props (chips + cards) ──────────────────────────────── */

function chipStack(M: Materials, count: number, r = 0.62, name = 'chip_stack'): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  const th = 0.13;
  for (let i = 0; i < count; i++) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 40), M.coin);
    body.name = `${name}_chip_${i + 1}`;
    body.position.y = i * (th + 0.012);
    body.rotation.y = i * 0.5;
    g.add(body);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.99, 0.022, 6, 44),
      i % 2 ? M.neon : M.neonSoft,
    );
    edge.name = `${name}_edge_${i + 1}`;
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = body.position.y;
    g.add(edge);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(r * 0.52, 0.02, 6, 36), M.neon);
  top.rotation.x = -Math.PI / 2;
  top.position.y = (count - 1) * (th + 0.012) + th / 2 + 0.005;
  top.name = `${name}_face`;
  g.add(top);
  return g;
}

function playingCard(M: Materials, name: string, pipCount = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  const body = new THREE.Mesh(roundedBoxGeo(2.2, 0.16), M.card);
  body.scale.set(0.72, 1.05, 0.022);
  body.name = `${name}_body`;
  g.add(body);
  const rim = new THREE.Mesh(roundedBoxGeo(2.2, 0.16), M.neonSoft);
  rim.scale.set(0.76, 1.09, 0.016);
  rim.position.z = -0.015;
  rim.name = `${name}_rim`;
  g.add(rim);
  const pipGeo = new THREE.SphereGeometry(0.085, 16, 12);
  const spots: [number, number][] = pipCount === 1 ? [[0, 0]] : [[0, 0.5], [0, 0], [0, -0.5]];
  spots.forEach(([x, y], i) => {
    const p = new THREE.Mesh(pipGeo, M.pip);
    p.position.set(x, y, 0.04);
    p.name = `${name}_pip_${i + 1}`;
    g.add(p);
  });
  return g;
}

/* ── STRIP scene (below the cards section) ────────────────────── */

export function mountStrip(canvas: HTMLCanvasElement): SceneDisposer {
  const M = mats();
  const stage = makeStage(canvas, [0, 2.1, 11], [0, 0.35, 0], [26, 7.4, 12]);
  const root = new THREE.Group();
  stage.scene.add(root);

  const floor = gridFloor(M, 40, 20, 2.2, -1.5);
  floor.position.z = -3;
  root.add(floor);

  const stacks = [
    chipStack(M, 5, 0.62, 'chips_a'),
    chipStack(M, 3, 0.56, 'chips_b'),
    chipStack(M, 4, 0.5, 'chips_c'),
  ];
  stacks.forEach((st) => {
    st.position.y = -1.45;
    root.add(st);
  });

  const cards = [playingCard(M, 'table_card_1', 1), playingCard(M, 'table_card_2', 3)];
  cards.forEach((c) => root.add(c));

  const die = buildDie(1.05, M, 'strip_die');
  die.position.y = -0.7;
  root.add(die);

  const coin = buildCoin(M);
  coin.scale.setScalar(0.4);
  root.add(coin);

  const ripples = ringSet(M, [1.5, 2.2, 3.0], -1.48);
  root.add(ripples);
  const dust = motes(M, 26, [24, 6, 8]);
  root.add(dust);

  stage.onLayout = (halfW, halfH) => {
    const narrow = halfW / halfH < 1.15;
    const u = Math.max(3.2, Math.min(halfW * 0.72, 11));
    stacks[0].position.x = -u;
    stacks[1].position.x = -u * 0.62;
    stacks[2].position.x = u * 0.9;
    cards[0].position.set(-u * 0.28, -0.55, 0.4);
    cards[1].position.set(u * 0.38, -0.5, 0.2);
    cards[0].rotation.set(-0.22, 0.3, 0.16);
    cards[1].rotation.set(-0.2, -0.34, -0.2);
    die.position.x = narrow ? -u * 0.7 : u * 0.34;
    coin.position.set(narrow ? u * 0.7 : -u * 0.86, 0.55, 0.6);
    ripples.position.x = u * 0.9;
    const sc = Math.max(0.8, Math.min(halfH / 3.4, 1.35)) * (narrow ? 1.25 : 1);
    [...stacks, die].forEach((o) => o.scale.setScalar(sc));
    cards.forEach((c) => c.scale.setScalar(sc));
    coin.scale.setScalar(0.4 * sc);
    dust.scale.set(Math.max(1, halfW / 11), 1, 1);
  };
  stage.onLayout(stage.halfW, stage.halfH);

  const stop = loop(stage, canvas, (t) => {
    die.rotation.y = t * 0.24;
    die.rotation.x = 0.4 + Math.sin(t * 0.5) * 0.16;
    die.position.y = -0.7 + Math.sin(t * 0.8) * 0.12;
    coin.rotation.y = t * 0.4;
    coin.position.y = 0.55 + Math.sin(t * 0.7) * 0.16;
    cards.forEach((c, i) => {
      c.position.y = -0.55 + Math.sin(t * 0.6 + i * 1.4) * 0.09;
      c.rotation.z = (i ? -0.2 : 0.16) + Math.sin(t * 0.45 + i) * 0.05;
    });
    ripples.children.forEach((r, i) => {
      const p = (t * 0.22 + i * 0.3) % 1;
      r.scale.setScalar(0.7 + p * 0.9);
    });
    dust.rotation.y = t * 0.015;
  });

  return finish(stage, stop);
}

export const SCENES = {
  hero: mountHero,
  card: mountCard,
  strip: mountStrip,
} as const;

export type SceneName = keyof typeof SCENES;
