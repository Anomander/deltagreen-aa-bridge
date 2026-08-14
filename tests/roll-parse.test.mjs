import { describe, expect, it } from 'vitest';
import {
  factsFromRoll,
  familyFor,
  isKnownRollType,
  nameFor,
  verdictFor
} from '../scripts/core/roll-parse.js';
import { FAMILIES, VERDICTS } from '../scripts/constants.js';
import { actorData, itemData, roll } from './fixtures/rolls.mjs';

describe('factsFromRoll', () => {
  it('reads the fields DGRoll writes into options', () => {
    const facts = factsFromRoll(
      roll('weapon', { key: 'firearms', item: itemData('M4 Carbine'), actor: actorData() })
    );

    expect(facts).toMatchObject({
      rollType: 'weapon',
      key: 'firearms',
      itemName: 'M4 Carbine',
      itemId: 'item0000000000000',
      actorId: 'actor000000000000'
    });
  });

  it('reports absence as undefined rather than inventing a shape', () => {
    const facts = factsFromRoll(roll('skill', { key: 'first_aid' }));

    expect(facts.itemName).toBeUndefined();
    expect(facts.itemId).toBeUndefined();
    expect(facts.isSuccess).toBeUndefined();
  });

  it('treats the system null verdict on an unevaluated roll as absence', () => {
    // DGPercentileRoll#isSuccess returns null, not false, before evaluation.
    // Reading that as a failure would make every bare roll a miss.
    const facts = factsFromRoll(roll('weapon', { isSuccess: null, isCritical: null }));

    expect(facts.isSuccess).toBeUndefined();
    expect(facts.isCritical).toBeUndefined();
  });

  it('survives a message with no roll at all', () => {
    expect(factsFromRoll(undefined).rollType).toBeUndefined();
  });
});

describe('familyFor', () => {
  it.each([
    ['weapon', FAMILIES.ATTACK],
    ['damage', FAMILIES.DAMAGE],
    ['lethality', FAMILIES.DAMAGE],
    ['damage-or-lethality', FAMILIES.DAMAGE],
    ['skill', FAMILIES.SKILL],
    ['special-training', FAMILIES.SKILL],
    ['sanity', FAMILIES.SANITY],
    ['sanity-damage', FAMILIES.SANITY]
  ])('maps %s onto %s', (rollType, family) => {
    expect(familyFor(factsFromRoll(roll(rollType)))).toBe(family);
  });

  it.each(['stat', 'luck'])('never animates %s', (rollType) => {
    expect(familyFor(factsFromRoll(roll(rollType)))).toBeNull();
  });

  it('distinguishes a type we ignore from one we have never seen', () => {
    // Both answer "do not animate", but only the second is a bug worth
    // reporting — the drift test exists so it cannot reach a user silently.
    expect(isKnownRollType({ rollType: 'stat' })).toBe(true);
    expect(isKnownRollType({ rollType: 'telepathy' })).toBe(false);
  });
});

describe('verdictFor', () => {
  it("uses the system's own verdict when the roll revived with one", () => {
    expect(verdictFor(factsFromRoll(roll('weapon', { isSuccess: true })))).toBe(VERDICTS.HIT);
    expect(verdictFor(factsFromRoll(roll('weapon', { isSuccess: false })))).toBe(VERDICTS.MISS);
  });

  it('falls back to the same arithmetic when it did not', () => {
    expect(verdictFor(factsFromRoll(roll('weapon', { total: 34, target: 50 })))).toBe(VERDICTS.HIT);
    expect(verdictFor(factsFromRoll(roll('weapon', { total: 71, target: 50 })))).toBe(VERDICTS.MISS);
  });

  it('fails on 100 even against a target that would otherwise cover it', () => {
    // The system's rule for inhuman stats, mirrored. Disagreeing here would
    // animate a hit on the one roll Delta Green guarantees is a disaster.
    expect(verdictFor(factsFromRoll(roll('stat', { total: 100, target: 120 })))).toBe(VERDICTS.MISS);
  });

  it('reports a damage roll as unknown, not as a miss', () => {
    // A damage roll has no success. Reading its absence as a failure would
    // play the miss animation on every one of them.
    expect(verdictFor(factsFromRoll(roll('damage', { total: 7 })))).toBe(VERDICTS.UNKNOWN);
  });

  it('reports an unevaluated roll as unknown', () => {
    expect(verdictFor(factsFromRoll(roll('weapon', { target: 50 })))).toBe(VERDICTS.UNKNOWN);
  });
});

describe('nameFor', () => {
  it('prefers the weapon over the skill it is rolled against', () => {
    const facts = factsFromRoll(
      roll('weapon', { key: 'firearms', localizedKey: 'Firearms', item: itemData('M4 Carbine') })
    );
    expect(nameFor(facts)).toBe('M4 Carbine');
  });

  it("falls back to the system's label, then the raw key", () => {
    expect(nameFor(factsFromRoll(roll('skill', { key: 'first_aid', localizedKey: 'First Aid' })))).toBe(
      'First Aid'
    );
    expect(nameFor(factsFromRoll(roll('skill', { key: 'first_aid' })))).toBe('first_aid');
  });

  it('is empty when there is nothing to name, rather than a blank-ish string', () => {
    expect(nameFor(factsFromRoll(roll('skill', { key: '   ' })))).toBe('');
  });
});
