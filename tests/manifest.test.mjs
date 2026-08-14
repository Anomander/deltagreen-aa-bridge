import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

describe('module.json', () => {
  it('keeps the id the settings namespace is registered under', () => {
    // Every game.settings call passes MODULE_ID; if the two drift, the module
    // loads and then fails on the first setting read.
    const constants = fs.readFileSync('scripts/constants.js', 'utf8');
    expect(constants).toContain(`export const MODULE_ID = "${manifest.id}"`);
  });

  it('names Automated Animations the same way the adapter looks it up', () => {
    const constants = fs.readFileSync('scripts/constants.js', 'utf8');
    const required = manifest.relationships.requires.map((r) => r.id);

    expect(required).toContain('autoanimations');
    expect(constants).toContain('export const AA_ID = "autoanimations"');
  });

  it('agrees with package.json about the version', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares the system it reads roll data from', () => {
    expect(manifest.relationships.systems.map((s) => s.id)).toContain('deltagreen');
  });

  it('points every declared path at a file that exists', () => {
    const declared = [
      ...manifest.esmodules,
      ...(manifest.styles ?? []).map((s) => (typeof s === 'object' ? s.src : s)),
      ...manifest.languages.map((l) => l.path)
    ];

    for (const file of declared) {
      expect(fs.existsSync(file), file).toBe(true);
    }
  });

  it('ships a manifest URL that resolves to the latest release', () => {
    expect(manifest.manifest).toMatch(/releases\/latest\/download\/module\.json$/);
  });
});

describe('release packaging', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  const zipLine = workflow.split('\n').find((line) => line.includes('zip -r'));

  it('zips every directory the manifest references', () => {
    // A path declared in the manifest but left out of the zip produces a module
    // that installs and then 404s at load — invisible to every other test.
    const dirs = new Set(
      [...manifest.esmodules, ...manifest.languages.map((l) => l.path)].map((p) => p.split('/')[0])
    );

    for (const dir of dirs) {
      expect(zipLine, dir).toContain(dir);
    }
  });

  it('does not ship the development tooling', () => {
    expect(zipLine).not.toContain('tools');
    expect(zipLine).not.toContain('tests');
  });
});
