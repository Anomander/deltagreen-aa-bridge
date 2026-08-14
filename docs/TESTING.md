# TESTING.md — how we know it works

## The problem this strategy solves

This module is a bridge, which means it is nothing but assumptions about two dependencies that
document none of what it depends on.

On one side, the `deltagreen` system publishes no roll hook and writes no outcome into chat
message flags. What it does carry is `roll.options.rollType` and `roll.options.key`, set in
`DGRoll`'s constructor and serialised into the message alongside the roll. That vocabulary is
not versioned, and reading a field that has moved yields `undefined`, not an error.

On the other, Automated Animations ships one bundled file, no type definitions, and no
documented API for the call this module makes. `AutomatedAnimations.playAnimation(token, item,
options)` is assigned to `window` in its source and never mentioned in its wiki. A rename ends
every animation in every world, silently.

A conventional unit suite is blind to both. So four mechanisms answer four different questions:

| Question | Mechanism |
|---|---|
| Is our logic right? | Unit tests, headless |
| Are the seams still intact? | Architecture test |
| Do our assumptions about the two dependencies still hold? | Snapshot-contract tests |
| Does it work in a real world? | Live-world driver |

## Tier 1 — Unit tests

Vitest, `environment: node`. Everything in `scripts/core/` is reachable this way because that
directory touches no Foundry global and no AA global: `roll-parse.js` takes plain roll data and
returns plain data, `animation-plan.js` decides whether and how to animate. The Foundry-facing
half — resolving actors, tokens, items and targets — lives in `scripts/system-adapter.js` and is
verified by the driver instead.

| Suite | Question it answers |
|---|---|
| `roll-parse.test.mjs` | Do we read the right fields, and report absence honestly? |
| `animation-plan.test.mjs` | Does the right roll animate, on the right terms, and only that one? |
| `architecture.test.mjs` | Are the three seams intact? |
| `manifest.test.mjs` | Does `module.json` declare paths that exist and ship in the zip? |
| `lang.test.mjs` | Does every key referenced exist, and every key defined get used? |

Several tests name a specific defect rather than a method:

- *"treats the system null verdict on an unevaluated roll as absence"* — `DGPercentileRoll#isSuccess`
  returns `null`, not `false`, before evaluation. Reading that as a failure makes every bare
  roll a miss.
- *"counts a verdictless roll as a hit, not a miss"* — a damage roll has no success. Treating
  its absent verdict as a miss animates the damage flying past a target the attack already hit.
- *"never animates a stat or luck roll, however permissive the settings"* — the failure mode
  users notice first is an animation on every STR check.
- *"calls the current entry point, not the deprecated one"* — `AutoAnimations.playAnimation(token,
  targets, item)` and `AutomatedAnimations.playAnimation(token, item, options)` differ in
  argument order. Confusing them produces an animation aimed from the target at nobody.

**Tests name the defect, not the method.**

## Tier 2 — The architecture test

Three seams, asserted mechanically in `architecture.test.mjs`, because the same invariants
existed in prose in the sibling modules and were violated anyway:

```
scripts/core/              pure rules — no game, no canvas, no Hooks, no AA
scripts/aa-adapter.js      the only file that knows Automated Animations exists
scripts/system-adapter.js  the only file that reads Delta Green documents
scripts/settings.js        the only file that reads a setting
```

The test behind them, stated as a thought experiment: **delete `aa-adapter.js`, and what is
left is a module that reads Delta Green rolls and decides what should animate** — retargetable
at Sequencer, at another animation module, at anything, without touching a rule.

`bridge.js` is exempt from the first two by role: it is the composition root, and wiring the
two adapters together is its entire job.

## Tier 3 — Snapshot-contract tests

Two undocumented dependencies are pinned this way.

### The roll-type snapshot

Every decision in the module is keyed on the system's `rollType` vocabulary, so that vocabulary
is extracted and committed.

```
  installed deltagreen system
            │
            ▼
   tools/system-rolltypes.mjs        (static text extraction — data-rolltype
            │                         in the sheets, this.type in the classes)
      ┌─────┴─────┐
      ▼           ▼
 sync-rolltypes   rolltype-drift.test.mjs
      │
      ▼
 tests/fixtures/system-rolltypes.json  (committed snapshot)
```

Extraction is static text parsing, not import — the system's modules call Foundry globals at
module scope and cannot be loaded in Node. When the system is installed locally the test
re-extracts and compares; in CI, where it is not, the test asserts against the snapshot alone.
CI stays deterministic while a developer's machine catches drift the day it appears.

The test asserts in both directions: every type the system has must have an answer in
`ROLL_TYPE_FAMILIES`, and we must not answer for a type the system does not have. `null` is an
answer — "never animate this". `undefined` is not.

### The Automated Animations snapshot

`tools/aa-contract.mjs` searches every script AA's own manifest declares for the markers this
bridge depends on:

| Marker | Why it matters |
|---|---|
| `window.AutomatedAnimations` | The global the bridge calls through |
| `playAnimation` | The method it calls |
| `aa.workflow` | The same call as a hook, and the fallback path |
| `AutomatedAnimations-WorkflowStart` | The driver's witness that the call arrived |
| `aa.animationStart` | The driver's witness that a sequence reached the canvas |
| `targets`, `hitTargets`, `playOnMiss` | The options the adapter passes |

Reading the manifest rather than assuming `dist/autoanimations.js` matters: AA has renamed its
bundle before, and a snapshot of a file that no longer exists would report every marker missing
for the wrong reason.

Static text search is crude on purpose — it works on a minified build, needs no browser, and a
rename makes a marker vanish, which is exactly the event worth catching. It **cannot** prove
`playAnimation` still takes `(token, item, options)` in that order. Only `fvtt:verify` can, and
it does.

### When a drift test fails

It is a signal, not a chore. Do not regenerate reflexively.

```bash
npm run sync:rolltypes && git diff tests/fixtures/   # the system changed
npm run sync:aa        && git diff tests/fixtures/   # Automated Animations changed
```

1. **Read the diff.** It states precisely what changed.
2. **Fix the code** — `ROLL_TYPE_FAMILIES` in `scripts/core/roll-parse.js` for a roll type,
   `scripts/aa-adapter.js` for a marker.
3. **Then** commit the regenerated snapshot, in the same commit as the fix.

Set `DG_SYSTEM_PATH` or `AA_MODULE_PATH` if either is installed somewhere non-standard.

## Tier 4 — Live-world verification

> Green tests are not evidence. A feature is done when it has been confirmed in a running world.

`tools/foundry-driver.mjs` logs into a live Foundry with Playwright.

```bash
FOUNDRY_USER=Claude npm run fvtt:probe      # list joinable users
FOUNDRY_USER=Claude npm run fvtt:capture    # roll for real, dump what the bridge reads
FOUNDRY_USER=Claude npm run fvtt:smoke      # prove AA takes the call, exactly once
FOUNDRY_USER=Claude npm run fvtt:verify     # every check, non-zero on failure
HEADED=1 FOUNDRY_USER=Claude npm run fvtt:smoke   # watch it happen
```

**It needs a dedicated GM account.** Foundry disables a user who is already connected, so the
driver cannot share yours. Create a second GM and pass it via `FOUNDRY_USER`. The world must be
**launched** — a Foundry sitting on its setup screen has no `select[name="userid"]`, and the
driver will time out waiting for one.

`capture` is the one that earns its keep on the system side. It rolls every type through the
system's own public API (`createDGRollFromDataset` → `processDGRoll`) and prints, side by side,
the **live** roll and what the bridge reads back out of the **revived** one. The bridge reads
the revived roll — the same object every other client gets — so a field present live and gone
after the round trip is a field it must not depend on. In particular this is how we know
whether `roll.options.item` survives well enough to resolve the weapon back to a live document,
which is what makes the per-item **A-A** button mean anything. Output lands in
`tools/.out/capture.json`.

`smoke` is the one that earns its keep on the AA side. It targets a token, rolls an attack, and
uses AA's own `AutomatedAnimations-WorkflowStart` as the witness — it fires as AA accepts the
call, carrying the data it received and the Autorec rule it matched, or `null` when it matched
none. That distinction is the whole point:

| Workflows | Meaning |
|---|---|
| 0 | The bridge never reached AA. Real failure. |
| 1, `matchedRule: false` | The bridge worked; this world has no animation for that name. |
| 1, `matchedRule: true` | Working end to end. |
| 2+ | Something fires twice — the failure to expect if AA ever grows native `deltagreen` support. |

That last row is why the witness is a count and not a boolean. AA registers its generic
chat-message handler for every unsupported system, including this one; it currently finds no
item in a Delta Green card and does nothing, and this test is what tells us the day that
changes.

`verify` runs all of it plus the argument-order checks, holding the module's settings at a
known baseline so the run cannot depend on how the world happens to be configured, and putting
them back afterwards — including if a check throws. It exits non-zero on any failure.

All three roll in the live world and leave chat messages. None writes to an actor. `smoke` and
`verify` change the user's targeting and restore it.

| Variable | Default |
|---|---|
| `FOUNDRY_URL` | `http://localhost:30000` |
| `FOUNDRY_USER` | first joinable gamemaster |
| `FOUNDRY_PASSWORD` | none |
| `HEADED=1` | headless |

The driver is a development tool: not bundled, not shipped.

## Rules for writing tests

**TEST-1 — Fixtures derive from the system's vocabulary.** `tests/fixtures/rolls.mjs` throws if
a fixture names a roll type the snapshot does not have. A fixture that a system change should
invalidate must break.

**TEST-2 — The drift tests keep passing.** Never delete or skip one to get green.

**TEST-3 — No production branch exists only for tests.** No `typeof game !== 'undefined'` in
`scripts/`. The seam is the `scripts/core/` boundary: pure rules in, lookups out.

**TEST-4 — A fix lands with a test proven to fail first.** Write it, watch it fail for the
right reason, then fix.

**TEST-5 — The core is testable headless.** No Foundry, no AA, no DOM. A core module that needs
a global is misusing the seam, and `architecture.test.mjs` says so.

## What is deliberately not unit-tested

**Automated Animations itself.** Mocking enough of AA to assert a sequence was built would test
the mock. Whether the call arrived, with what, and whether anything reached the canvas are
live-world questions, and `fvtt:smoke` answers them.

**Anything the system owns.** Roll evaluation, success, criticality, chat cards, dialogs. This
module is not a rules engine — where the system offers a verdict it is read, never recomputed.
`verdictFor` carries a fallback that mirrors the system's own rule for rolls that revive
without one, and it must never disagree.

## CI

`.github/workflows/test.yml` runs `npm test` on push and PR to `main`. `release.yml` runs it
again before it will build a release — a failing suite cannot ship. Neither the system nor AA
is installed in CI, so both drift tests assert against their committed snapshots there; drift
itself is caught on a developer's machine, where both are present.
