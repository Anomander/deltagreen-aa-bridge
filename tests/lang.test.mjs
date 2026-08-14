/**
 * Localisation keys, checked in both directions: a key referenced in code that
 * does not exist renders as raw `DGAA.Something` in the UI, and a key nothing
 * references is dead weight nobody notices.
 *
 * The settings keys are built at runtime as `DGAA.Settings.${key}.Name`, so
 * they are resolved against the SETTINGS enum rather than the source corpus.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS } from '../scripts/constants.js';

const en = JSON.parse(fs.readFileSync('lang/en.json', 'utf8'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const corpus = walk('scripts')
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

const literal = new Set([...corpus.matchAll(/["'`](DGAA\.[A-Za-z0-9_.]+)["'`]/g)].map((m) => m[1]));

const generated = new Set(
  Object.values(SETTINGS).flatMap((key) => [`DGAA.Settings.${key}.Name`, `DGAA.Settings.${key}.Hint`])
);

describe('lang/en.json', () => {
  it('has no empty values', () => {
    expect(Object.entries(en).filter(([, value]) => !String(value).trim())).toEqual([]);
  });

  it('defines every key the code references literally', () => {
    expect([...literal].filter((key) => !(key in en))).toEqual([]);
  });

  it('defines a name and a hint for every setting', () => {
    expect([...generated].filter((key) => !(key in en))).toEqual([]);
  });

  it('has no key nothing references', () => {
    expect(Object.keys(en).filter((key) => !literal.has(key) && !generated.has(key))).toEqual([]);
  });
});
