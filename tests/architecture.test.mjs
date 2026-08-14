/**
 * Three seams, asserted mechanically, because they existed in prose in the
 * sibling modules and were violated anyway.
 *
 *   scripts/core/      pure rules — no Foundry, no AA, no documents
 *   scripts/aa-adapter.js      the only file that knows AA exists
 *   scripts/system-adapter.js  the only file that reads Delta Green documents
 *
 * The test behind them: delete `aa-adapter.js`, and what is left is a module
 * that reads Delta Green rolls and decides what should animate — retargetable
 * at any animation module without touching a rule.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const scripts = walk('scripts');
const read = (file) => fs.readFileSync(file, 'utf8');

describe('scripts/core is headless', () => {
  const core = scripts.filter((file) => file.includes(`core${path.sep}`));

  it('has files to check', () => {
    expect(core.length).toBeGreaterThan(0);
  });

  it.each([['game.'], ['canvas.'], ['Hooks.'], ['ui.'], ['AutomatedAnimations'], ['fromUuid']])(
    'never touches %s',
    (global) => {
      expect(core.filter((file) => read(file).includes(global))).toEqual([]);
    }
  );

  it('imports only from core and constants', () => {
    for (const file of core) {
      const imports = [...read(file).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const specifier of imports) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\.?\/(constants\.js|[a-z-]+\.js)$/);
      }
    }
  });
});

describe('the Automated Animations seam', () => {
  it('is the only file that names AA', () => {
    // The composition root is exempt by role: naming the module it wires in is
    // its entire job, and a startup warning that could not say which module was
    // missing would be useless.
    const exempt = ['scripts/aa-adapter.js', 'scripts/bridge.js'].map((p) => p.split('/').join(path.sep));

    const offenders = scripts
      .filter((file) => !exempt.includes(file))
      .filter((file) => /AutomatedAnimations|AutoAnimations|\baa\.\w+["']/.test(read(file)));

    expect(offenders).toEqual([]);
  });

  it('reaches AA through the global, never by importing its bundle', () => {
    // Importing from /modules/autoanimations/ would bind this module to AA's
    // file layout, which its releases have changed before.
    expect(scripts.filter((file) => read(file).includes('modules/autoanimations'))).toEqual([]);
  });
});

describe('the Delta Green seam', () => {
  it('is the only file that resolves documents', () => {
    const exempt = ['scripts/system-adapter.js', 'scripts/bridge.js'].map((p) =>
      p.split('/').join(path.sep)
    );

    const offenders = scripts
      .filter((file) => !exempt.includes(file))
      .filter((file) => /game\.(actors|scenes|users|messages)|canvas\.tokens/.test(read(file)));

    expect(offenders).toEqual([]);
  });

  it('never imports from the system, which Foundry resolves at runtime', () => {
    expect(scripts.filter((file) => read(file).includes('/systems/'))).toEqual([]);
  });
});

describe('settings', () => {
  it('are read in one place', () => {
    // A `game.settings.get` outside settings.js is a setting with no reader in
    // the config object, which the pure layer then silently treats as `false`.
    const offenders = scripts
      .filter((file) => !file.endsWith('settings.js'))
      .filter((file) => read(file).includes('game.settings.'));

    expect(offenders).toEqual([]);
  });
});
