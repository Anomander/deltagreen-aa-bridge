/**
 * Everything that can be decided about a Delta Green roll without Foundry.
 *
 * No `game`, no `canvas`, no `Roll` — this file takes plain data and returns
 * plain data, so the family and verdict rules are unit-testable headless. The
 * Foundry-facing half lives in ../system-adapter.js, and Automated Animations
 * is not visible from here at all.
 */

import { FAMILIES, VERDICTS } from "../constants.js";

/**
 * How the system's own `rollType` vocabulary maps onto animation families.
 *
 * The keys are the values the system puts in `roll.options.rollType`, which it
 * reads from `data-rolltype` on its sheets (see `createDGRollFromDataset` in
 * `systems/deltagreen/module/roll/roll.js`). `tests/rolltype-drift.test.mjs`
 * fails if the system grows a type this table does not answer for.
 *
 * `null` means "never animate": a stat or luck check is not a thing that
 * happens on the canvas, and an animation for one would fire on every
 * initiative-adjacent click.
 */
export const ROLL_TYPE_FAMILIES = {
  weapon: FAMILIES.ATTACK,
  damage: FAMILIES.DAMAGE,
  lethality: FAMILIES.DAMAGE,
  "damage-or-lethality": FAMILIES.DAMAGE,
  skill: FAMILIES.SKILL,
  "special-training": FAMILIES.SKILL,
  sanity: FAMILIES.SANITY,
  "sanity-damage": FAMILIES.SANITY,
  stat: null,
  luck: null
};

/**
 * A roll, reduced to the fields this module reads.
 *
 * @typedef {object} RollFacts
 * @property {string}  [rollType]     `roll.options.rollType`.
 * @property {string}  [key]          `roll.options.key` — skill or stat key.
 * @property {string}  [itemName]     Name of the item the roll came from.
 * @property {string}  [itemId]       Its id, when the roll carried the item.
 * @property {string}  [actorId]      `roll.options.actor._id`, when carried.
 * @property {string}  [localizedKey] The system's display label, when revived.
 * @property {number}  [total]
 * @property {number}  [target]       Effective target, when the roll has one.
 * @property {boolean} [isSuccess]    The system's own verdict, when available.
 * @property {boolean} [isCritical]   The system's own verdict, when available.
 */

/**
 * Reduce a roll — live or revived from a chat message — to RollFacts.
 *
 * `roll.options` is the only part the system guarantees survives into the
 * message: `DGRoll`'s constructor writes `rollType`, `key`, `actor` and `item`
 * there, and Foundry serialises `options` with the roll. The instance fields
 * (`effectiveTarget`, `isSuccess`) exist only when the roll revived as its own
 * class, so each is read defensively.
 *
 * @param {object} roll
 * @returns {RollFacts}
 */
export function factsFromRoll(roll) {
  const options = roll?.options ?? {};
  const item = options.item ?? roll?.item;
  const actor = options.actor ?? roll?.actor;

  return {
    rollType: options.rollType ?? roll?.type,
    key: options.key ?? roll?.key,
    itemName: stringOrUndefined(item?.name),
    itemId: stringOrUndefined(item?._id ?? item?.id),
    actorId: stringOrUndefined(actor?._id ?? actor?.id),
    localizedKey: stringOrUndefined(roll?.localizedKey),
    total: numberOrUndefined(roll?.total),
    target: numberOrUndefined(roll?.effectiveTarget ?? roll?.target),
    isSuccess: booleanOrUndefined(roll?.isSuccess),
    isCritical: booleanOrUndefined(roll?.isCritical)
  };
}

/**
 * Which animation family this roll belongs to.
 *
 * @param {RollFacts} facts
 * @returns {string|null} one of FAMILIES, or null for "never animate".
 */
export function familyFor(facts) {
  // `undefined` (a type we have never seen) and `null` (a type we deliberately
  // ignore) both answer "no", but only the first should ever reach a user —
  // the drift test exists so it does not.
  return ROLL_TYPE_FAMILIES[facts?.rollType] ?? null;
}

/** True when the roll is one this module has an opinion about at all. */
export function isKnownRollType(facts) {
  return Object.hasOwn(ROLL_TYPE_FAMILIES, facts?.rollType);
}

/**
 * Did the roll hit?
 *
 * The system owns success (`DGPercentileRoll#isSuccess`), so its verdict is
 * used whenever the roll revived far enough to have one. The arithmetic below
 * is the same rule and exists only for the case where it did not — it must
 * never disagree.
 *
 * A roll with no notion of success — damage, sanity damage — is `UNKNOWN`.
 * Reading that as a miss would play every miss animation on every damage roll.
 *
 * @param {RollFacts} facts
 * @returns {string} one of VERDICTS
 */
export function verdictFor(facts) {
  const success = facts?.isSuccess ?? computeSuccess(facts);
  if (success === null || success === undefined) return VERDICTS.UNKNOWN;
  return success ? VERDICTS.HIT : VERDICTS.MISS;
}

/**
 * The name Automated Animations matches its Autorec rules against.
 *
 * Item name first: an attack roll's useful identity is the weapon, not the
 * `firearms` skill it is based on. For a roll with no item the system's own
 * label is used, falling back to the raw key (`first_aid`) so there is always
 * something to name a rule after.
 *
 * @param {RollFacts} facts
 * @returns {string}
 */
export function nameFor(facts) {
  return (
    stringOrUndefined(facts?.itemName) ??
    stringOrUndefined(facts?.localizedKey) ??
    stringOrUndefined(facts?.key) ??
    ""
  );
}

/** Mirrors DGPercentileRoll#isSuccess: 100 always fails, otherwise <= target. */
function computeSuccess(facts) {
  const total = facts?.total;
  const target = facts?.target;
  // The system's getters return null for an unevaluated roll — no verdict, not
  // a failure.
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(target)) return null;
  if (total === 100) return false;
  return total <= target;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim().length ? value : undefined;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function booleanOrUndefined(value) {
  return typeof value === "boolean" ? value : undefined;
}
