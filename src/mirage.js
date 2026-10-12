// mirage.js — the dead-end clearings. Mutates sim.mirage and sim.sealedCells only.
//
// A decoy path (world.js) leads to a small clearing with nothing in it. For a
// mind that is going, it does not stay nothing:
//
//   walk in, deep enough ........ armed (a mind not far enough gone: plain, for good)
//   turn round (face the way out) the way in is gone: trees across it (sealed)
//   turn back (face the dead end) the dead end becomes a castle, a chest, a hole,
//                                 and walking at it only draws it away (shown)
//   turn round again ............ the way in is back (restored)
//   turn back again ............. the mirage is gone, for good, there (gone)
//
// Fixed to place and to the clearing; the object is chosen from the seed; a
// timeout puts the way back whatever happens, so it can never trap anyone.
// Teammates see none of it. Nothing here draws from the run stream.

import { stream, hash } from "./rng.js";
import { mindLevel } from "./phantom.js";
import { inGlow } from "./grove.js";

export const MIRAGE_MIND = 0.7;
export const KINDS = ["castle", "chest", "hole", "cabin", "well", "pylon", "lamp", "stones", "tent"];
const SEAL_HOURS = 10;                   // game hours: it stays a long while, but the way back never stays shut
const GIVE_S = 18;                       // seconds of walking at it before it stops drawing away
const TURN_S = 2;                        // seconds looking back before the way in returns

export const blocked = (st) => !!st && (st.s === "sealed" || st.s === "shown");
export const kindFor = (sim, d) => KINDS[Math.floor(stream(hash("mirage", sim.seed, d.id))() * KINDS.length)];

function setSeal(sim, d, on) {
  for (const [x, y] of d.seal) on ? sim.sealedCells.add(x + "," + y) : sim.sealedCells.delete(x + "," + y);
  sim.fields.clear();
}

// Reached. Each kind leaves something where it stood (side hash): the chest a
// glowing branch, the castle two, a lamp, tent or cabin one and some wood, the rest wood.
function reach(sim, d, st, p) {
  const k = kindFor(sim, d), r = stream(hash("reach", sim.seed, d.id));
  st.s = "gone"; delete st.obj; setSeal(sim, d, false);
  sim.events.push({ kind: "gone" });
  const drop = (glow) => sim.gdrops.push({ id: sim.gdrops.length, truth: glow ? "glow" : "stick", x: p.x + d.inDir.x * (1 + r()), y: p.y + d.inDir.y * (1 + r()), d: 0, taken: false, shown: glow ? "branch" : "stick" });
  const say = (text, kind = "good") => sim.msgs.push({ t: sim.time, text, kind });
  if (k === "chest") { drop(true); say("The lid is real under your hands. Inside, a branch, faintly glowing."); }
  else if (k === "castle") { drop(true); drop(true); say("The gate is open, and there is nothing behind it but the clearing; on the step, two glowing branches."); }
  else if (k === "lamp" || k === "tent" || k === "cabin") { drop(true); drop(false); say("You reach it, and for a moment it is warm. Then it is the clearing again, and something left behind."); }
  else { drop(false); drop(false); say("You reach it, and it is gone; where it stood, deadwood, real enough to carry."); }
}

export function tickMirage(sim, dt, input = {}) {
  const decoys = sim.world.decoys;
  if (!decoys || !decoys.length || sim.tutorial) return;
  const p = sim.player;
  const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
  for (const d of decoys) {
    const st = (sim.mirage[d.id] ||= { s: "idle", stretch: 0 });
    if (st.s === "gone" || st.s === "plain") continue;
    const rx = p.x - d.entrance.x, ry = p.y - d.entrance.y;
    const depth = rx * d.inDir.x + ry * d.inDir.y;                 // metres in along the spur
    const side = Math.abs(rx * -d.inDir.y + ry * d.inDir.x);
    const deep = depth > 15 && depth < 32 && side < 7;
    const f = fx * d.inDir.x + fy * d.inDir.y;                     // +1 looking in, -1 looking out
    switch (st.s) {
      case "idle":
        if (deep) st.s = mindLevel(sim) < MIRAGE_MIND ? "armed" : "plain";
        break;
      case "armed":
        if (!deep && depth < 8) st.s = "idle";                      // walked back out before anything happened
        else if (deep && f < -0.55) { st.s = "sealed"; st.t0 = sim.time; setSeal(sim, d, true); sim.events.push({ kind: "seal" }); }
        break;
      case "sealed":
        if (f > 0.55) {
          st.s = "shown";
          st.obj = { x: d.clearing.x, y: d.clearing.y };                  // the dead end, grown into something, ahead
          st.dist = Math.max(6, Math.hypot(st.obj.x - p.x, st.obj.y - p.y)); st.stretch = 0;
          sim.events.push({ kind: "shown" });
        }
        break;
      case "shown": {
        // Walk at it and it draws away: the distance does not close, so the world
        // seems to stretch. Nothing about your movement changes.
        const o = st.obj, dnow = Math.hypot(o.x - p.x, o.y - p.y);
        if (dnow < 2.5) { reach(sim, d, st, p); break; }
        // in a lit branch's light it holds still
        if (inGlow(sim, o.x, o.y)) { st.dist = dnow; st.stretch = 0; break; }
        // Walk at it long enough and it tires of running: the drawing-away fades over
        // GIVE_S seconds of pressing on, and it never goes past the far side of the clearing.
        const pushing = (input.fwd || 0) > 0.05 && f > 0.3;
        if (pushing) st.push = (st.push || 0) + dt;
        const give = Math.max(0, 1 - (st.push || 0) / GIVE_S);
        const closed = Math.max(0, st.dist - dnow) * give;
        if (closed > 0) { o.x += d.inDir.x * closed * 1.15; o.y += d.inDir.y * closed * 1.15; }
        const far = (d.clearing.x - d.entrance.x) * d.inDir.x + (d.clearing.y - d.entrance.y) * d.inDir.y + d.clearing.r * 0.6;
        const od = (o.x - d.entrance.x) * d.inDir.x + (o.y - d.entrance.y) * d.inDir.y;
        if (od > far) { o.x -= d.inDir.x * (od - far); o.y -= d.inDir.y * (od - far); }
        const nd = Math.hypot(o.x - p.x, o.y - p.y);
        st.dist = Math.min(nd, 80);
        // pressing on counts too: against the wall you still walk, and it still gets further
        const push = pushing ? give : 0;
        const rate = Math.max(push, Math.min(1, closed / Math.max(1e-3, 3.6 * dt)));
        st.stretch += (rate - st.stretch) * Math.min(1, dt * 3);
        // a glance back does not end it; looking back a while does
        st.out = f < -0.55 ? (st.out || 0) + dt : 0;
        if (st.out >= TURN_S) { st.s = "restored"; st.stretch = 0; delete st.obj; setSeal(sim, d, false); sim.events.push({ kind: "restore" }); }
        break;
      }
      case "restored":
        if (deep && f > 0.55) { st.s = "gone"; sim.events.push({ kind: "gone" }); }
        else if (depth < 10) st.s = "plain";                          // left: it will not come again
        break;
    }
    if (blocked(st) && sim.time - (st.t0 ?? sim.time) > SEAL_HOURS) { st.s = "restored"; st.stretch = 0; delete st.obj; setSeal(sim, d, false); }
  }
}
