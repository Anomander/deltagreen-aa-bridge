export const MODULE_ID = "deltagreen-aa-bridge";

/** The module this bridge exists to feed. */
export const AA_ID = "autoanimations";

export const SETTINGS = {
  ENABLED: "enabled",
  ATTACKS: "animateAttacks",
  DAMAGE: "animateDamage",
  SKILLS: "animateSkills",
  SANITY: "animateSanity",
  PLAY_ON_MISS: "playOnMiss",
  DEBUG: "debug"
};

/**
 * The families a Delta Green roll can belong to, as far as animation is
 * concerned. These are ours, not the system's — the system's vocabulary is
 * `rollType`, and `core/roll-parse.js` maps one onto the other.
 */
export const FAMILIES = {
  ATTACK: "attack",
  DAMAGE: "damage",
  SKILL: "skill",
  SANITY: "sanity"
};

/** Which setting gates which family. */
export const FAMILY_SETTINGS = {
  [FAMILIES.ATTACK]: SETTINGS.ATTACKS,
  [FAMILIES.DAMAGE]: SETTINGS.DAMAGE,
  [FAMILIES.SKILL]: SETTINGS.SKILLS,
  [FAMILIES.SANITY]: SETTINGS.SANITY
};

/**
 * What a roll's outcome was, where the system has a verdict.
 * A damage roll has none — that is `UNKNOWN`, not a miss.
 */
export const VERDICTS = {
  HIT: "hit",
  MISS: "miss",
  UNKNOWN: "unknown"
};
