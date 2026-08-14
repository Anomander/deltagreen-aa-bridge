/**
 * Extract the Automated Animations API surface from an installed copy.
 *
 * Everything this bridge calls, AA documents nowhere: `playAnimation`'s name
 * and argument order, the `aa.workflow` hook, the option keys AA reads off the
 * data object, and the `aa.animationStart` hook the live-world driver uses as
 * its witness. AA ships one bundled file with no type definitions, so none of
 * it is checkable by importing anything.
 *
 * Extraction is static text search against the shipped bundle. That is crude
 * on purpose: it works on a minified build, it needs no browser, and a rename
 * makes a marker disappear — which is precisely the event worth catching. It
 * cannot prove `playAnimation` still takes `(token, item, options)`; only
 * `fvtt:verify` can, and it does.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** The usual places a Foundry data directory lives. */
function candidateDataRoots() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Application Support', 'FoundryVTT', 'Data'),
    path.join(home, '.local', 'share', 'FoundryVTT', 'Data'),
    path.join(home, 'AppData', 'Local', 'FoundryVTT', 'Data'),
    path.join(home, 'foundrydata', 'Data')
  ];
}

/**
 * Locate an installed `autoanimations` module.
 * @param {string} [explicit] - Overrides discovery. Defaults to $AA_MODULE_PATH.
 * @returns {string|null} Absolute path to the module root, or null.
 */
export function resolveModulePath(explicit = process.env.AA_MODULE_PATH) {
  if (explicit) {
    return fs.existsSync(path.join(explicit, 'module.json')) ? explicit : null;
  }

  for (const root of candidateDataRoots()) {
    const candidate = path.join(root, 'modules', 'autoanimations');
    if (fs.existsSync(path.join(candidate, 'module.json'))) return candidate;
  }

  return null;
}

/**
 * The markers, and why each one matters.
 *
 * Losing any of these is a silent failure in a live world — the bridge keeps
 * running and nothing ever animates — so each is asserted rather than probed.
 */
export const MARKERS = {
  'window.AutomatedAnimations': 'the global the bridge calls through',
  playAnimation: 'the method it calls',
  'aa.workflow': 'the hook that is the same call, and our fallback path',
  'AutomatedAnimations-WorkflowStart': "the driver's witness that the call reached AA, and whether a rule matched",
  'aa.animationStart': "the driver's witness that an animation reached the canvas",
  hitTargets: 'how a hit is expressed',
  playOnMiss: 'how a miss is expressed',
  // AA's handler assigns `this.allTargets = data.targets`. Pinning `allTargets`
  // rather than `targets` is deliberate: the latter appears in any bundle and
  // would pass while proving nothing.
  allTargets: 'who the animation is aimed at'
};

/**
 * Read the contract out of an installed AA.
 *
 * @param {string} modulePath
 * @returns {{module: {id: string, version: string}, markers: Record<string, boolean>}}
 */
export function extractContract(modulePath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(modulePath, 'module.json'), 'utf8'));

  // Read every script the manifest declares rather than assuming `dist/`: AA
  // has renamed its bundle before, and a snapshot of a file that no longer
  // exists would report every marker missing for the wrong reason.
  const sources = [...(manifest.esmodules ?? []), ...(manifest.scripts ?? [])]
    .map((relative) => path.join(modulePath, relative))
    .filter((file) => fs.existsSync(file));

  if (!sources.length) {
    throw new Error(`No esmodule declared by ${manifest.id} exists on disk. Is the install complete?`);
  }

  const corpus = sources.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

  return {
    module: { id: manifest.id, version: manifest.version },
    markers: Object.fromEntries(Object.keys(MARKERS).map((marker) => [marker, corpus.includes(marker)]))
  };
}
