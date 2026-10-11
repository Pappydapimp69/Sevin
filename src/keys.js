// keys.js — what the controls are CALLED, per input device. Pure; no DOM.
//
// Every instruction that tells the player to press something must name the
// thing they are holding. Text carries {tokens}; the current device fills them
// in at the moment the text is shown, and again if the device changes.
//
// The bindings live in input.js. tests/keys.test.mjs holds the two together.

export const KEYS = Object.freeze({
  keyboard: Object.freeze({
    move: "W A S D",
    look: "the mouse (click the view to take it, Esc to let go)",
    run: "Shift",
    act: "E",
    ask: "Q",
    call: "F",
    camp: "C",
    sleep: "Z",
    pause: "Esc",
    help: "H",
    back: "Esc",
    menu: "the arrow keys and Enter",
    useit: "look at it and press E",
    askthem: "look at them and press Q",
  }),
  gamepad: Object.freeze({
    move: "the left stick",
    look: "the right stick",
    run: "LT",
    act: "A",
    ask: "X",
    call: "Y",
    camp: "LB",
    sleep: "RB",
    pause: "Start",
    help: "View",
    back: "B",
    menu: "the D-pad and A",
    useit: "look at it and press A",
    askthem: "look at them and press X",
  }),
  touch: Object.freeze({
    move: "your left thumb",
    look: "your right thumb",
    run: "pushing the left thumb all the way",
    act: "Use",
    ask: "Ask",
    call: "Call",
    camp: "Camp",
    sleep: "Sleep",
    pause: "☰",
    help: "☰ then Controls",
    back: "Close",
    menu: "tapping",
    useit: "tap it (or face it and press Use)",
    askthem: "tap them (or face them and press Ask)",
  }),
});

// How a key is shown inside a prompt: [E] on a keyboard, (A) on a pad, the
// button's own name on a phone.
export function glyph(token, scheme) {
  const k = (KEYS[scheme] || KEYS.keyboard)[token];
  if (scheme === "gamepad") return `(${k})`;
  if (scheme === "touch") return k;
  return `[${k}]`;
}

/** Fill {token}s for a device. An unknown token stays visible, never blank. */
export function keyed(text, scheme = "keyboard") {
  const k = KEYS[scheme] || KEYS.keyboard;
  return String(text ?? "").replace(/\{(\w+)\}/g, (m, t) => (t in k ? k[t] : m));
}

export const SCHEMES = Object.keys(KEYS);
