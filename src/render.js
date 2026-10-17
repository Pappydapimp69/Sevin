// render.js — the woods in three.js. Reads sim and percept; writes neither.
// World (x, y) metres -> three (x, height, -y). Yaw 0 faces north (-z).

import * as THREE from "../lib/three.module.js";
import { phantomSticks, phantomWatchers, seesPylonLit, shownFire, mindLevel, kinAtTheEdge } from "./percept.js";
import { TENTS, daylight, hourOf, homeCount, PYLON_HOURS, PITCH_HOURS, STRIKE_HOURS, party, isNight } from "./sim.js";
import { CELL } from "./world.js";
import { createIllusions } from "./illusions.js";
import { createGroveView } from "./grove-view.js";
import { personOut } from "./grove.js";

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const SLOT_COLOURS = [0xc8553d, 0x2e86ab, 0xf6ae2d, 0x86bbd8, 0x8f6593, 0x5c946e, 0xd4a373, 0x9b9b9b];
const WEATHER_LOOK = {
  clear: { sky: 0x9cc3de, fog: 70, ground: 0x34502c, light: 1.0 },
  drizzle: { sky: 0x7d8a96, fog: 45, ground: 0x2c4628, light: 0.7 },
  fog: { sky: 0xb8bcc0, fog: 22, ground: 0x34502c, light: 0.8 },
  wind: { sky: 0x8fb1c9, fog: 60, ground: 0x3a5530, light: 0.95 },
  cold: { sky: 0xc9d6e0, fog: 55, ground: 0x7b8a80, light: 0.9 },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
  camera.rotation.order = "YXZ";
  let scene = null, built = null, calmPref = false;

  // The setting is the field of view on a landscape screen. Held upright, a
  // phone would see a sliver of the world at the same vertical angle, so the
  // vertical angle opens until the sideways view is at least 70 degrees.
  let fovPref = 72, baseFov = 72, fovAdd = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const minH = (70 * Math.PI) / 180;
    const needV = (2 * Math.atan(Math.tan(minH / 2) / camera.aspect) * 180) / Math.PI;
    baseFov = Math.min(110, Math.max(fovPref, needV));
    camera.fov = baseFov + fovAdd;
    camera.updateProjectionMatrix();
  }
  function setFov(f) { fovPref = f; resize(); }
  window.addEventListener("resize", resize);
  resize();

  function build(sim) {
    const world = sim.world;
    scene = new THREE.Scene();
    const B = { world, members: new Map(), missing: new Map(), picks: [] };
    built = B;
    // an invisible, generous hit volume, so a small thing is easy to tap
    function pickable(x, h, y, r, pick, owner, height = 0) {
      const m = new THREE.Mesh(height ? new THREE.CylinderGeometry(r, r, height, 8) : new THREE.SphereGeometry(r, 8, 6), HIDDEN);
      m.position.set(x, h, -y); m.userData.pick = pick; m.userData.owner = owner;
      scene.add(m); B.picks.push(m);
    }

    scene.fog = new THREE.Fog(0x9cc3de, 10, 70);
    B.hemi = new THREE.HemisphereLight(0xdfe9f3, 0x2a3320, 1.0);
    scene.add(B.hemi);
    // the sun walks east to west and throws shadows near you; the shadow box follows you
    B.sun = new THREE.DirectionalLight(0xfff2dd, 0.8);
    B.sun.position.set(40, 80, 20);
    B.sun.castShadow = true;
    B.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(B.sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
    B.sun.shadow.bias = -0.0006; B.sun.shadow.normalBias = 0.04;
    scene.add(B.sun, B.sun.target);
    B.sky = skyDome();
    scene.add(B.sky);

    // ground, with the walkable ground painted in as a texture: the cells (trail,
    // walkable, thicket) exactly as before, with the dirt and moss of a floor in them
    const { w, h } = world;
    const R = 4;                                  // texels per cell
    const cellCol = (cx, cy) => {
      cx = Math.max(0, Math.min(w - 1, cx)); cy = Math.max(0, Math.min(h - 1, cy));
      const o = world.walk[cy * w + cx];
      const trail = (Math.abs(cx - world.trailX[cy]) <= 1.5 || world.decoyCells.has(cy * w + cx)) && o;
      return trail ? [112, 90, 62] : o ? [78, 98, 52] : [34, 52, 30];
    };
    const data = new Uint8Array(w * R * h * R * 4);
    for (let py = 0; py < h * R; py++)
      for (let px = 0; px < w * R; px++) {
        // blend the four nearest cells, so edges are soft but stay where they were
        const fx = px / R - 0.5, fy = py / R - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const a = cellCol(x0, y0), b = cellCol(x0 + 1, y0), c = cellCol(x0, y0 + 1), d = cellCol(x0 + 1, y0 + 1);
        const n = (hash2(px, py) - 0.5) * 18 + (vnoise(px / 9, py / 9) - 0.5) * 26;
        const warm = (vnoise(px / 23 + 40, py / 23) - 0.5) * 16;
        const i = (py * w * R + px) * 4;
        for (let k = 0; k < 3; k++) {
          const v = (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + d[k] * tx) * ty;
          data[i + k] = Math.max(0, Math.min(255, v + n + (k === 0 ? warm : k === 2 ? -warm : 0)));
        }
        data[i + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, w * R, h * R);
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    B.groundMat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w * CELL, h * CELL), B.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((w * CELL) / 2, 0, -(h * CELL) / 2);
    // the texture's v runs bottom-up, which is y north: plane +y maps to -z
    ground.receiveShadow = true;
    scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x22341e }));
    outer.receiveShadow = true;
    outer.rotation.x = -Math.PI / 2; outer.position.set((w * CELL) / 2, -0.05, -(h * CELL) / 2);
    scene.add(outer);

    // trees: a tapered trunk and a crown of stacked tiers, each tree its own shade.
    // The crown's centre sits where the old single cone's did (illusions.js moves it).
    const n = world.trees.length;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.3, 3, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const crownGeo = tiers([[1.75, 2.6, -1.25], [1.4, 2.4, -0.1], [1.0, 2.1, 1.0], [0.55, 1.5, 1.85]]);
    const crownMat = () => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const crownA = new THREE.InstancedMesh(crownGeo, crownMat(), n);
    const crownB = new THREE.InstancedMesh(crownGeo, crownMat(), n);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let a = 0, b = 0;
    B.treeSlots = [];
    world.trees.forEach((t, i) => {
      s.set(t.s, t.s, t.s);
      p.set(t.x, 1.5 * t.s, -t.y);
      mtx.compose(p, q, s); trunk.setMatrixAt(i, mtx);
      trunk.setColorAt(i, col.setHSL(0.07 + hash2(i, 3) * 0.03, 0.32, 0.17 + hash2(i, 4) * 0.08));
      p.set(t.x, (3 + 2.2) * t.s, -t.y);
      mtx.compose(p, q, s);
      const j = hash2(i, 7), l = hash2(i, 9);
      if (t.k < 0.5) { B.treeSlots.push({ arr: crownA, idx: a }); crownA.setColorAt(a, col.setHSL(0.36 + j * 0.05, 0.42, 0.13 + l * 0.06)); crownA.setMatrixAt(a++, mtx); }
      else { B.treeSlots.push({ arr: crownB, idx: b }); crownB.setColorAt(b, col.setHSL(0.27 + j * 0.06, 0.38, 0.19 + l * 0.07)); crownB.setMatrixAt(b++, mtx); }
    });
    crownA.count = a; crownB.count = b;
    for (const m of [trunk, crownA, crownB]) { m.castShadow = true; m.instanceColor.needsUpdate = true; }
    trunk.receiveShadow = true;
    B.crowns = [crownA, crownB]; B.trunkInst = trunk;
    scene.add(trunk, crownA, crownB);
    scene.add(groundCover(world));

    // landmarks, each drawn as what it is named
    for (const c of world.clearings) scene.add(landmark(c, world));
    B.ill = createIllusions(THREE, scene, B, world, camera);
    B.ill.setCalm(calmPref);
    B.grove = createGroveView(THREE, scene, camera, B.picks, HIDDEN);

    // deadfalls
    B.deadfalls = world.deadfalls.map((df) => {
      const g = new THREE.Group();
      const len = df.cells.length * CELL + 3;
      const logMat = new THREE.MeshLambertMaterial({ color: 0x5b4330 });
      const left = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, len / 2, 10), logMat);
      const right = left.clone();
      left.rotation.z = right.rotation.z = Math.PI / 2;
      left.position.set(-len / 4, 0.6, 0); right.position.set(len / 4, 0.6, 0);
      const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.25, 10), new THREE.MeshLambertMaterial({ color: 0xd9b98a }));
      cut.rotation.z = Math.PI / 2; cut.position.set(0, 0.6, 0);
      for (let k = 0; k < 5; k++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2, 5), logMat);
        br.position.set(-len / 2 + 1 + k * (len / 5), 1.2, (k % 2 ? 0.5 : -0.5));
        br.rotation.set(k % 2 ? 0.7 : -0.7, 0, 0.3);
        g.add(br);
      }
      const mid = df.cells.reduce((s, c) => s + c[0], 0) / df.cells.length;
      g.add(left, right, cut);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.position.set(mid * CELL + CELL / 2, 0, -df.y);
      scene.add(g);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 2), HIDDEN);
      hit.position.set(0, 0.8, 0); hit.userData.pick = { kind: "chop", id: df.id }; g.add(hit); B.picks.push(hit);
      return { g, left, right, cut, len };
    });

    // sticks
    const stickGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 5);
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    B.stickGeo = stickGeo; B.stickMat = stickMat;
    B.sticks = world.sticks.map((st) => {
      const m = new THREE.Mesh(stickGeo, stickMat);
      m.rotation.set(Math.PI / 2, 0, st.rot); m.position.set(st.x, 0.08, -st.y);
      scene.add(m);
      pickable(st.x, 0.3, st.y, 0.7, { kind: "stick", id: st.id }, m);
      return m;
    });

    // pylons
    B.pylons = world.pylons.map((py) => {
      const g = pylonMesh(py.mossed);
      g.position.set(py.x, 0, -py.y);
      scene.add(g);
      pickable(py.x, 2, py.y, 1.2, { kind: "pylon", id: py.id }, g, 4);
      return g;
    });

    // the far side: pylons home, arranged in a ring; count shown on arrival
    if (world.farSide) {
      B.home = [];
      for (let k = 0; k < 9; k++) {
        const g = pylonMesh(false);
        const a = (k / 9) * Math.PI * 2;
        g.position.set(world.farSide.x + Math.cos(a) * 6, 0, -(world.farSide.y + Math.sin(a) * 6));
        g.visible = false;
        scene.add(g);
        B.home.push(g);
      }
    }

    // camp
    B.camp = campMesh();
    scene.add(B.camp.g);
    const fireHit = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 8), HIDDEN);
    fireHit.position.y = 0.8; fireHit.userData.pick = { kind: "fire", id: 0 }; B.camp.g.add(fireHit); B.picks.push(fireHit);

    // what the action key will act on: a ring on the ground and a marker above
    B.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    arrow.rotation.x = Math.PI;
    B.marker.add(ring, arrow);
    B.marker.userData = { ring, arrow };
    B.marker.visible = false;
    scene.add(B.marker);

    // rain / leaves
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 40 - 20; pos[i * 3 + 1] = Math.random() * 12; pos[i * 3 + 2] = Math.random() * 40 - 20; }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    B.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.06 }));
    scene.add(B.particles);

    B.figureGeo = {
      body: new THREE.CapsuleGeometry(0.27, 0.5, 4, 10), head: new THREE.SphereGeometry(0.21, 14, 10),
      hat: new THREE.CylinderGeometry(0.17, 0.23, 0.14, 12), pack: new THREE.BoxGeometry(0.42, 0.5, 0.22),
      limb: new THREE.CapsuleGeometry(0.075, 0.45, 3, 6), leg: new THREE.CapsuleGeometry(0.1, 0.55, 3, 6),
    };
    return B;
  }

  function heapMesh() {
    const g = new THREE.Group(), logs = [];
    const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4c30 });
    for (let k = 0; k < 20; k++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), logMat);
      l.rotation.z = Math.PI / 2;
      l.position.set(1.4, 0.1 + Math.floor(k / 4) * 0.2, (k % 4) * 0.22 - 0.33);
      g.add(l); logs.push(l);
    }
    const stake = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5), logMat); pole.position.y = 0.9;
    const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshLambertMaterial({ color: 0xc8553d, side: THREE.DoubleSide })); rag.position.set(0.26, 1.6, 0);
    stake.add(pole, rag); g.add(stake);
    g.userData.logs = logs; g.userData.stake = stake;
    scene.add(g);
    return g;
  }

  function figure(colour, pick) {
    const g = new THREE.Group();
    const G = built.figureGeo;
    const mat = new THREE.MeshLambertMaterial({ color: colour });
    const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(colour).multiplyScalar(0.45) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9b48f });
    const body = new THREE.Mesh(G.body, mat);
    body.position.y = 1.08;
    const head = new THREE.Mesh(G.head, skin);
    head.position.y = 1.7;
    const hat = new THREE.Mesh(G.hat, dark); hat.position.y = 1.86;
    const pack = new THREE.Mesh(G.pack, new THREE.MeshLambertMaterial({ color: 0x4a4434 }));
    pack.position.set(0, 1.2, 0.26);
    const arms = [-1, 1].map((sd) => { const a = new THREE.Group(); a.position.set(0.33 * sd, 1.42, 0); const m = new THREE.Mesh(G.limb, mat); m.position.y = -0.3; a.add(m); return a; });
    const upper = new THREE.Group();             // bends at the hips when working
    upper.position.y = 0.75;
    for (const o of [body, head, hat, pack, ...arms]) { o.position.y -= 0.75; upper.add(o); }
    const legs = [-1, 1].map((sd) => { const l = new THREE.Group(); l.position.set(0.13 * sd, 0.78, 0); const m = new THREE.Mesh(G.leg, dark); m.position.y = -0.38; l.add(m); g.add(l); return l; });
    g.add(upper);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.body = upper; g.userData.arms = arms; g.userData.legs = legs;
    if (pick) {
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2, 8), HIDDEN);
      hit.position.y = 1; hit.userData.pick = pick; hit.userData.owner = g;
      g.add(hit); built.picks.push(hit);
    }
    scene.add(g);
    return g;
  }
  // limbs: a walk swings them by the step phase; still, they hang
  function limbs(f, phase, amp) {
    const [la, ra] = f.userData.arms, [ll, rl] = f.userData.legs;
    la.rotation.x = Math.sin(phase) * amp; ra.rotation.x = -Math.sin(phase) * amp;
    ll.rotation.x = -Math.sin(phase) * amp * 0.9; rl.rotation.x = Math.sin(phase) * amp * 0.9;
  }

  function draw(sim, dt, view = {}) {
    if (!scene || built.world !== sim.world) build(sim);
    const B = built, p = sim.player;
    const weather = sim.weather[Math.floor((sim.time - 6) / 24) + 1] || "clear";
    const look = WEATHER_LOOK[weather] || WEATHER_LOOK.clear;

    // daylight comes from the same clock as the night (sim.daylight), so it is
    // dark when the game says night, never hours after
    const h = hourOf(sim.time);
    const day = daylight(sim.time);
    const sky = new THREE.Color(look.sky).lerp(new THREE.Color(0x05070d), 1 - day);
    if (h > 16.5 && h < 18.5) sky.lerp(new THREE.Color(0xd08050), 0.3 * Math.sin(((h - 16.5) / 2) * Math.PI));
    scene.background = sky;
    scene.fog.color = sky;
    scene.fog.far = 14 + (look.fog - 14) * (0.25 + 0.75 * day);
    scene.fog.near = scene.fog.far * 0.15;
    const ill = B.ill.update(sim, dt);
    B.grove.update(sim);
    // felled trees: a stump, and no crown
    if ((B.felledN || 0) !== (sim.felled?.length || 0)) {
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
      for (const i of sim.felled.slice(B.felledN || 0)) {
        const t = sim.world.trees[i], slot = B.treeSlots[i];
        if (!t || !slot) continue;
        M.compose(V.set(t.x, 0.15 * t.s, -t.y), Q, Sc.set(t.s * 1.3, 0.1 * t.s, t.s * 1.3)); B.trunkInst.setMatrixAt(i, M);
        M.compose(V.set(t.x, -50, -t.y), Q, Sc.set(0.001, 0.001, 0.001)); slot.arr.setMatrixAt(slot.idx, M);
      }
      B.trunkInst.instanceMatrix.needsUpdate = true; for (const c of B.crowns) c.instanceMatrix.needsUpdate = true;
      B.felledN = sim.felled.length;
    }
    // the fruit: the real world goes small and dim, and the view narrows
    if (sim.fruit && sim.time < sim.fruit.until) { ill.lightMul *= 0.4; ill.fogMul *= 0.55; ill.fovAdd -= 14; }
    if (ill.skyTint) { sky.lerp(new THREE.Color(0x6f8a5c), ill.skyTint * day + ill.skyTint * 0.2); scene.background = sky; scene.fog.color = sky; }
    scene.fog.far *= ill.fogMul; scene.fog.near = scene.fog.far * 0.15;
    if (Math.abs(ill.fovAdd - fovAdd) > 0.01) { fovAdd += (ill.fovAdd - fovAdd) * Math.min(1, dt * 6); camera.fov = baseFov + fovAdd; camera.updateProjectionMatrix(); }
    // low sun is warm and long; by night the sky light is a cold blue, not brown
    const low = Math.max(0, 1 - Math.abs(h - 12) / 6.5) ;            // 1 at noon, 0 at 05:30 / 18:30
    const warmth = day * (1 - Math.min(1, low * 1.6));
    B.hemi.color.set(0xdfe9f3).lerp(new THREE.Color(0xffc89a), warmth * 0.45).lerp(new THREE.Color(0x5a6f9a), 1 - day);
    B.hemi.groundColor.set(0x3a3a22).lerp(new THREE.Color(0x141a26), 1 - day);
    B.hemi.intensity = (1.1 - 0.55 * day + look.light * 0.6 * day) * ill.lightMul;
    B.sun.intensity = 1.9 * look.light * day * (weather === "fog" || weather === "drizzle" ? 0.45 : 1);
    B.sun.color.set(0xfff2dd).lerp(new THREE.Color(0xff9a55), warmth * 0.8);
    B.groundMat.color.set(weather === "cold" ? 0xdfe8ee : 0xffffff);

    // camera: your eyes, unless a scene (going to sleep) is holding it
    const cam = view.cam || { x: p.x, y: p.y, h: 1.65, yaw: p.yaw, pitch: p.pitch };
    camera.position.set(cam.x, cam.h, -cam.y);
    camera.rotation.y = -cam.yaw;
    camera.rotation.x = cam.pitch;

    // the sun's place: up in the east at 06:00, over the south at noon, down in the west at 18:00
    const arc = ((h - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(arc), Math.max(0.12, Math.sin(arc)) * 0.9, 0.35).normalize();
    // the shadow box rides with you, stepped to whole texels so edges do not crawl
    const step = 68 / 2048, fx = Math.round(cam.x / step) * step, fz = Math.round(-cam.y / step) * step;
    B.sun.target.position.set(fx, 0, fz);
    B.sun.position.set(fx + sunDir.x * 80, sunDir.y * 80, fz + sunDir.z * 80);
    B.sun.castShadow = day > 0.05;
    const U = B.sky.material.uniforms;
    U.horizon.value.copy(sky);
    U.zenith.value.copy(sky).lerp(new THREE.Color(0x2d5f93), 0.55 * day * (weather === "clear" || weather === "wind" ? 1 : 0.35)).lerp(new THREE.Color(0x02030a), (1 - day) * 0.7);
    U.sunDir.value.copy(sunDir);
    U.sunCol.value.copy(B.sun.color);
    U.glow.value = day * (weather === "fog" ? 0.2 : weather === "drizzle" ? 0.3 : 1);
    U.stars.value = Math.max(0, 1 - day * 8) * (weather === "clear" || weather === "cold" ? 1 : 0.15);
    B.sky.position.copy(camera.position);

    // deadfalls: the cut opens as the work goes; cleared, the log rolls aside
    sim.deadfalls.forEach((d, i) => {
      const o = B.deadfalls[i];
      if (d.done >= 1) {
        o.left.position.set(-o.len / 4 - 2, 0.4, -1.5); o.right.position.set(o.len / 4 + 2, 0.4, 1.5);
        o.left.rotation.y = 0.5; o.right.rotation.y = 0.5; o.cut.visible = false;
      } else {
        o.cut.scale.set(1, 0.4 + d.done * 3, 1);
        o.cut.material.color.setHSL(0.09, 0.45, 0.55 + d.done * 0.15);
      }
    });

    sim.sticks.forEach((taken, i) => (B.sticks[i].visible = !taken));

    // pylons: grey unlit, blue to red while lit, dark when burned out
    sim.pylons.forEach((ps, i) => {
      const g = B.pylons[i], crystal = g.userData.crystal;
      let col = 0x6b7079, em = 0x000000;
      if (ps.litAt != null) {
        const f = Math.min(1, (sim.time - ps.litAt) / PYLON_HOURS);
        if (f < 1) { col = new THREE.Color(0x3a8bff).lerp(new THREE.Color(0xff3a2a), f).getHex(); em = col; }
        else { col = 0x2a2a2a; }
      } else if (ps.spent) col = 0x2a2a2a;
      // a mind far gone sees the dead ones burn blue: the honest instrument lies exactly when it is needed
      const really = ps.litAt != null && sim.time - ps.litAt < PYLON_HOURS;
      if (seesPylonLit(sim, sim.world.pylons[i]) && !really) { col = 0x3a8bff; em = col; }
      crystal.material.color.set(col); crystal.material.emissive.set(em);
      g.userData.light.intensity = em ? 2.5 : 0;
      g.userData.light.color.set(em || 0);
    });

    // the far side's count, visible once you are close
    if (B.home) {
      const fs = sim.world.farSide;
      const near = Math.hypot(fs.x - p.x, fs.y - p.y) < 45;
      const count = near ? homeCount(sim) : 0;
      B.home.forEach((g, k) => {
        g.visible = k < count;
        const dark = k < sim.home.lit;
        g.userData.crystal.material.color.set(dark ? 0x2a2a2a : 0x8fd0ff);
        g.userData.crystal.material.emissive.set(dark ? 0 : 0x2a6fa8);
      });
    }

    // camp
    const C = B.camp, camp = sim.camp;
    // A camp going up, or coming down, is drawn as far along as the work is:
    // the kit on the ground, the first tent rising, the second, then the
    // stones of the fire ring one by one. Taking it down runs it backwards.
    const pitch = sim.pitch;
    const striking = sim.work?.kind === "strike" ? sim.work : null;
    C.g.visible = camp.up || !!pitch;
    const prog = striking ? Math.max(0, striking.left / STRIKE_HOURS) : camp.up ? 1 : pitch ? Math.max(0, 1 - pitch.left / PITCH_HOURS) : 1;
    const stage = (a, b) => Math.max(0, Math.min(1, (prog - a) / (b - a)));
    const t1 = stage(0.08, 0.5), t2 = stage(0.35, 0.8);
    C.tents.forEach((tnt, i) => {
      const k = i === 0 ? t1 : t2;
      tnt.visible = k > 0.01;
      tnt.scale.set(0.6 + 0.4 * k, Math.max(0.02, k), 0.6 + 0.4 * k);
      tnt.position.y = 1.0 * Math.max(0.02, k);
    });
    C.stones.forEach((st, i) => (st.visible = prog >= 0.72 + i * 0.035));
    C.kit.visible = !camp.up || striking ? prog < 0.6 : false;
    C.kit.scale.setScalar(Math.max(0.3, 1 - prog));
    C.g.position.set(camp.up ? camp.x : pitch ? pitch.x : camp.x, 0, -(camp.up ? camp.y : pitch ? pitch.y : camp.y));
    const seenFire = shownFire(sim);          // a failing mind can see a fire that is out
    const fuel = seenFire.lit ? Math.min(1, seenFire.fire / 6) : 0;
    C.flame.visible = seenFire.lit;
    C.hearth.visible = prog >= 0.9;
    const tNow = performance.now() / 1000;
    const flick = 0.85 + 0.1 * Math.sin(tNow * 11.3) + 0.06 * Math.sin(tNow * 23.7 + 1.3) + 0.04 * Math.sin(tNow * 41.1);
    C.flame.scale.set(0.5 + fuel, (0.4 + fuel * 1.4) * flick, 0.5 + fuel);
    C.flame.userData.tongues.forEach((tg, k) => { tg.rotation.y = tNow * (0.6 + k * 0.5); tg.scale.y = 0.9 + 0.15 * Math.sin(tNow * (9 + k * 4) + k); });
    if (seenFire.lit) {
      const ea = C.flame.userData.embers.geometry.attributes.position, arr = ea.array;
      for (let i = 0; i < arr.length / 3; i++) {
        const life = (tNow * 0.45 + hash2(i, 1)) % 1, a = hash2(i, 2) * 6.283 + life * 3;
        arr[i * 3] = Math.cos(a) * (0.1 + life * 0.35); arr[i * 3 + 1] = 0.3 + life * 2.6; arr[i * 3 + 2] = Math.sin(a) * (0.1 + life * 0.35);
      }
      ea.needsUpdate = true;
      C.flame.userData.embers.material.opacity = 1 - day * 0.85;
    }
    C.light.intensity = seenFire.lit ? (6 + fuel * 18) * flick : 0;
    C.light.distance = 10 + fuel * 18;
    C.pile.forEach((l, k) => (l.visible = k < camp.pile));

    // the marked site (a stake, and the wood brought to it) and the piles left where camps stood
    B.piles ||= [];
    const heaps = [...(sim.site && !camp.up ? [{ x: sim.site.x, y: sim.site.y, n: camp.pile, stake: true }] : []), ...(sim.piles || [])];
    while (B.piles.length < heaps.length) B.piles.push(heapMesh());
    B.piles.forEach((g, i) => {
      const hp = heaps[i];
      g.visible = !!hp;
      if (!hp) return;
      g.position.set(hp.x, 0, -hp.y);
      g.userData.logs.forEach((l, k) => (l.visible = k < hp.n));
      g.userData.stake.visible = !!hp.stake;
    });

    // people
    const seen = new Set();
    for (const m of party(sim)) {
      let f = B.members.get(m.id);
      if (!f) { f = figure(SLOT_COLOURS[m.slot % SLOT_COLOURS.length], { kind: "member", id: m.id }); B.members.set(m.id, f); }
      // a scene's camera passing through someone does not see their insides
      f.visible = !(view.cam && Math.hypot(view.cam.x - m.x, view.cam.y - m.y) < 1.3);
      // asleep: in the tents at camp, or lying where they are
      if (m.sleeping && !m.watch) {
        if (sim.camp.up && Math.hypot(m.x - sim.camp.x, m.y - sim.camp.y) < 14) { f.visible = false; seen.add(m.id); continue; }
        f.userData.body.rotation.x = Math.PI / 2; f.position.set(m.x, 0.15, -m.y); limbs(f, 0, 0); f.userData.legs.forEach((l) => (l.visible = false)); seen.add(m.id); continue;
      }
      const prev = f.userData.prev || { x: m.x, y: m.y };
      const mv = Math.hypot(m.x - prev.x, m.y - prev.y);
      if (mv > 0.001) f.rotation.y = Math.atan2(-(m.x - prev.x), -(m.y - prev.y));
      f.userData.prev = { x: m.x, y: m.y };
      f.userData.bob = (f.userData.bob || 0) + mv * 5;
      // working: bent to it, a steady rhythm; sitting at the fire: lower
      const working = m.state === "work" || (m.workT != null && sim.time - m.workT < 0.03);
      const now = performance.now() / 1000;
      f.userData.legs.forEach((l) => (l.visible = true));
      if (working) {
        const swing = Math.sin(now * 7 + m.slot);
        f.userData.body.rotation.x = 0.35 + swing * 0.2;
        f.userData.arms.forEach((a) => (a.rotation.x = -1.2 - swing * 0.6)); f.userData.legs.forEach((l) => (l.rotation.x = 0));
        f.position.set(m.x, Math.max(0, swing) * 0.05, -m.y);
        if (sim.pitch && mv < 0.001) f.rotation.y = Math.atan2(-(sim.pitch.x - m.x), -(sim.pitch.y - m.y));
      } else if (m.state === "sit") {
        f.userData.body.rotation.x = 0.1;
        f.position.set(m.x, -0.45, -m.y);
        limbs(f, 0, 0); f.userData.legs.forEach((l) => (l.rotation.x = -1.4)); f.userData.arms.forEach((a) => (a.rotation.x = -0.5));
        if (sim.camp.up) f.rotation.y = Math.atan2(-(sim.camp.x - m.x), -(sim.camp.y - m.y));
      } else {
        f.userData.body.rotation.x = 0;
        f.position.set(m.x, Math.abs(Math.sin(f.userData.bob)) * 0.06, -m.y);
        f.userData.amp = (f.userData.amp || 0) + ((mv > 0.001 ? 0.6 : 0) - (f.userData.amp || 0)) * Math.min(1, dt * 8);
        limbs(f, f.userData.bob, f.userData.amp);
      }
      // a mind going: out of your sight they turn to watch you, and look away when you look
      if (mindLevel(sim) < 0.55 && !sim.tutorial) {
        const dx = m.x - p.x, dy = m.y - p.y, dd = Math.hypot(dx, dy) || 1;
        const inView = (dx * Math.sin(p.yaw) + dy * Math.cos(p.yaw)) / dd > 0.55;
        if (!inView && dd < 30) f.rotation.y = Math.atan2(-(p.x - m.x), -(p.y - m.y));
      }
      // at the edge of where the lost one is: the real turn their backs; a fake faces in
      if (m.edge) f.rotation.y = Math.atan2(-(m.edge.x - m.x), -(m.edge.y - m.y)) + (m.fake ? 0 : Math.PI);
      seen.add(m.id);
    }
    for (const [id, f] of B.members) if (!seen.has(id)) f.visible = false;
    for (const ms of sim.missing) {
      let f = B.missing.get(ms.id);
      if (!f) { f = figure(SLOT_COLOURS[ms.slot % SLOT_COLOURS.length], { kind: "rescue", id: ms.id }); B.missing.set(ms.id, f); }
      f.visible = personOut(sim, ms);           // out there only in the small hours
      f.position.set(ms.x, 0, -ms.y);
      f.rotation.y = sim.time * 0.3;
    }

    // weather particles around the camera
    const P = B.particles, arr = P.geometry.attributes.position.array;
    const wet = weather === "drizzle", windy = weather === "wind";
    P.visible = (wet || windy) && !isNight(sim.time) || wet;
    P.material.color.set(windy ? 0x8a6a2a : 0xaabbcc);
    P.material.size = windy ? 0.12 : 0.05;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= dt * (wet ? 9 : 1.5);
      if (windy) arr[i] += dt * 5;
      if (arr[i + 1] < 0) arr[i + 1] += 12;
      if (arr[i] > 20) arr[i] -= 40;
    }
    P.geometry.attributes.position.needsUpdate = true;
    P.position.set(p.x, 0, -p.y);
    // wind moves the tops
    const sway = windy ? Math.sin(performance.now() / 500) * 0.02 : 0;
    for (const c of B.crowns) c.rotation.z = sway;

    // things on the ground that are not there. Still, they are drawn exactly
    // like the real sticks (a snake lies as a stick lies). Woken, they slither.
    const all = phantomSticks(sim);
    const still = all.filter((s) => !s.slither), woken = all.filter((s) => s.slither);
    B.phantoms ||= []; B.snakes ||= [];
    still.forEach((s, i) => {
      let m = B.phantoms[i];
      if (!m) { m = new THREE.Mesh(B.stickGeo, B.stickMat); scene.add(m); B.phantoms[i] = m; B.picks.push(m); }
      m.visible = true; m.rotation.set(Math.PI / 2, 0, s.rot); m.position.set(s.x, 0.08, -s.y);
      m.userData.pick = { kind: "stick", id: s.id };
    });
    for (let i = still.length; i < B.phantoms.length; i++) B.phantoms[i].visible = false;
    woken.filter((s) => !s.crawl).forEach((s, i) => {
      let sn = B.snakes[i];
      if (!sn) {
        const g = new THREE.Group(), segs = [];
        for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - 0.009 * k, 0.07 - 0.009 * k, 0.32, 6), B.stickMat); g.add(seg); segs.push(seg); }
        scene.add(g); sn = { g, segs }; B.snakes[i] = sn;
      }
      sn.g.visible = true;
      const dx = Math.cos(s.ang), dy = Math.sin(s.ang), t = s.t;
      sn.segs.forEach((seg, k) => {
        const back = k * 0.27, w = Math.sin(t * 11 - k * 1.1) * 0.15 * Math.min(1, t * 2);
        const px = s.x - dx * back - dy * w, py = s.y - dy * back + dx * w;
        const lift = k === 0 ? Math.max(0, Math.sin(t * 5)) * 0.1 : 0;
        seg.position.set(px, 0.07 + lift - s.sink * 0.25, -py);
        seg.rotation.set(0, Math.atan2(dy + dx * Math.cos(t * 11 - k * 1.1) * 0.6, dx - dy * Math.cos(t * 11 - k * 1.1) * 0.6), Math.PI / 2);
      });
    });
    for (let i = woken.filter((s) => !s.crawl).length; i < B.snakes.length; i++) B.snakes[i].g.visible = false;
    // the one with legs: a stick that walks, many-legged, straight at you
    const crawlers = woken.filter((s) => s.crawl);
    B.crawlers ||= [];
    crawlers.forEach((s, i) => {
      let c = B.crawlers[i];
      if (!c) {
        const g = new THREE.Group(), segs = [], legs = [];
        const legMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
        for (let k = 0; k < 8; k++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 6), B.stickMat); seg.rotation.z = Math.PI / 2; g.add(seg); segs.push(seg);
          for (const side of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.34, 4), legMat); g.add(l); legs.push({ l, k, side }); }
        }
        scene.add(g); c = { g, segs, legs }; B.crawlers[i] = c;
      }
      c.g.visible = true;
      const dx = Math.cos(s.ang), dy = Math.sin(s.ang), t = s.t;
      c.segs.forEach((seg, k) => {
        const back = k * 0.19, w = Math.sin(t * 9 - k * 0.8) * 0.05;
        seg.position.set(s.x - dx * back - dy * w, 0.12, -(s.y - dy * back + dx * w));
        seg.rotation.set(0, Math.atan2(dy, dx), Math.PI / 2);
      });
      c.legs.forEach(({ l, k, side }) => {
        const back = k * 0.19, ph = Math.sin(t * 26 + k * 1.3 + (side > 0 ? Math.PI : 0));
        const bx = s.x - dx * back, by = s.y - dy * back;
        l.position.set(bx - dy * side * 0.17, 0.08 + Math.max(0, ph) * 0.04, -(by + dx * side * 0.17));
        l.rotation.set(side * 0.9 + ph * 0.3, -Math.atan2(dy, dx), ph * 0.4);
      });
    });
    for (let i = crawlers.length; i < B.crawlers.length; i++) B.crawlers[i].g.visible = false;

    // someone in the trees: drawn like a teammate (a grey one), still and facing you
    // until you come near, then walking off
    // one of them at the edge of the firelight, who is not there
    const kin = kinAtTheEdge(sim);
    if (kin && !sim.kinGone?.[kin.key]) {
      if (!B.kin || B.kinSlot !== kin.slot) { if (B.kin) scene.remove(B.kin); B.kin = figure(SLOT_COLOURS[kin.slot % SLOT_COLOURS.length], null); B.kinSlot = kin.slot; }
      B.kin.visible = true; B.kin.position.set(kin.x, 0, -kin.y); B.kin.rotation.y = Math.atan2(-(p.x - kin.x), -(p.y - kin.y));
    } else if (B.kin) B.kin.visible = false;
    const watchers = phantomWatchers(sim);
    B.watchers ||= [];
    watchers.forEach((w, i) => {
      let f = B.watchers[i];
      if (!f) { f = figure(0x7d8286, null); B.watchers[i] = f; }
      f.visible = true;
      f.position.set(w.x, w.walking ? Math.abs(Math.sin(w.t * 6)) * 0.06 : 0, -w.y);
      f.rotation.y = w.walking ? Math.atan2(-Math.cos(w.ang), -Math.sin(w.ang)) * -1 + Math.PI : Math.atan2(-(p.x - w.x), -(p.y - w.y));
    });
    for (let i = watchers.length; i < B.watchers.length; i++) B.watchers[i].visible = false;

    // the target marker
    const t = view.target, M = B.marker;
    M.visible = !!t && !t.area;
    if (M.visible) {
      const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
      M.position.set(t.x, 0, -t.y);
      M.userData.ring.scale.set(pulse, pulse, pulse);
      M.userData.arrow.position.y = (t.h || 1) + 0.35 + Math.sin(performance.now() / 250) * 0.08;
    }

    renderer.render(scene, camera);
  }

  // What is under a point on the screen: {kind, id} of the nearest visible thing.
  const ray = new THREE.Raycaster();
  function pick(clientX, clientY, skip = []) {
    if (!built) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    ray.far = 30;
    for (const hit of ray.intersectObjects(built.picks, false)) {
      const o = hit.object, owner = o.userData.owner;
      // a hidden thing is not there to tap (unused phantom sticks keep a stale target)
      if (!o.visible || (owner && !owner.visible)) continue;
      let up = o.parent, shown = true;
      while (up) { if (up.visible === false) shown = false; up = up.parent; }
      if (!shown || skip.includes(o.userData.pick?.kind)) continue;
      return { ...o.userData.pick, dist: hit.distance };
    }
    return null;
  }

  function setCalm(v) { calmPref = !!v; built?.ill?.setCalm(v); }
  return { draw, pick, resize, setFov, setCalm, camera, renderer, get built() { return built; } };
}

function pylonMesh(mossed) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 0.7), new THREE.MeshLambertMaterial({ color: mossed ? 0x4d5e3a : 0x4b4d52 }));
  stone.position.y = 1.6;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshLambertMaterial({ color: 0x6b7079, emissive: 0x000000 }));
  crystal.position.y = 3.7;
  const light = new THREE.PointLight(0x000000, 0, 18);
  light.position.y = 3.7;
  stone.castShadow = true;
  g.add(stone, crystal, light);
  g.userData = { crystal, light };
  return g;
}

function campMesh() {
  const g = new THREE.Group();
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 4), new THREE.MeshLambertMaterial({ color: 0xb07a3a, flatShading: true }));
  tent.position.set(TENTS[0].dx, 1.1, -TENTS[0].dy); tent.rotation.y = Math.PI / 4;
  const tent2 = new THREE.Mesh(tent.geometry, new THREE.MeshLambertMaterial({ color: 0x5f7040, flatShading: true }));
  tent2.position.set(TENTS[1].dx, 1.1, -TENTS[1].dy); tent2.rotation.y = Math.PI / 4;
  // a dark doorway on the face toward the fire
  for (const t of [tent, tent2]) {
    const door = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 3), new THREE.MeshBasicMaterial({ color: 0x14100c }));
    const toFire = Math.atan2(-t.position.x, -t.position.z) - t.rotation.y;
    door.position.set(Math.sin(toFire) * 0.62, -0.38, Math.cos(toFire) * 0.62); door.scale.z = 0.12; door.rotation.y = toFire;
    t.add(door);
  }
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x55575a });
  const stones = [];
  for (let k = 0; k < 8; k++) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), ringMat);
    stones.push(s);
    s.position.set(Math.cos(k * 0.785) * 0.8, 0.12, Math.sin(k * 0.785) * 0.8);
    g.add(s);
  }
  // the fire: three tongues, hot in the middle, over charred logs, sparks going up
  const flame = new THREE.Group();
  const tongue = (r, hgt, col, op) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, hgt, 9, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.position.y = hgt / 2; flame.add(m); return m;
  };
  flame.userData.tongues = [tongue(0.5, 1.2, 0xff5a1a, 0.75), tongue(0.36, 1.0, 0xff9a30, 0.8), tongue(0.2, 0.7, 0xffe08a, 0.9)];
  const N = 40, ep = new Float32Array(N * 3);
  const embers = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(ep, 3)),
    new THREE.PointsMaterial({ color: 0xffb060, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  embers.frustumCulled = false;
  flame.add(embers); flame.userData.embers = embers;
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.62, 12), new THREE.MeshBasicMaterial({ color: 0xff6a20 }));
  coal.rotation.x = -Math.PI / 2; coal.position.y = 0.03; flame.add(coal);
  const char = new THREE.MeshLambertMaterial({ color: 0x1e1712 });
  const hearth = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 6), char);
    l.rotation.set(0.95, (k / 4) * Math.PI * 2, 0, "YXZ"); l.position.set(Math.sin((k / 4) * Math.PI * 2) * 0.22, 0.25, Math.cos((k / 4) * Math.PI * 2) * 0.22);
    hearth.add(l);
  }
  const light = new THREE.PointLight(0xff9a50, 0, 20, 1.5);
  light.position.y = 1.4;
  const pile = [];
  const logMat = new THREE.MeshLambertMaterial({ color: 0x6b4c30 });
  for (let k = 0; k < 16; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), logMat);
    l.rotation.z = Math.PI / 2;
    l.position.set(1.8 + (k % 4) * 0.02, 0.1 + Math.floor(k / 4) * 0.2, 1.2 + (k % 4) * 0.22);
    g.add(l); pile.push(l);
  }
  // the kit, bundled on the ground until it becomes a camp
  const kit = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 10), new THREE.MeshLambertMaterial({ color: 0x8a7f5a }));
  roll.rotation.z = Math.PI / 2; roll.position.y = 0.35;
  const poles = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.25), new THREE.MeshLambertMaterial({ color: 0x6b4c30 }));
  poles.position.set(0, 0.1, 0.5);
  kit.add(roll, poles); kit.position.set(-0.5, 0, -2.6);
  tent.castShadow = tent2.castShadow = true;
  g.add(tent, tent2, flame, light, kit, hearth);
  return { g, flame, light, pile, tents: [tent, tent2], stones, kit, hearth };
}

function landmark(c, world) {
  const g = new THREE.Group();
  g.position.set(c.x, 0, -c.y);
  const M = (col) => new THREE.MeshLambertMaterial({ color: col });
  switch (c.kind) {
    case "creek": {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, c.r * 2.6), new THREE.MeshPhongMaterial({ color: 0x2f6a90, emissive: 0x06121c, specular: 0x9fb8c8, shininess: 90 }));
      w.rotation.x = -Math.PI / 2; w.rotation.z = 0.5; w.position.y = 0.03;
      g.add(w);
      for (let k = 0; k < 6; k++) {
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), M(0x7a7f85));
        s.position.set(Math.sin(k) * 1.2, 0.1, (k - 3) * 1.4); g.add(s);
      }
      break;
    }
    case "pond": {
      const w = new THREE.Mesh(new THREE.CircleGeometry(c.r * 0.55, 24), new THREE.MeshPhongMaterial({ color: 0x24587a, emissive: 0x05101a, specular: 0x9fb8c8, shininess: 90 }));
      w.rotation.x = -Math.PI / 2; w.position.y = 0.03; g.add(w);
      for (let k = 0; k < 8; k++) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), M(0x9a9a4a));
        const a = k * 0.8; r.position.set(Math.cos(a) * c.r * 0.58, 0.5, Math.sin(a) * c.r * 0.58); g.add(r);
      }
      break;
    }
    case "birches":
      for (let k = 0; k < 7; k++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 6, 6), M(0xeeeeea));
        const a = k * 0.9; t.position.set(Math.cos(a) * c.r * 0.6, 3, Math.sin(a) * c.r * 0.6);
        const cr = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), M(0x9fc25a));
        cr.position.set(t.position.x, 6.3, t.position.z);
        g.add(t, cr);
      }
      break;
    case "rocks":
      for (let k = 0; k < 6; k++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (k % 3) * 0.4), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.1 + hash2(k, c.x) * 0.15, 0.08 + hash2(c.y, k) * 0.1, 0.36 + hash2(k, k) * 0.12), flatShading: true }));
        r.position.set(Math.cos(k * 1.1) * 2.5, 0.25, Math.sin(k * 1.1) * 2.5); r.rotation.set(k, k * 2, 0); r.scale.set(1, 0.75, 1.1); g.add(r);
      }
      break;
    case "old burn": {
      const d = new THREE.Mesh(new THREE.CircleGeometry(c.r * 0.7, 20), M(0x2a2622));
      d.rotation.x = -Math.PI / 2; d.position.y = 0.02; g.add(d);
      for (let k = 0; k < 7; k++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1 + (k % 3) * 0.8, 6), M(0x111111));
        const a = k * 0.95; s.position.set(Math.cos(a) * c.r * 0.45, 0.5, Math.sin(a) * c.r * 0.45); g.add(s);
      }
      break;
    }
    case "stones":
      for (let k = 0; k < 5; k++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.4), M(0x9a968c));
        const a = (k / 5) * Math.PI * 2; s.position.set(Math.cos(a) * 3, 1.3, Math.sin(a) * 3); s.rotation.y = a;
        g.add(s);
      }
      break;
  }
  g.traverse((o) => { if (o.isMesh && o.position.y > 0.05) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// --- look helpers: all derived from place and index, never from an rng stream ---

function hash2(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

// one geometry from several pieces: [geometry, x, y, z, rotY, rotZ]
function merge(parts) {
  const pos = [], nor = [];
  const m = new THREE.Matrix4(), e = new THREE.Euler();
  for (const [g0, x = 0, y = 0, z = 0, ry = 0, rz = 0] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone());
    g.applyMatrix4(m.makeRotationFromEuler(e.set(0, ry, rz)).setPosition(x, y, z));
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

// a conifer crown: stacked cones [radius, height, centre y], each tier turned a little
function tiers(list) {
  return merge(list.map(([r, h, y], k) => [new THREE.ConeGeometry(r, h, 8, 1), 0, y, 0, k * 0.4]));
}

// The sky: a dome that fades from the fog colour at the horizon to a deeper
// zenith, with the sun's glow by day and stars by night. Fog-free; it follows
// the camera, so it never has an edge.
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      horizon: { value: new THREE.Color(0x9cc3de) }, zenith: { value: new THREE.Color(0x3d6f9e) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xfff2dd) },
      glow: { value: 1 }, stars: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 horizon, zenith, sunDir, sunCol; uniform float glow, stars; varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, pow(up, 0.55) * smoothstep(-0.02, 0.25, d.y));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * glow * (pow(s, 8.0) * 0.35 + pow(s, 600.0) * 4.0);
        vec3 cell = floor(d * 260.0);
        float st = step(0.9975, h(cell)) * smoothstep(0.05, 0.35, d.y) * (0.6 + 0.4 * h(cell + 7.0));
        c += vec3(0.85, 0.9, 1.0) * st * stars;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.renderOrder = -1; m.frustumCulled = false;
  return m;
}

// The forest floor: grass in the open, ferns under the trees, a few stones.
// Nothing here is shaped like a stick: on this ground a stick is information.
function groundCover(world) {
  const { w, h } = world, g = new THREE.Group();
  const blade = new THREE.ConeGeometry(0.035, 0.5, 3, 1, true);
  const grassGeo = merge([[blade, 0, 0.25, 0], [blade, 0.08, 0.2, 0.04, 0, 0.35], [blade, -0.07, 0.22, 0.03, 0, -0.3], [blade, 0.02, 0.18, -0.08, 1, 0.25], [blade, -0.03, 0.2, 0.08, 2, -0.2]]);
  const frond = new THREE.PlaneGeometry(0.16, 0.8, 1, 1);
  frond.rotateX(-Math.PI / 2 + 0.6); frond.translate(0, 0.2, -0.36);
  const fernGeo = merge([0, 1, 2, 3, 4, 5].map((k) => [frond, 0, 0, 0, (k / 6) * Math.PI * 2]));
  const stoneGeo = new THREE.DodecahedronGeometry(0.18, 0);
  const near = (x, y) => world.clearings.some((c) => Math.hypot(c.x - x, c.y - y) < c.r * 0.75);
  const spots = { grass: [], fern: [], stone: [] };
  for (let cy = 0; cy < h; cy++)
    for (let cx = 0; cx < w; cx++) {
      const o = world.walk[cy * w + cx];
      const onTrail = Math.abs(cx - world.trailX[cy]) <= 1.5 || world.decoyCells.has(cy * w + cx);
      for (let k = 0; k < 2; k++) {
        const r = hash2(cx * 3 + k, cy * 7 + 1), x = (cx + hash2(cx, cy * 5 + k)) * CELL, y = (cy + hash2(cx * 5 + k, cy)) * CELL;
        if (near(x, y)) continue;
        if (onTrail) { if (r < 0.05) spots.stone.push([x, y]); continue; }
        if (o) { if (r < 0.6) spots.grass.push([x, y]); else if (r < 0.62) spots.stone.push([x, y]); }
        else if (r < 0.45) spots.fern.push([x, y]);
        else if (r < 0.7) spots.grass.push([x, y]);
      }
    }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  const lay = (geo, list, hue, sat, lit, size, flat) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: flat }), list.length);
    list.forEach(([x, y], i) => {
      const r = hash2(x * 3.1, y * 1.7), sz = size * (0.7 + r * 0.6);
      Q.setFromAxisAngle(Y, r * 6.283);
      M.compose(P.set(x, 0, -y), Q, S.set(sz, sz * (0.8 + hash2(y, x) * 0.5), sz)); im.setMatrixAt(i, M);
      im.setColorAt(i, C.setHSL(hue + (hash2(x, y) - 0.5) * 0.06, sat, lit * (0.8 + r * 0.4)));
    });
    im.receiveShadow = true; im.instanceColor.needsUpdate = true;
    g.add(im);
  };
  lay(grassGeo, spots.grass, 0.24, 0.45, 0.26, 1, false);
  lay(fernGeo, spots.fern, 0.3, 0.45, 0.16, 0.7, false);
  lay(stoneGeo, spots.stone, 0.12, 0.05, 0.4, 1, true);
  return g;
}
