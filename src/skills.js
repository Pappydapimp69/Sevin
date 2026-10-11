// skills.js — the skills a person can have, and what each one is FOR. Pure.
//
// One list, read by the sim (what they do), the recruit and plan screens (what
// they say), and the tests (that none is dead). A skill nobody uses is worse
// than none: points put into it are wasted, and nothing says so.

export const SKILLS = Object.freeze(["cut", "carry", "fire", "build", "watch"]);

export const SKILL_LABEL = Object.freeze({
  cut: "Cutting", carry: "Carrying", fire: "Firecraft", build: "Building", watch: "Watchfulness",
});

// What each does in play. The numbers live next to the code that uses them:
// chopRate +18%/level, hauls (woodPerChop) and what the team can carry when
// moving camp, burnHours +20%/level, camp work +15%/level, and the night's
// take chance and who it takes (night.js).
export const SKILL_WHAT = Object.freeze({
  cut: "Chops through a deadfall faster. Deadfalls block the trail north.",
  carry: "More of the woodpile carried when you move camp.",
  fire: "Makes each stick they put on the fire burn longer. A watch who knows fires gets through the night on less wood.",
  build: "Puts the camp up, and takes it down, faster.",
  watch: "On watch at night, makes it less likely the night takes anyone, and less likely to take them.",
});

// The skill a dawn task leans on. "with you" lends a hand to whatever YOU are
// doing, so it has none of its own. The watch is set at dusk, not dawn.
export const TASK_SKILL = Object.freeze({ chop: "cut", gather: "carry", pitch: "build", camp: "fire", follow: null, auto: null });
export const WATCH_SKILL = "watch";

export const blankSkills = () => Object.fromEntries(SKILLS.map((k) => [k, 0]));
/** Whatever skills a person has, with the rest at 0 (an old save, a short list). */
export const fillSkills = (s = {}) => Object.fromEntries(SKILLS.map((k) => [k, Number.isFinite(s[k]) ? s[k] : 0]));
export const totalPoints = (s) => SKILLS.reduce((n, k) => n + (s[k] || 0), 0);

/**
 * Team presets (Seven's team select: pick a kind of team, not a spreadsheet).
 * Each is two skills; the five people take them in turn, two points each, so
 * ten points in all: the first, third and fifth lean one way, the second and
 * fourth the other. "Balanced" gives each person a different one of the five.
 */
export const TEAMS = Object.freeze([
  { id: "clearers", title: "Clearers", skills: ["cut", "carry"], note: "Deadfalls come down faster" },
  { id: "campers", title: "Campers", skills: ["build", "fire"], note: "Camp goes up fast, wood lasts" },
  { id: "wardens", title: "Wardens", skills: ["watch", "fire"], note: "The night takes fewer" },
  { id: "balanced", title: "Balanced", skills: SKILLS.slice(), detail: "one of each", note: "A little of everything" },
]);
export const DEFAULT_TEAM = "clearers";

/** The five people's skills for a preset. */
export function teamSkills(id, n = 5) {
  const t = TEAMS.find((x) => x.id === id) || TEAMS[0];
  return Array.from({ length: n }, (_, i) => ({ ...blankSkills(), [t.skills[i % t.skills.length]]: 2 }));
}
/** What each person is best at in a preset, for the roster line. */
export const teamFocus = (id, i) => { const t = TEAMS.find((x) => x.id === id) || TEAMS[0]; return t.skills[i % t.skills.length]; };
