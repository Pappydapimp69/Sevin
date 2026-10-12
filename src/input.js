// input.js — keyboard, mouse, touch and gamepad, folded into one input state.
// DOM only.
//
// Discrete verbs (act, ask, call, ...) are delivered as callbacks so a press is
// never lost between frames or doubled by a held key. Whatever device was used
// last is the SCHEME, and every on-screen instruction is written for it.
//
// Gamepad, standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT,
// 8 View, 9 Start, 10 L3, 11 R3, 12-15 D-pad up/down/left/right; axes 0/1 left
// stick, 2/3 right stick. Chrome reports nothing until a pad's first press, so
// it is polled every frame, in game and in menus.

export const PAD_GAME = { 0: "act", 3: "call", 4: "camp", 5: "sleep", 9: "pause", 8: "help" };
export const KEY_GAME = { KeyE: "act", Space: "act", KeyF: "call", KeyC: "camp", KeyZ: "sleep", KeyH: "help", Escape: "pause", KeyP: "pause" };
const DEAD = 0.18;

function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return { x: x * k, y: y * k };
}

export function createInput(canvas, verbs, { onScheme, onTap } = {}) {
  const held = new Set();
  const st = {
    yaw: 0, pitch: 0, look: { dx: 0, dy: 0 }, touchMove: { x: 0, y: 0 },
    locked: false, enabled: true, scheme: matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard",
    sens: 1,
  };
  let menu = null;                 // {nav(dx,dy), confirm(), cancel()} while a modal is open

  function setScheme(s) {
    if (st.scheme === s) return;
    st.scheme = s;
    onScheme?.(s);
  }

  // --- keyboard ---------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" && e.target.type === "text")) return;
    setScheme("keyboard");
    if (menu?.any) { e.preventDefault(); if (!e.repeat) menu.any(); return; }
    if (menu) {
      const nav = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
      if (nav) { e.preventDefault(); menu.nav(nav[0], nav[1]); }
      else if (e.code === "Escape") { e.preventDefault(); menu.cancel(); }
      return;
    }
    if (!st.enabled) return;
    held.add(e.code);
    const v = KEY_GAME[e.code];
    if (v === "call") { e.preventDefault(); if (!e.repeat) callStart = performance.now(); }
    else if (v && !e.repeat) { e.preventDefault(); verbs(v); }
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  });
  let callStart = null;       // the whistle fires on release: a tap is short, a hold is long
  window.addEventListener("keyup", (e) => {
    held.delete(e.code);
    if (KEY_GAME[e.code] === "call" && callStart != null) { const d = (performance.now() - callStart) / 1000; callStart = null; if (st.enabled) verbs("call", d); }
  });
  window.addEventListener("blur", () => held.clear());

  // --- mouse ------------------------------------------------------------------
  canvas.addEventListener("click", () => {
    if (st.enabled && !st.locked && st.scheme !== "touch") canvas.requestPointerLock?.();
  });
  document.addEventListener("pointerlockchange", () => { st.locked = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!st.locked || !st.enabled) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0) setScheme("keyboard");
    st.look.dx += e.movementX; st.look.dy += e.movementY;
  });

  // --- touch: left half moves, right half looks -------------------------------
  const touches = new Map();
  window.addEventListener("touchstart", () => setScheme("touch"), { passive: true });
  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) touches.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, left: t.clientX < window.innerWidth / 2, t0: performance.now() });
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (!s.left) { st.look.dx += (t.clientX - s.x) * 2.2; st.look.dy += (t.clientY - s.y) * 2.2; }
      s.x = t.clientX; s.y = t.clientY;
      if (s.left) {
        st.touchMove.x = Math.max(-1, Math.min(1, (s.x - s.x0) / 60));
        st.touchMove.y = Math.max(-1, Math.min(1, (s.y - s.y0) / 60));
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (s?.left) st.touchMove = { x: 0, y: 0 };
      touches.delete(t.identifier);
      // a short, still touch is a TAP: on the thing under the finger
      if (s && e.type === "touchend" && st.enabled && performance.now() - s.t0 < 350 && Math.hypot(t.clientX - s.x0, t.clientY - s.y0) < 14) onTap?.(t.clientX, t.clientY);
    }
  };
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);

  // --- gamepad ----------------------------------------------------------------
  // Sampled on its own 60 Hz timer, not per rendered frame: a quick tap must
  // not fall between two slow frames. Presses dispatch at once, the way key
  // events do; the sticks are kept for read() to pick up.
  let prev = [];
  let padCall = null;
  let stickHeld = false;
  let sticks = null;
  function pad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    return pads.find((p) => p && p.connected) || null;
  }
  function sample() {
    const p = pad();
    if (!p) { prev = []; sticks = null; return; }
    const now = p.buttons.map((b) => !!(b && (b.pressed || b.value > 0.5)));
    const edge = now.map((x, i) => x && !prev[i]);
    prev = now;
    const L = stick(p.axes[0] || 0, p.axes[1] || 0), R = stick(p.axes[2] || 0, p.axes[3] || 0);
    if (L.x || L.y || R.x || R.y || now.some(Boolean)) setScheme("gamepad");
    sticks = { x: L.x, y: L.y, rx: R.x, ry: R.y, run: now[6] || now[10] };

    if (menu?.any) { if (edge.some(Boolean)) menu.any(); return; }
    if (menu) {
      const mag = Math.max(Math.abs(L.x), Math.abs(L.y));
      let dir = null;
      if (mag > 0.6 && !stickHeld) { stickHeld = true; dir = Math.abs(L.x) > Math.abs(L.y) ? [Math.sign(L.x), 0] : [0, Math.sign(L.y)]; }
      else if (mag < 0.3) stickHeld = false;
      if (edge[12]) dir = [0, -1];
      if (edge[13]) dir = [0, 1];
      if (edge[14]) dir = [-1, 0];
      if (edge[15]) dir = [1, 0];
      if (dir) menu.nav(dir[0], dir[1]);
      if (edge[0]) menu.confirm();
      if (edge[1] || edge[9]) menu.cancel();
      return;
    }
    if (!st.enabled) return;
    for (const [i, v] of Object.entries(PAD_GAME)) if (edge[i] && v !== "call") { verbs(v); if (menu) break; }
    if (edge[3]) padCall = performance.now();
    if (!now[3] && padCall != null) { const d = (performance.now() - padCall) / 1000; padCall = null; verbs("call", d); }
  }
  setInterval(sample, 16);
  function pollPad() { return menu || !st.enabled ? null : sticks; }

  /** Read this frame's movement. Look accumulates into yaw/pitch. */
  function read(dt) {
    const p = pollPad();
    const k = (c) => held.has(c);
    let fwd = 0, side = 0, run = false;
    if (st.enabled) {
      if (k("KeyW") || k("ArrowUp")) fwd += 1;
      if (k("KeyS") || k("ArrowDown")) fwd -= 1;
      if (k("KeyD")) side += 1;
      if (k("KeyA")) side -= 1;
      if (k("ArrowLeft")) st.yaw -= 2.2 * dt;
      if (k("ArrowRight")) st.yaw += 2.2 * dt;
      run = k("ShiftLeft") || k("ShiftRight");
      fwd -= st.touchMove.y; side += st.touchMove.x;
      if (Math.hypot(st.touchMove.x, st.touchMove.y) > 0.95) run = true;
      if (p) {
        fwd -= p.y; side += p.x; run = run || p.run;
        // a stick is a RATE, so it turns by time, not by frame
        st.yaw += p.rx * 2.8 * st.sens * dt;
        st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - p.ry * 1.8 * st.sens * dt));
      }
      const s = 0.0024 * st.sens;
      st.yaw += st.look.dx * s;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - st.look.dy * s));
    }
    st.look.dx = 0; st.look.dy = 0;
    return { fwd, side, sprint: run, yaw: st.yaw, pitch: st.pitch };
  }

  /** Kept for the frame loop; the pad now samples itself. */
  function pollMenu() {}

  function setEnabled(on) {
    st.enabled = on;
    if (!on) { held.clear(); st.touchMove = { x: 0, y: 0 }; if (document.pointerLockElement) document.exitPointerLock(); }
  }
  function setMenu(m) { menu = m; prev = prev.map(() => true); }   // a held A does not click the new menu

  return { read, pollMenu, setEnabled, setMenu, setScheme, state: st, held };
}
