/**
 * The system's roll vocabulary is undocumented and unversioned, and reading a
 * field that has moved yields `undefined`, not an error. This test is the
 * tripwire: every type the system has must have an answer in the family table,
 * and the table must not name a type the system does not have.
 *
 * With the system installed it re-extracts and compares, so a developer's
 * machine catches drift the day it appears. In CI, where the system is not
 * installed, it asserts against the committed snapshot alone, so CI stays
 * deterministic.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ROLL_TYPE_FAMILIES } from '../scripts/core/roll-parse.js';
import { extractRollTypes, resolveSystemPath } from '../tools/system-rolltypes.mjs';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/system-rolltypes.json', 'utf8'));
const systemPath = resolveSystemPath();

describe('roll-type vocabulary', () => {
  it('answers for every roll type the system has', () => {
    // `null` is an answer — "never animate this". `undefined` is not.
    const unanswered = snapshot.rollTypes.filter((type) => !Object.hasOwn(ROLL_TYPE_FAMILIES, type));
    expect(unanswered).toEqual([]);
  });

  it('does not answer for a roll type the system does not have', () => {
    const invented = Object.keys(ROLL_TYPE_FAMILIES).filter(
      (type) => !snapshot.rollTypes.includes(type)
    );
    expect(invented).toEqual([]);
  });

  it.runIf(systemPath)('matches the installed system', () => {
    const live = extractRollTypes(systemPath);

    expect(
      live.rollTypes,
      `The installed deltagreen ${live.system.version} no longer matches the snapshot taken from ` +
        `${snapshot.system.version}. Run \`npm run sync:rolltypes\`, read the diff, and answer for ` +
        `any new type in ROLL_TYPE_FAMILIES before committing the snapshot.`
    ).toEqual(snapshot.rollTypes);
  });
});
