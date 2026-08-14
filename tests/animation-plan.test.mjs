import { describe, expect, it } from 'vitest';
import { planFor, REASONS } from '../scripts/core/animation-plan.js';
import { factsFromRoll } from '../scripts/core/roll-parse.js';
import { FAMILIES, SETTINGS, VERDICTS } from '../scripts/constants.js';
import { itemData, roll } from './fixtures/rolls.mjs';

/** Everything on, so a test that cares about one gate turns off only that one. */
const allOn = {
  [SETTINGS.ENABLED]: true,
  [SETTINGS.ATTACKS]: true,
  [SETTINGS.DAMAGE]: true,
  [SETTINGS.SKILLS]: true,
  [SETTINGS.SANITY]: true,
  [SETTINGS.PLAY_ON_MISS]: true
};

const plan = (r, config = allOn) => planFor(factsFromRoll(r), config);

describe('planFor', () => {
  it('plans a hit on a successful attack, named after the weapon', () => {
    const { plan: result } = plan(roll('weapon', { item: itemData('M4 Carbine'), isSuccess: true }));

    expect(result).toMatchObject({
      family: FAMILIES.ATTACK,
      name: 'M4 Carbine',
      verdict: VERDICTS.HIT,
      hit: true,
      itemId: 'item0000000000000'
    });
  });

  it('plans a miss when misses are animated', () => {
    const { plan: result } = plan(roll('weapon', { item: itemData('M4 Carbine'), isSuccess: false }));

    expect(result).toMatchObject({ verdict: VERDICTS.MISS, hit: false, playOnMiss: true });
  });

  it('refuses a miss when they are not', () => {
    const result = plan(roll('weapon', { item: itemData('M4 Carbine'), isSuccess: false }), {
      ...allOn,
      [SETTINGS.PLAY_ON_MISS]: false
    });

    expect(result).toEqual({ plan: null, reason: REASONS.MISS });
  });

  it('counts a verdictless roll as a hit, not a miss', () => {
    // A damage roll follows an attack that already landed. Treating its absent
    // verdict as a miss would animate the damage flying past the target.
    const { plan: result } = plan(roll('damage', { item: itemData('M4 Carbine'), total: 7 }));

    expect(result).toMatchObject({ verdict: VERDICTS.UNKNOWN, hit: true });
  });

  it.each([
    [FAMILIES.ATTACK, SETTINGS.ATTACKS, roll('weapon', { item: itemData('M4 Carbine') })],
    [FAMILIES.DAMAGE, SETTINGS.DAMAGE, roll('damage', { item: itemData('M4 Carbine') })],
    [FAMILIES.SKILL, SETTINGS.SKILLS, roll('skill', { key: 'first_aid' })],
    [FAMILIES.SANITY, SETTINGS.SANITY, roll('sanity', { key: 'sanity' })]
  ])('gates the %s family behind %s', (family, setting, fixture) => {
    expect(plan(fixture).plan?.family).toBe(family);
    expect(plan(fixture, { ...allOn, [setting]: false })).toEqual({
      plan: null,
      reason: REASONS.FAMILY_DISABLED
    });
  });

  it('never animates a stat or luck roll, however permissive the settings', () => {
    // These have no source, no target and nothing on the canvas to show. An
    // "any roll" animation firing on every STR check is the failure mode.
    expect(plan(roll('stat', { key: 'str' }))).toEqual({ plan: null, reason: REASONS.NEVER_ANIMATED });
    expect(plan(roll('luck', { key: 'luck' }))).toEqual({ plan: null, reason: REASONS.NEVER_ANIMATED });
  });

  it('refuses a roll type the system has grown since the last snapshot', () => {
    expect(planFor({ rollType: 'telepathy' }, allOn)).toEqual({
      plan: null,
      reason: REASONS.UNKNOWN_TYPE
    });
  });

  it('refuses a plain /r in chat', () => {
    expect(planFor({}, allOn)).toEqual({ plan: null, reason: REASONS.NOT_A_ROLL });
  });

  it('refuses a roll with no name to match an Autorec rule against', () => {
    // AA matches by name. With none, the call reaches AA and quietly does
    // nothing — the exact symptom this module is hardest to diagnose from.
    expect(plan(roll('skill', {}))).toEqual({ plan: null, reason: REASONS.NO_NAME });
  });
});
