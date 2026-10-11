// input.js — keys, mouse and touch, folded into one input state. DOM only.
// Discrete verbs (act, ask, call, ...) are delivered as callbacks so a press is
// never lost between frames or doubled by a held key.

export function createInput(canvas, verbs) {
  const held = new Set();
  const st = { yaw: 0, pitch: 0, look: { dx: 0, dy: 0 }, touchMove: { x: 0, y: 0 }, locked: false, enabled: true };

  const KEYMAP = { KeyE: "act", Space: "act", KeyQ: "ask", KeyF: "call", KeyC: "camp", KeyZ: "sleep", KeyH: "help", Escape: "pause", KeyP: "pause" };

  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!st.enabled) {
      if (e.code === "Escape") verbs("escape");
      return;
    }
    held.add(e.code);
    const v = KEYMAP[e.code];
    if (v && !e.repeat) { e.preventDefault(); verbs(v); }
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());

  canvas.addEventListener("click", () => {
    if (st.enabled && !st.locked && !matchMedia("(pointer: coarse)").matches) canvas.requestPointerLock?.();
  });
  document.addEventListener("pointerlockchange", () => {
    st.locked = document.pointerLockElement === canvas;
    verbs(st.locked ? "locked" : "unlocked");
  });
  document.addEventListener("mousemove", (e) => {
    if (!st.locked || !st.enabled) return;
    st.look.dx += e.movementX; st.look.dy += e.movementY;
  });

  // --- touch: left half moves, right half looks -----------------------------
  const touches = new Map();
  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) touches.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, left: t.clientX < window.innerWidth / 2 });
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (!s) continue;
      if (!s.left) { st.look.dx += (t.clientX - s.x) * 2.2; st.look.dy += (t.clientY - s.y) * 2.2; }
      s.x = t.clientX; s.y = t.clientY;
      if (s.left) {
        const k = 60;
        st.touchMove.x = Math.max(-1, Math.min(1, (s.x - s.x0) / k));
        st.touchMove.y = Math.max(-1, Math.min(1, (s.y - s.y0) / k));
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier);
      if (s?.left) st.touchMove = { x: 0, y: 0 };
      touches.delete(t.identifier);
    }
  };
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);

  /** Read this frame's movement. Look accumulates into yaw/pitch. */
  function read(dt) {
    const k = (c) => held.has(c);
    let fwd = 0, side = 0;
    if (st.enabled) {
      if (k("KeyW") || k("ArrowUp")) fwd += 1;
      if (k("KeyS") || k("ArrowDown")) fwd -= 1;
      if (k("KeyD")) side += 1;
      if (k("KeyA")) side -= 1;
      if (k("ArrowLeft")) st.yaw -= 2.2 * dt;
      if (k("ArrowRight")) st.yaw += 2.2 * dt;
      fwd -= st.touchMove.y; side += st.touchMove.x;
      st.yaw += st.look.dx * 0.0024;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - st.look.dy * 0.0024));
    }
    st.look.dx = 0; st.look.dy = 0;
    return { fwd, side, sprint: k("ShiftLeft") || k("ShiftRight"), yaw: st.yaw, pitch: st.pitch };
  }

  function setEnabled(on) {
    st.enabled = on;
    if (!on) { held.clear(); st.touchMove = { x: 0, y: 0 }; if (document.pointerLockElement) document.exitPointerLock(); }
  }

  return { read, setEnabled, state: st, held };
}
