// tutorial.js — the walk-in at the training camp. Pure; writes only sim.tut.
//
// Each step advances on STATE, not on a button: you have three sticks, the
// fire is lit, the log is through. Walking past a verb teaches nothing.
// Nobody goes under here — a new player cannot tell a taught hallucination
// from a broken game.

import { createRun, CAMP_R } from "./sim.js";

export const TRAINEES = [
  { name: "Orla", skills: { cut: 2, carry: 1, fire: 1 } },
  { name: "Benet", skills: { cut: 1, carry: 2, fire: 0 } },
];

export function createTutorial() {
  const sim = createRun({ seed: 0, tutorial: true, party: TRAINEES });
  for (const m of sim.members) { m.trainee = true; m.task = "camp"; }
  sim.camp.lit = false; sim.camp.pile = 0;
  sim.tut = { step: 0 };
  return sim;
}

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const STEPS = [
  {
    id: "walk", verb: "move",
    text: "Walk up to the camp. Walk with {move}; look with {look}.",
    done: (s) => d(s.player, s.camp) < CAMP_R * 0.6,
  },
  {
    id: "sticks", verb: "act",
    text: "Wood keeps you alive at night. Pick up three sticks around the clearing: {useit}. A ring marks what you will pick up.",
    done: (s) => s.sticks.filter(Boolean).length >= 3,
  },
  {
    id: "pile", verb: "act",
    text: "Walk back into camp. What you carry goes on the woodpile.",
    done: (s) => s.camp.pile >= 3 || s.camp.lit,
  },
  {
    id: "fire", verb: "act",
    text: "Light the fire: stand at the ring of stones and {useit}. A fire only shields the camp itself, and only at night. Light reaches further than safety.",
    done: (s) => s.camp.lit,
  },
  {
    id: "ask", verb: "ask",
    text: "Ask Orla or Benet about today: {askthem}. Out here, what someone remembers is the only evidence there is. Listen for anything that is not how it was.",
    done: (s) => s.stats.asked >= 1,
  },
  {
    id: "call", verb: "call",
    text: "Press {call} to whistle. Anyone who hears it and is not busy whistles back and comes. It takes them a moment.",
    done: (s) => s.members.some((m) => m.task === "follow"),
  },
  {
    id: "chop", verb: "act",
    text: "North of camp a log lies across the trail. Anyone can chop it; more hands are faster. Stand at it and {useit}, then stand still. Time runs fast while you work. Moving stops it.",
    done: (s) => s.deadfalls[0].done >= 1,
  },
  {
    id: "pylon", verb: "act",
    text: "Past the log stands an old pylon, mossed over. A pylon takes two pairs of hands. Bring someone close, then {useit}.",
    done: (s) => s.pylons[0].spent && s.pylons[0].litAt != null,
  },
  {
    id: "strike", verb: "camp",
    text: "Last thing. Go back to camp and take it down: press {camp} there. A camp moves with you, one at a time.",
    done: (s) => !s.camp.up,
  },
  {
    id: "end", verb: null,
    text: "That is the training. Out there, you set everyone's work at dawn, and at dusk you say who keeps watch. Then you sleep ({sleep}). The woods are north. Somebody will not be who they were. You will have to ask.",
    done: () => false,
  },
];

/** Advance past every step whose state is already true. Returns the step. */
export function tutorialStep(sim) {
  if (!sim.tut) return null;
  while (sim.tut.step < STEPS.length - 1 && STEPS[sim.tut.step].done(sim)) sim.tut.step++;
  return STEPS[sim.tut.step];
}
