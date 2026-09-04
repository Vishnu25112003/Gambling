import * as THREE from 'three';
import type { SceneDisposer } from './siteScenes';

/**
 * The two hand-sign models from the Hand Cricket design bundle
 * (`hands-scene.js`), ported to the npm `three` package and to TypeScript.
 *
 * Geometry, materials, pose rig and animation are unchanged from the
 * prototype — same procedural hands, same six poses, same shake — with two
 * differences forced by dropping the design's iframe/`<three-d-stage>` host:
 * the camera is framed once and locked (the design also locks it, via
 * `frameFront()` disabling orbit), and pose updates arrive through
 * `setPose()` instead of `postMessage`.
 */

type Side = 1 | -1;

interface FingerRig {
  root: THREE.Object3D;
  joints: THREE.Object3D[];
  splay: number;
}

interface HandRig {
  hand: THREE.Object3D;
  fingers: FingerRig[];
  thumb: FingerRig;
  side: Side;
}

interface RotationTarget {
  o: THREE.Object3D;
  x?: number;
  y?: number;
  z?: number;
}

interface PositionTarget {
  o: THREE.Object3D;
  px: number;
  py: number;
  pz: number;
}

type PoseTarget = RotationTarget | PositionTarget;

function isPositionTarget(t: PoseTarget): t is PositionTarget {
  return 'px' in t;
}

function skin(name: string, color: number, sheen: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name,
    color,
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.6,
    sheen: 0.55,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(sheen),
    ior: 1.4,
  });
}

function materials() {
  return {
    skinL: skin('skin_left', 0xf3ddc0, 0xffb894),
    skinR: skin('skin_right', 0xf3ddc0, 0xffb894),
    tipL: skin('fingertip_left', 0xecc9a8, 0xffa98a),
    tipR: skin('fingertip_right', 0xecc9a8, 0xffa98a),
    nail: new THREE.MeshPhysicalMaterial({
      name: 'nail',
      color: 0xf3d3c2,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    }),
    cuffL: new THREE.MeshStandardMaterial({ name: 'sleeve_left', color: 0x2f6fd4, roughness: 0.9 }),
    cuffR: new THREE.MeshStandardMaterial({ name: 'sleeve_right', color: 0xd93b3f, roughness: 0.9 }),
    band: new THREE.MeshStandardMaterial({ name: 'wristband', color: 0xf6f2e8, roughness: 0.9 }),
  };
}

function roundedBox(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(d * 0.36, 0.009);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - bev * 2,
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev,
    bevelSegments: 6,
    curveSegments: 14,
  });
  g.translate(0, 0, -(d - bev * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function bone(r: number, L: number): THREE.CapsuleGeometry {
  const g = new THREE.CapsuleGeometry(r, Math.max(L - 2 * r, 0.002), 8, 26);
  g.translate(0, L / 2, 0);
  return g;
}

function buildFinger(
  prefix: string,
  lengths: number[],
  radius: number,
  skinMat: THREE.Material,
  tipMat: THREE.Material,
  nailMat: THREE.Material,
  withNail = true,
): { root: THREE.Object3D; joints: THREE.Object3D[] } {
  const joints: THREE.Object3D[] = [];
  const root = new THREE.Object3D();
  root.name = prefix + '_root';
  let parent: THREE.Object3D = root;
  for (let i = 0; i < lengths.length; i++) {
    const j = new THREE.Object3D();
    j.name = `${prefix}_j${i + 1}`;
    if (i > 0) j.position.y = lengths[i - 1] - radius * Math.pow(0.88, i) * 0.72;
    parent.add(j);
    const r = radius * Math.pow(0.88, i);
    const last = i === lengths.length - 1;
    const m = new THREE.Mesh(bone(r, lengths[i]), last ? tipMat : skinMat);
    m.name = `${prefix}_p${i + 1}`;
    j.add(m);
    const k = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 24, 18), skinMat);
    k.name = `${prefix}_k${i + 1}`;
    k.scale.set(1, 0.78, 1.02);
    j.add(k);
    if (last && withNail) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 24, 16), nailMat);
      n.name = `${prefix}_nail`;
      n.scale.set(1.05, 1.5, 0.34);
      n.position.set(0, lengths[i] * 0.6, -r * 0.8);
      n.rotation.x = 0.2;
      j.add(n);
    }
    joints.push(j);
    parent = j;
  }
  return { root, joints };
}

function buildHand(
  side: Side,
  tag: string,
  skinMat: THREE.Material,
  tipMat: THREE.Material,
  nailMat: THREE.Material,
  sleeve: THREE.Material,
  band: THREE.Material,
): HandRig {
  const s = side;
  const hand = new THREE.Object3D();
  hand.name = tag + '_hand';
  const PW = 0.084;
  const PH = 0.096;
  const PD = 0.03;
  const palm = new THREE.Mesh(roundedBox(PW, PH, PD, 0.018), skinMat);
  palm.name = tag + '_palm';
  palm.position.y = PH / 2;
  hand.add(palm);

  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.022, 26, 18), skinMat);
  thenar.name = tag + '_thenar';
  thenar.scale.set(0.98, 1.3, 0.62);
  thenar.position.set(s * 0.031, 0.026, 0.001);
  hand.add(thenar);

  const hypo = new THREE.Mesh(new THREE.SphereGeometry(0.017, 24, 16), skinMat);
  hypo.name = tag + '_hypothenar';
  hypo.scale.set(0.92, 1.72, 0.78);
  hypo.position.set(-s * 0.03, 0.036, 0.001);
  hand.add(hypo);

  const knuckles = new THREE.Mesh(roundedBox(PW * 0.98, 0.026, PD * 0.98, 0.012), skinMat);
  knuckles.name = tag + '_knuckles';
  knuckles.position.set(0, PH - 0.006, 0.001);
  hand.add(knuckles);

  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0285, 0.056, 34, 1), skinMat);
  wrist.name = tag + '_wrist';
  wrist.scale.z = 0.76;
  wrist.position.y = -0.024;
  hand.add(wrist);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0345, 0.056, 36, 1), sleeve);
  cuff.name = tag + '_cuff';
  cuff.scale.z = 0.8;
  cuff.position.y = -0.056;
  hand.add(cuff);

  const bandMesh = new THREE.Mesh(new THREE.TorusGeometry(0.0295, 0.005, 16, 48), band);
  bandMesh.name = tag + '_band';
  bandMesh.rotation.x = Math.PI / 2;
  bandMesh.scale.y = 0.8;
  bandMesh.position.y = -0.032;
  hand.add(bandMesh);

  const spec = [
    { n: 'index', L: [0.043, 0.027, 0.022], r: 0.0098, x: 0.029, y: 0.093, z: 0.001, splay: 0.1 },
    { n: 'middle', L: [0.047, 0.031, 0.024], r: 0.0102, x: 0.0098, y: 0.0972, z: 0.003, splay: 0.02 },
    { n: 'ring', L: [0.043, 0.029, 0.023], r: 0.0095, x: -0.0098, y: 0.0942, z: 0.002, splay: -0.055 },
    { n: 'pinky', L: [0.034, 0.022, 0.019], r: 0.008, x: -0.0295, y: 0.0862, z: -0.001, splay: -0.145 },
  ];
  const fingers: FingerRig[] = spec.map((f) => {
    const rig = buildFinger(`${tag}_${f.n}`, f.L, f.r, skinMat, tipMat, nailMat);
    rig.root.position.set(s * f.x, f.y, f.z);
    hand.add(rig.root);
    return { ...rig, splay: f.splay };
  });

  const thumbRig = buildFinger(`${tag}_thumb`, [0.04, 0.03], 0.0122, skinMat, tipMat, nailMat, true);
  thumbRig.root.position.set(s * 0.033, 0.028, 0.009);
  hand.add(thumbRig.root);
  const thumb: FingerRig = { ...thumbRig, splay: 0 };

  return { hand, fingers, thumb, side: s };
}

interface Pose {
  curls: [number, number, number, number];
  thumb: number;
  open: number;
}

const POSES: Record<number, Pose> = {
  0: { curls: [1, 1, 1, 1], thumb: 1, open: 0.0 },
  1: { curls: [0, 1, 1, 1], thumb: 1, open: 0.35 },
  2: { curls: [0, 0, 1, 1], thumb: 1, open: 0.55 },
  3: { curls: [0, 0, 0, 1], thumb: 1, open: 0.7 },
  4: { curls: [0, 0, 0, 0], thumb: 1, open: 0.85 },
  5: { curls: [0, 0, 0, 0], thumb: 0, open: 1.0 },
  6: { curls: [1, 1, 1, 1], thumb: 0, open: 0.0 },
};

function poseTargets(rig: HandRig, n: number): PoseTarget[] {
  const p = POSES[n] ?? POSES[0];
  const s = rig.side;
  const t: PoseTarget[] = [];
  rig.fingers.forEach((f, i) => {
    const c = p.curls[i];
    const bend = [c * 1.46 + 0.09, c * 1.8 + 0.14, c * 1.24 + 0.1];
    t.push({ o: f.joints[0], x: bend[0], z: -s * f.splay * p.open * (1 - c) });
    t.push({ o: f.joints[1], x: bend[1], z: 0 });
    t.push({ o: f.joints[2], x: bend[2], z: 0 });
  });
  // The thumb has one extended pose (thumb: 0) and one tucked pose (thumb: 1).
  // Six reuses five's extended thumb verbatim — only the four fingers fold.
  const tc = p.thumb;
  t.push({ o: rig.thumb.root, px: s * 0.033, py: 0.028, pz: 0.009 });
  t.push({ o: rig.thumb.joints[0], x: 0.2 + tc * 0.5, y: -s * tc * 0.85, z: -s * (0.98 - tc * 0.6) });
  t.push({ o: rig.thumb.joints[1], x: 0.1 + tc * 1.05, z: 0 });
  return t;
}

function disposeScene(scene: THREE.Scene) {
  const mats = new Set<THREE.Material>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const m = mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((mm) => mats.add(mm));
  });
  mats.forEach((m) => m.dispose());
  scene.clear();
}

export interface HandsDuelHandle {
  /** left/right: 0 (fist, idle) through 6. shaking: the pre-reveal wind-up. */
  setPose(left: number, right: number, shaking: boolean): void;
  dispose: SceneDisposer;
}

export function mountHandsDuel(canvas: HTMLCanvasElement): HandsDuelHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10);

  // Neutral studio lighting (hemisphere + key + fill) — no colour tint, so
  // the skin material's own sheen/clearcoat reads true, same as the design.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
  fill.position.set(-5, 3, -4);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const M = materials();
  const L = buildHand(1, 'left', M.skinL, M.tipL, M.nail, M.cuffL, M.band);
  const R = buildHand(-1, 'right', M.skinR, M.tipR, M.nail, M.cuffR, M.band);
  L.hand.position.set(-0.105, 0, 0);
  L.hand.rotation.set(-0.08, 0.16, 0.05);
  R.hand.position.set(0.105, 0, 0);
  R.hand.rotation.set(-0.08, -0.16, -0.05);
  const model = new THREE.Group();
  model.name = 'hand_cricket_hands';
  model.add(L.hand, R.hand);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(model);

  // Front-on view, locked — the sign has to read at a glance, same framing
  // math as the design's frameFront(), minus the orbit controls it disables.
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.18;
  camera.position.set(center.x, center.y + sphere.radius * 0.16, center.z + dist);
  camera.lookAt(center);
  ground.position.y = box.min.y;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const state = { left: 0, right: 0, shake: false };
  let targets: PoseTarget[] = [];

  function snap(t: PoseTarget) {
    if (isPositionTarget(t)) t.o.position.set(t.px, t.py, t.pz);
    else t.o.rotation.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  }

  function retarget() {
    targets = [...poseTargets(L, state.left), ...poseTargets(R, state.right)];
  }
  retarget();
  targets.forEach(snap);

  let stopped = false;
  let raf = 0;
  let last = performance.now();

  function tick(now: number) {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.2);
    last = now;
    const k = 1 - Math.exp(-dt * 16);
    for (const t of targets) {
      if (isPositionTarget(t)) {
        const q = t.o.position;
        q.x += (t.px - q.x) * k;
        q.y += (t.py - q.y) * k;
        q.z += (t.pz - q.z) * k;
        continue;
      }
      const r = t.o.rotation;
      r.x += ((t.x ?? 0) - r.x) * k;
      r.y += ((t.y ?? 0) - r.y) * k;
      r.z += ((t.z ?? 0) - r.z) * k;
    }
    if (state.shake) {
      const ph = (now / 1000) * 9;
      const amp = 0.055;
      L.hand.position.y = Math.abs(Math.sin(ph)) * amp;
      R.hand.position.y = Math.abs(Math.sin(ph + Math.PI * 0.06)) * amp;
      L.hand.rotation.z = 0.05 + Math.sin(ph) * 0.16;
      R.hand.rotation.z = -0.05 - Math.sin(ph) * 0.16;
    } else {
      L.hand.position.y += (0 - L.hand.position.y) * k;
      R.hand.position.y += (0 - R.hand.position.y) * k;
      L.hand.rotation.z += (0.05 - L.hand.rotation.z) * k;
      R.hand.rotation.z += (-0.05 - R.hand.rotation.z) * k;
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  return {
    setPose(left, right, shaking) {
      state.left = left;
      state.right = right;
      state.shake = shaking;
      retarget();
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      disposeScene(scene);
      renderer.dispose();
    },
  };
}
