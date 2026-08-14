/**
 * Automated Animations is a bundled module with no type definitions and no
 * documented API for the call this bridge makes. If `playAnimation` is renamed
 * or the option keys change, nothing throws — animations simply stop, in a
 * live world, with a green test suite.
 *
 * So the markers are pinned. In CI, against the committed snapshot; on a
 * machine with AA installed, against the installed copy too.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { extractContract, MARKERS, resolveModulePath } from '../tools/aa-contract.mjs';
import { AA_OPTIONS } from '../scripts/aa-adapter.js';

const snapshot = JSON.parse(fs.readFileSync('tests/fixtures/aa-contract.json', 'utf8'));
const modulePath = resolveModulePath();

describe('Automated Animations contract', () => {
  it('has every marker the bridge depends on', () => {
    const missing = Object.entries(snapshot.markers)
      .filter(([, found]) => !found)
      .map(([marker]) => `${marker} (${MARKERS[marker]})`);

    expect(missing).toEqual([]);
  });

  it('pins every option the adapter passes', () => {
    // A key AA does not read is ignored in silence — the animation plays, in
    // the wrong place or on the wrong target.
    const adapter = fs.readFileSync('scripts/aa-adapter.js', 'utf8');
    const start = adapter.indexOf('await playAnimation(');
    expect(start, 'the adapter no longer calls playAnimation').toBeGreaterThan(-1);

    // Bounded at the end of the call. Slicing to end-of-file instead would let
    // an option named anywhere later in the module satisfy the check — which is
    // exactly how an earlier version of this test passed against a typo.
    const call = adapter.slice(start, adapter.indexOf('});', start));

    for (const [option, marker] of Object.entries(AA_OPTIONS)) {
      expect(snapshot.markers, `${option} → ${marker}`).toHaveProperty(marker, true);
      expect(call, option).toContain(`${option}:`);
    }
  });

  it('calls the current entry point, not the deprecated one', () => {
    // AutoAnimations.playAnimation(token, targets, item) takes its arguments in
    // a different order and warns on every use. Confusing the two produces an
    // animation aimed from the target at nobody.
    const adapter = fs.readFileSync('scripts/aa-adapter.js', 'utf8');
    expect(adapter).toContain('AutomatedAnimations?.playAnimation');
    expect(adapter).not.toMatch(/globalThis\.AutoAnimations/);
  });

  it.runIf(modulePath)('matches the installed module', () => {
    const live = extractContract(modulePath);

    expect(
      live.markers,
      `The installed autoanimations ${live.module.version} no longer matches the snapshot taken ` +
        `from ${snapshot.module.version}. Run \`npm run sync:aa\`, read the diff, and fix ` +
        `scripts/aa-adapter.js before committing the snapshot.`
    ).toEqual(snapshot.markers);
  });
});
