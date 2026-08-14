/**
 * Re-extract the Automated Animations contract into the committed snapshot.
 *
 *   npm run sync:aa && git diff tests/fixtures/
 *
 * Run it on an AA upgrade. A marker that flipped to false is a rename, and the
 * fix belongs in scripts/aa-adapter.js in the same commit as the new snapshot.
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractContract, resolveModulePath } from './aa-contract.mjs';

const modulePath = resolveModulePath();
if (!modulePath) {
  console.error('No installed `autoanimations` module found. Set AA_MODULE_PATH.');
  process.exit(1);
}

const snapshot = extractContract(modulePath);
const target = path.join('tests', 'fixtures', 'aa-contract.json');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);

const missing = Object.entries(snapshot.markers).filter(([, found]) => !found);

console.log(`Wrote ${target} from ${modulePath}`);
console.log(`  ${snapshot.module.id} ${snapshot.module.version}`);
for (const [marker, found] of Object.entries(snapshot.markers)) {
  console.log(`  ${found ? '✓' : '✗'} ${marker}`);
}

if (missing.length) {
  console.error(`\n${missing.length} marker(s) missing — the bridge calls an API this AA no longer has.`);
  process.exit(1);
}
