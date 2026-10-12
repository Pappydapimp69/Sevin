// illusions.js — what a failing mind sees the WORLD do. Render layer: reads sim
// (through percept's mindLevel), never writes it. Every effect is placed from
// the seed and the place it happens (side hashes), never the run stream, and
// every one is corrected by the world: the tree stands straight again, the rock
// is a rock, the fire is not there when you arrive. Teammates see none of it.
//
//   bend      trees lean in as you pass, then stand
//   rockface  a rock swells as you near, shows a face for under a second
//   breath    the fog draws in and lets go
//   sick      the sky takes a green cast
//   flicker   daylight stutters
//   moon      at night, one too large and too low; later a second
//   fire      a camp-fire far off in the dark that is out when you reach it
//   eyes      pairs on trunks, shut when you look at them
//   stretch   (mirage) the field of view opens and the fog draws back
//   seal      (mirage) trees close the way in
//   castle / chest / hole   (mirage) the dead end, grown into something
//
// Whispers and the footsteps behind are in audio.js; compass jitter in ui.js.

import { mindLevel } from "./percept.js";
import { daylight } from "./sim.js";
import { stream, hash } from "./rng.js";
import { CELL } from "./world.js";
import { kindFor } from "./mirage.js";
import { inGlow } from "./grove.js";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => x * x * (3 - 2 * x);

export function createIllusions(THREE, scene, B, world, camera) {
  const out = { fogMul: 1, fovAdd: 0, skyTint: 0, lightMul: 1 };
  let clock = 0, calm = false;

  // --- bend: needs the instanced trees' slots --------------------------------
  const bent = new Map();                       // tree index -> true while leaning
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), AX = new THREE.Vector3();
  function placeTree(i, lean, axis) {
    const t = world.trees[i], slot = B.treeSlots[i];
    Q.setFromAxisAngle(axis, lean);
    S.set(t.s, t.s, t.s);
    AX.set(0, 1.5 * t.s, 0).applyQuaternion(Q);
    P.set(t.x + AX.x, AX.y, -t.y + AX.z); M.compose(P, Q, S); B.trunkInst.setMatrixAt(i, M);
    AX.set(0, 5.2 * t.s, 0).applyQuaternion(Q);
    P.set(t.x + AX.x, AX.y, -t.y + AX.z); M.compose(P, Q, S); slot.arr.setMatrixAt(slot.idx, M);
  }
  const NOQ = new THREE.Vector3(0, 0, 1);
  function bendTrees(sim, amp) {
    const p = sim.player, now = new Set();
    if (amp > 0.02) {
      for (let i = 0; i < world.trees.length; i++) {
        const t = world.trees[i], dx = t.x - p.x, dy = t.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > 144) continue;
        if (stream(hash("bend", sim.seed, i))() > 0.45 || inGlow(sim, t.x, t.y)) continue;
        const d = Math.sqrt(d2), k = smooth(clamp(1 - d / 12)) * amp;
        // lean toward the player: rotate about the horizontal axis perpendicular to the line to them
        const ax = new THREE.Vector3(dy / (d || 1), 0, dx / (d || 1));      // (three x, z = -y)
        placeTree(i, 0.55 * k * Math.sin(clock * 0.9 + i), ax.normalize());
        now.add(i);
      }
    }
    for (const i of bent.keys()) if (!now.has(i)) placeTree(i, 0, NOQ);
    bent.clear(); for (const i of now) bent.set(i, true);
    if (now.size || bent.size) { B.trunkInst.instanceMatrix.needsUpdate = true; for (const c of B.crowns) c.instanceMatrix.needsUpdate = true; }
  }

  // --- rocks with faces --------------------------------------------------------
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x77786f });
  const faceMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const rocks = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat); rock.scale.set(1, 0.8, 0.9); rock.position.y = 0.6;
    const face = new THREE.Group();
    for (const sx of [-0.35, 0.35]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8), faceMat); e.position.set(sx, 0.95, 0.92); face.add(e); }
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), faceMat); mouth.position.set(0, 0.45, 0.93); face.add(mouth);
    face.visible = false; g.add(rock, face); g.visible = false; scene.add(g);
    rocks.push({ g, face, key: null });
  }
  const flashed = new Map();                     // rock key -> seconds of face left (or -1 once shown)
  function rockFaces(sim, dt, m) {
    const p = sim.player, gx0 = Math.floor(p.x / 20), gy0 = Math.floor(p.y / 20);
    let slot = 0;
    for (let gx = gx0 - 1; gx <= gx0 + 1; gx++)
      for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
        const r = stream(hash("rockface", sim.seed, gx, gy));
        const on = r() < 0.55, rx = gx * 20 + r() * 20, ry = gy * 20 + r() * 20;
        if (!on || m > 0.68 || slot >= rocks.length) continue;
        const cx = Math.floor(rx / CELL), cy = Math.floor(ry / CELL);
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || !world.walk[cy * world.w + cx] || inGlow(sim, rx, ry)) continue;
        const R = rocks[slot++], key = gx + "," + gy;
        const d = Math.hypot(rx - p.x, ry - p.y);
        R.g.visible = d < 24;
        R.g.position.set(rx, 0, -ry);
        R.g.scale.setScalar(0.35 + 0.65 * smooth(clamp((24 - d) / 18)));      // it swells as you come
        R.g.rotation.y = Math.atan2(p.x - rx, -(p.y - ry)) + Math.PI;
        let left = flashed.get(key);
        if (left == null && d < 7) { left = 0.8; flashed.set(key, left); }
        if (left != null && left > 0) { left -= dt; flashed.set(key, left); }
        R.face.visible = left != null && left > 0;
        if (R.face.visible) R.g.rotation.y = Math.atan2(p.x - rx, -(p.y - ry)) + Math.PI;
      }
    for (; slot < rocks.length; slot++) rocks[slot].g.visible = false;
  }

  // --- the wrong moon ------------------------------------------------------------
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8b070, fog: false });
  const moons = [0, 1].map(() => { const mm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), moonMat); mm.visible = false; scene.add(mm); return mm; });
  function moon(sim, day, m) {
    const night = day < 0.25;
    const a = stream(hash("moon", sim.seed, Math.floor((sim.time - 6) / 24)))();
    moons.forEach((mm, i) => {
      mm.visible = night && m < (i ? 0.3 : 0.55);
      if (!mm.visible) return;
      const az = a * 6.28 + i * 2.1 + clock * 0.004, el = 0.35 + i * 0.25;
      const R = 300;
      mm.position.set(camera.position.x + Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, camera.position.z - Math.cos(az) * Math.cos(el) * R);
      mm.scale.setScalar(i ? 26 : 38);
    });
  }

  // --- a camp-fire that is not there -----------------------------------------------
  const lureLight = new THREE.PointLight(0xff8a3a, 0, 40, 2);
  const lure = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  lure.visible = false; scene.add(lure, lureLight);
  function lureFire(sim, day, m) {
    const p = sim.player;
    lure.visible = false; lureLight.intensity = 0;
    if (day > 0.35 || m > 0.45) return;
    const gx = Math.floor(p.x / 60), gy = Math.floor(p.y / 60), r = stream(hash("lure", sim.seed, gx, gy));
    if (r() > 0.7) return;
    const x = gx * 60 + 10 + r() * 40, y = gy * 60 + 10 + r() * 40, d = Math.hypot(x - p.x, y - p.y);
    if (d < 12 || d > 75 || inGlow(sim, x, y)) return;                    // out as you reach it
    lure.visible = true; lure.position.set(x, 0.8, -y);
    lure.scale.set(1, 1 + Math.sin(clock * 11) * 0.12, 1);
    lureLight.position.set(x, 1.2, -y); lureLight.intensity = 5 * smooth(clamp((d - 12) / 6));
  }

  // --- eyes in the trunks -----------------------------------------------------------
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const eyes = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group();
    for (const sx of [-0.14, 0.14]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), eyeMat); e.position.x = sx; g.add(e); }
    g.visible = false; scene.add(g); eyes.push(g);
  }
  function trunkEyes(sim, day, m) {
    const p = sim.player;
    let n = 0;
    if (day < 0.5 && m < 0.55) {
      const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
      for (let i = 0; i < world.trees.length && n < eyes.length; i++) {
        const t = world.trees[i], dx = t.x - p.x, dy = t.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 36 || d2 > 484) continue;
        if (stream(hash("eyes", sim.seed, i))() > 0.03) continue;
        const d = Math.sqrt(d2), look = (dx * fx + dy * fy) / d;
        if (look > 0.97 || inGlow(sim, t.x, t.y)) continue;                   // look straight at them and they are shut
        const g = eyes[n++];
        g.visible = true;
        g.position.set(t.x - (dx / d) * 0.3, 2.3, -(t.y - (dy / d) * 0.3));
        g.rotation.y = Math.atan2(-dx, dy) + Math.PI;
        g.scale.y = Math.max(0.1, Math.abs(Math.sin(clock * 0.7 + i)) > 0.1 ? 1 : 0.1);
      }
    }
    for (; n < eyes.length; n++) eyes[n].visible = false;
  }

  // --- the dead-end trees, the mirage ------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 4, 6), crownGeo = new THREE.ConeGeometry(2, 6, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 }), crownMat = new THREE.MeshLambertMaterial({ color: 0x1f4a2a });
  B.decoys = world.decoys.map((d) => {
    const grove = new THREE.Group();
    d.seal.forEach(([cx, cy], i) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.position.y = 2;
      const cr = new THREE.Mesh(crownGeo, crownMat); cr.position.y = 7;
      t.add(tr, cr);
      t.position.set(cx * CELL + CELL / 2 + (i % 2 ? 0.4 : -0.4), 0, -(cy * CELL + CELL / 2 + (i % 3 - 1) * 0.3));
      grove.add(t);
    });
    grove.scale.setScalar(0.001); grove.visible = false; scene.add(grove);
    const obj = { castle: castleMesh(THREE), chest: chestMesh(THREE), hole: holeMesh(THREE), cabin: cabinMesh(THREE), well: wellMesh(THREE), pylon: pylonLure(THREE), lamp: lampMesh(THREE), stones: stonesMesh(THREE), tent: tentMesh(THREE) };
    for (const o of Object.values(obj)) { o.visible = false; scene.add(o); }
    return { grove, obj, k: 0 };
  });

  function mirage(sim, dt, view) {
    let stretch = 0;
    world.decoys.forEach((d, i) => {
      const D = B.decoys[i], st = sim.mirage?.[d.id];
      const on = !!st && (st.s === "sealed" || st.s === "shown");
      D.k += ((on ? 1 : 0) - D.k) * Math.min(1, dt * (on ? 2.2 : 1.6));
      D.grove.visible = D.k > 0.02; D.grove.scale.setScalar(Math.max(0.001, D.k));
      for (const o of Object.values(D.obj)) o.visible = false;
      if (st && st.s === "shown" && st.obj) {
        const o = D.obj[kindFor(sim, d)];
        o.visible = true; o.position.set(st.obj.x, 0, -st.obj.y);
        o.rotation.y = Math.atan2(sim.player.x - st.obj.x, -(sim.player.y - st.obj.y)) + Math.PI;
        const w = 1 + Math.sin(clock * 3) * 0.015, far = Math.max(1, Math.min(4, (st.dist || 14) / 14));     // it grows as it goes, so it is never lost behind the trunks
        o.scale.set(w * far, far / w, w * far);
        stretch = Math.max(stretch, st.stretch || 0);
      }
    });
    return stretch;
  }

  function update(sim, dt, opts = {}) {
    clock += dt;
    const m = mindLevel(sim), day = daylight(sim.time);
    const amp = calm || sim.tutorial ? 0 : clamp((0.78 - m) / 0.4);
    out.fogMul = 1; out.fovAdd = 0; out.skyTint = 0; out.lightMul = 1;
    if (!sim.tutorial) {
      bendTrees(sim, amp);
      rockFaces(sim, dt, calm ? 1 : m);
      moon(sim, day, calm ? 1 : m);
      lureFire(sim, day, calm ? 1 : m);
      trunkEyes(sim, day, calm ? 1 : m);
      out.fogMul = 1 + amp * 0.3 * Math.sin(clock * 0.7);                // the fog breathes
      out.skyTint = amp * 0.35;
      out.lightMul = 1 - amp * 0.22 * Math.max(0, Math.sin(clock * 13) * Math.sin(clock * 3.1));
      const s = mirage(sim, dt, opts);
      if (!calm) { out.fovAdd = s * 18; out.fogMul *= 1 - s * 0.35; }
    }
    return out;
  }
  return { update, setCalm(v) { calm = !!v; } };
}

// --- the three things the dead end becomes ---------------------------------------------
const mat = (THREE, c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
function castleMesh(THREE) {
  const g = new THREE.Group(), stone = mat(THREE, 0x8a8a92, 0x16161c);
  const keep = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 6), stone); keep.position.y = 4; g.add(keep);
  for (const [x, z] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 12, 8), stone); t.position.set(x, 6, z);
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.5, 8), mat(THREE, 0x7a2a2a, 0x200808)); c.position.set(x, 13.7, z); g.add(t, c);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4), new THREE.MeshBasicMaterial({ color: 0xffc060 })); door.position.set(0, 2, 3.05); g.add(door);
  return g;
}
function chestMesh(THREE) {
  const g = new THREE.Group(), wood = mat(THREE, 0x6b4423, 0x201006);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.5), wood); base.position.y = 0.6;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 10, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.y = 1.2;
  const glow = new THREE.PointLight(0xffd060, 6, 18, 2); glow.position.y = 1.6;
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd060 })); band.position.set(0, 1.0, 0.78);
  g.add(base, lid, glow, band); g.scale.setScalar(1.6);
  return g;
}
function holeMesh(THREE) {
  const g = new THREE.Group();
  const pit = new THREE.Mesh(new THREE.CircleGeometry(3, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.04;
  const rim = new THREE.Mesh(new THREE.RingGeometry(3, 3.7, 20), mat(THREE, 0x3a2e22)); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.05;
  g.add(pit, rim);
  return g;
}

// the rest of what a dead end can become
function cabinMesh(THREE) {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 5), mat(THREE, 0x6b4a2e, 0x140c06)); walls.position.y = 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3, 4), mat(THREE, 0x3b2a20)); roof.rotation.y = Math.PI / 4; roof.position.y = 5.5;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ color: 0xffc060 })); win.position.set(1.8, 2.4, 2.52);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), new THREE.MeshBasicMaterial({ color: 0x1a0f08 })); door.position.set(-1.4, 1.2, 2.52);
  const l = new THREE.PointLight(0xffa850, 6, 20, 2); l.position.set(1.8, 2.4, 4);
  g.add(walls, roof, win, door, l); return g;
}
function wellMesh(THREE) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 1.2, 12, 1, true), mat(THREE, 0x77746c)); ring.position.y = 0.6;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), new THREE.MeshBasicMaterial({ color: 0x6fb4ff })); water.rotation.x = -Math.PI / 2; water.position.y = 0.7;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), mat(THREE, 0x4a3524)); post.position.set(-1.5, 1.5, 0);
  const post2 = post.clone(); post2.position.x = 1.5;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 0.2), mat(THREE, 0x4a3524)); beam.position.y = 3;
  g.add(ring, water, post, post2, beam); g.scale.setScalar(1.8); return g;
}
function pylonLure(THREE) {
  // a pylon, lit blue: the honest instrument lies exactly when it is wanted
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), mat(THREE, 0x6b7079)); col.position.y = 2;
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color: 0x3a8bff })); cr.position.y = 5;
  const l = new THREE.PointLight(0x3a8bff, 6, 22, 2); l.position.y = 5;
  g.add(col, cr, l); g.scale.setScalar(1.6); return g;
}
function lampMesh(THREE) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 5), mat(THREE, 0x222222)); post.position.y = 1.7;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); lamp.position.y = 3.5;
  const l = new THREE.PointLight(0xffd890, 7, 24, 2); l.position.y = 3.5;
  g.add(post, lamp, l); g.scale.setScalar(1.6); return g;
}
function stonesMesh(THREE) {
  const g = new THREE.Group(), m = mat(THREE, 0x8a8a84, 0x101010);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3 + (i % 3) * 0.6, 0.6), m);
    st.position.set(Math.cos(a) * 3.2, 1.6, Math.sin(a) * 3.2); st.rotation.y = -a; st.rotation.z = (i % 2 ? 0.05 : -0.05); g.add(st);
  }
  return g;
}
function tentMesh(THREE) {
  // your own camp, pitched and lit, where you did not pitch it
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 4), mat(THREE, 0xc9b27a, 0x2a2210)); t.rotation.y = Math.PI / 4; t.position.y = 1.3;
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })); f.position.set(3, 0.6, 1);
  const l = new THREE.PointLight(0xff8a3a, 7, 22, 2); l.position.set(3, 1.4, 1);
  g.add(t, f, l); g.scale.setScalar(1.5); return g;
}
