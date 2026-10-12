// grove-view.js — the golden tree, what falls from it, what is carried home.
// Render layer: reads sim (and grove.js's pure readers), writes neither.

import { treeUp, shadowShape, glowing } from "./grove.js";
import { stream, hash } from "./rng.js";

const SKIN = 0xd8b89a;

export function createGroveView(THREE, scene, camera, picks = [], HIDDEN = null) {
  // generous invisible hit volumes, so a finger can tap the tree and what falls from it
  const hitbox = (r, hgt, pick, owner) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 8), HIDDEN || new THREE.MeshBasicMaterial({ visible: false })); m.position.y = hgt / 2; m.userData.pick = pick; m.userData.owner = owner; owner.add(m); picks.push(m); return m; };
  const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  let tree = null, treeLook = -1;

  function buildTree(sim, look) {
    if (tree) { scene.remove(tree.g); if (tree.hit) picks.splice(picks.indexOf(tree.hit), 1); }
    const r = stream(hash("glook", sim.seed, look));
    const hgt = 4 + r() * 3, lean = (r() - 0.5) * 0.25, crownR = 1.6 + r() * 1.2;
    const hue = 0.11 + r() * 0.05, glowCol = new THREE.Color().setHSL(hue, 0.8, 0.6);
    const g = new THREE.Group();
    const bark = lam(0x8a6a3a, new THREE.Color().setHSL(hue, 0.6, 0.12));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, hgt, 8), bark); trunk.position.y = hgt / 2;
    const canopy = new THREE.Group(); canopy.position.y = hgt;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 10, 8), lam(0x6b8a3a, glowCol.clone().multiplyScalar(0.35)));
    crown.scale.y = 0.75 + r() * 0.3; canopy.add(crown);
    const branches = [];
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.2 + r(), 6), bark);
      const a = (k / 4) * Math.PI * 2 + r() * 0.6;
      b.position.set(Math.cos(a) * 0.9, -0.6, Math.sin(a) * 0.9);
      b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      canopy.add(b); branches.push(b);
    }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshLambertMaterial({ color: 0xb01818, emissive: 0x300000 }));
    fruit.position.set(crownR * 0.5, -crownR * 0.55, 0.3); canopy.add(fruit);
    const light = new THREE.PointLight(glowCol, 3, 16, 2); light.position.y = hgt;
    g.add(trunk, canopy, light);
    g.rotation.z = lean;
    // the shadow: a tree's, or a person's
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    const treeShadow = new THREE.Group();
    { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.7, hgt * 1.6), shadowMat); t.position.z = -hgt * 0.8; t.rotation.x = -Math.PI / 2; treeShadow.add(t);
      const c = new THREE.Mesh(new THREE.CircleGeometry(crownR * 1.3, 14), shadowMat); c.position.z = -hgt * 1.75; c.rotation.x = -Math.PI / 2; treeShadow.add(c); }
    const personShadow = new THREE.Group();
    const pp = (w, l, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), shadowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0, z); personShadow.add(m); return m; };
    pp(0.9, 3.4, 0, -1.9);                             // body
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), shadowMat); head.rotation.x = -Math.PI / 2; head.position.z = -4.1; personShadow.add(head);
    const armL = pp(0.3, 2.2, -0.75, -2.4), armR = pp(0.3, 2.2, 0.75, -2.4);
    armL.rotation.z = 0.25; armR.rotation.z = -0.25;
    for (const s of [treeShadow, personShadow]) { s.position.y = 0.03; s.visible = false; }
    scene.add(g, treeShadow, personShadow);
    const hit = hitbox(1.2, hgt + 2, { kind: "gchop", id: 0 }, g);
    tree = { hit, g, canopy, branches, fruit, light, treeShadow, personShadow, armL, armR, hgt };
  }

  // things on the ground and in camp
  const pool = new Map();
  function itemMesh(kind) {
    const g = new THREE.Group();
    if (kind === "branch") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.4, 6), lam(0x8a6a3a, 0x806020)); m.rotation.z = Math.PI / 2; m.position.y = 0.1; g.add(m); }
    else if (kind === "fruit") { const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lam(0xb01818, 0x300000)); m.position.y = 0.3; g.add(m); }
    else if (kind === "stick") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 5), lam(0x7a5a3a)); m.rotation.z = Math.PI / 2; m.position.y = 0.08; g.add(m); }
    else if (kind === "arm" || kind === "leg") {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(kind === "arm" ? 0.08 : 0.11, kind === "arm" ? 0.1 : 0.14, kind === "arm" ? 0.75 : 0.95, 7), lam(SKIN));
      m.rotation.z = Math.PI / 2; m.position.y = 0.1; g.add(m);
      const cut = new THREE.Mesh(new THREE.CircleGeometry(kind === "arm" ? 0.1 : 0.14, 8), lam(0x6a0a0a)); cut.position.set(kind === "arm" ? 0.38 : 0.48, 0.1, 0); cut.rotation.y = Math.PI / 2; g.add(cut);
    } else if (kind === "head") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lam(SKIN)); m.position.y = 0.22; g.add(m);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x3a2a1a)); hair.position.y = 0.25; g.add(hair);
    } else if (kind === "body") {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.3, 8), lam(0x5a5048)); m.position.y = 0.65; g.add(m);
    }
    scene.add(g);
    return g;
  }
  function item(key, kind, pick) {
    let it = pool.get(key);
    if (!it || it.userData.kind !== kind) {
      if (it) { scene.remove(it); const hb = it.userData.hit; if (hb) picks.splice(picks.indexOf(hb), 1); }
      it = itemMesh(kind); it.userData.kind = kind; pool.set(key, it);
      if (pick) it.userData.hit = hitbox(0.8, 0.9, pick, it);
    }
    it.userData.seen = true;
    return it;
  }

  // in your hands, in front of you
  const held = new THREE.Group();
  { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0xb01818, emissive: 0x300000 }));
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.22), lam(SKIN)); hl.position.set(-0.17, -0.05, 0.02);
    const hr = hl.clone(); hr.position.x = 0.17;
    held.add(f, hl, hr); held.visible = false; scene.add(held); }
  const glowLight = new THREE.PointLight(0xffd070, 0, 14, 2); scene.add(glowLight);

  function update(sim) {
    for (const it of pool.values()) it.userData.seen = false;
    const g = sim.grove, e = g?.enc;
    if (e && treeUp(sim)) {
      if (!tree || treeLook !== g.look) { buildTree(sim, g.look); treeLook = g.look; }
      tree.g.visible = true;
      tree.g.position.set(e.x, 0, -e.y);
      tree.canopy.visible = !e.full;
      tree.branches.forEach((b, k) => (b.visible = k >= g.scars));
      tree.fruit.visible = e.real ? g.fruit : !e.headDown;
      tree.light.intensity = e.full ? 0.6 : 3;
      const sh = shadowShape(sim);
      tree.treeShadow.visible = !!sh && !sh.person; tree.personShadow.visible = !!sh && sh.person;
      if (sh) {
        const s = sh.person ? tree.personShadow : tree.treeShadow;
        s.position.set(e.x, 0.03, -e.y);
        s.rotation.y = Math.atan2(-(e.x - sh.from.x), (e.y - sh.from.y)) + Math.PI;     // cast away from the light
        tree.armL.visible = sh.arms >= 1; tree.armR.visible = sh.arms >= 2;
      }
    } else if (tree) { tree.g.visible = false; tree.treeShadow.visible = false; tree.personShadow.visible = false; }

    for (const it of sim.gdrops || []) {
      if (it.taken) continue;
      const m = item("d" + it.id, it.shown, { kind: "gpick", id: it.id }); m.position.set(it.x, 0, -it.y); m.rotation.y = it.id * 1.7;
    }
    (sim.remains || []).forEach((r, i) => { const m = item("r" + i + r.truth, r.truth); m.position.set(r.x, 0, -r.y); });
    (sim.bodies || []).forEach((b, i) => { const m = item("b" + i, "body"); m.position.set(b.x, 0, -b.y); });
    for (const it of pool.values()) it.visible = it.userData.seen;

    const p = sim.player;
    held.visible = !!p.holding;
    if (held.visible) {
      const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
      held.position.set(camera.position.x + fx * 0.55, camera.position.y - 0.38, camera.position.z - fy * 0.55);
      held.rotation.y = -p.yaw;
    }
    const lit = glowing(sim);
    glowLight.intensity = lit ? 4 : 0;
    if (lit) glowLight.position.set(p.x, 1.3, -p.y);
  }
  return { update };
}
