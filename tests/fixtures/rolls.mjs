/**
 * Roll fixtures, derived from the system's own vocabulary.
 *
 * `roll()` throws on a roll type the snapshot does not have, so a fixture that
 * a system change should invalidate breaks instead of quietly testing a shape
 * the system has never produced (TEST-1).
 */

import fs from 'node:fs';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/system-rolltypes.json', 'utf8'));
export const SYSTEM_ROLL_TYPES = snapshot.rollTypes;

/**
 * A revived roll, shaped as one arrives from a chat message.
 *
 * Only `options` is guaranteed to survive serialisation, so the instance
 * fields are opt-in: pass `isSuccess` to model a roll that revived as its own
 * class, omit it to model one that did not.
 *
 * @param {string} rollType
 * @param {object} [overrides]
 */
export function roll(rollType, overrides = {}) {
  if (!SYSTEM_ROLL_TYPES.includes(rollType)) {
    throw new Error(
      `"${rollType}" is not a roll type the deltagreen system has. ` +
        `Known: ${SYSTEM_ROLL_TYPES.join(', ')}. Run npm run sync:rolltypes.`
    );
  }

  const { key, item, actor, total, target, isSuccess, isCritical, localizedKey } = overrides;

  return {
    options: {
      rollType,
      key,
      ...(item ? { item } : {}),
      ...(actor ? { actor } : {})
    },
    total,
    effectiveTarget: target,
    localizedKey,
    isSuccess,
    isCritical
  };
}

/** The plain-data snapshot of an Item as it survives into `roll.options`. */
export function itemData(name, id = 'item0000000000000') {
  return { _id: id, name, type: 'weapon' };
}

export function actorData(id = 'actor000000000000') {
  return { _id: id, name: 'Agent Wilson', type: 'agent' };
}
