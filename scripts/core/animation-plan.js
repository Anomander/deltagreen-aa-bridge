/**
 * The decision: given a roll, does an animation play, and under what terms?
 *
 * Pure. This is the whole of the bridge's judgement, and none of its plumbing —
 * no document resolution, no Automated Animations call. `system-adapter.js`
 * supplies the facts, `aa-adapter.js` executes the plan.
 */

import { FAMILY_SETTINGS, VERDICTS } from "../constants.js";
import { familyFor, isKnownRollType, nameFor, verdictFor } from "./roll-parse.js";

/**
 * What the bridge intends to hand Automated Animations.
 *
 * @typedef {object} AnimationPlan
 * @property {string}  family     One of FAMILIES.
 * @property {string}  name       The name AA matches Autorec rules against.
 * @property {string}  verdict    One of VERDICTS.
 * @property {boolean} playOnMiss Ask AA for its miss animation.
 * @property {boolean} hit        Whether targets count as hit.
 * @property {string}  [itemId]   Item to resolve, when the roll carried one.
 * @property {string}  [actorId]  Its owner, for resolution.
 */

/**
 * Why no animation is planned. Returned rather than logged, so the debug
 * report and the tests can both see it — "nothing happened" is the failure
 * this module is hardest to diagnose from.
 *
 * @typedef {object} AnimationRefusal
 * @property {null}   plan
 * @property {string} reason
 */

export const REASONS = {
  NOT_A_ROLL: "not-a-delta-green-roll",
  UNKNOWN_TYPE: "unrecognised-roll-type",
  NEVER_ANIMATED: "roll-type-is-never-animated",
  FAMILY_DISABLED: "family-disabled-in-settings",
  MISS: "roll-missed-and-play-on-miss-is-off",
  NO_NAME: "no-name-to-match-an-autorec-rule-against"
};

/**
 * @param {import("./roll-parse.js").RollFacts} facts
 * @param {object} config Booleans keyed by SETTINGS, from settings.js.
 * @returns {{plan: AnimationPlan, reason?: undefined}|AnimationRefusal}
 */
export function planFor(facts, config = {}) {
  if (!facts?.rollType) return refuse(REASONS.NOT_A_ROLL);
  if (!isKnownRollType(facts)) return refuse(REASONS.UNKNOWN_TYPE);

  const family = familyFor(facts);
  if (!family) return refuse(REASONS.NEVER_ANIMATED);
  if (!config[FAMILY_SETTINGS[family]]) return refuse(REASONS.FAMILY_DISABLED);

  const name = nameFor(facts);
  // AA matches Autorec rules by name. With nothing to match, the call would
  // reach AA and quietly do nothing; refusing here says so out loud instead.
  if (!name) return refuse(REASONS.NO_NAME);

  const verdict = verdictFor(facts);
  const playOnMiss = Boolean(config.playOnMiss);
  if (verdict === VERDICTS.MISS && !playOnMiss) return refuse(REASONS.MISS);

  return {
    plan: {
      family,
      name,
      verdict,
      // A roll with no verdict — damage, sanity damage — is not a miss. Its
      // targets are hit, because the attack that produced them already landed.
      hit: verdict !== VERDICTS.MISS,
      playOnMiss,
      itemId: facts.itemId,
      actorId: facts.actorId
    }
  };
}

function refuse(reason) {
  return { plan: null, reason };
}
