# CLAUDE.md — Delta Green ⇄ Automated Animations Bridge

Foundry VTT module (`id: deltagreen-aa-bridge`). It teaches
[Automated Animations](https://github.com/theripper93/autoanimations) to read Delta Green rolls
— and does nothing else.

**Requires** `autoanimations` ≥ 7.0.0, the `deltagreen` system ≥ 2.0.0, and Foundry v13+
(verified v14).

**Read first:** [docs/TESTING.md](docs/TESTING.md) (the four-tier strategy and both drift
tests) and [docs/RELEASE.md](docs/RELEASE.md). The invariants below are the enforceable residue.

---

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full vitest suite: unit, architecture, both contracts. |
| `npm run test:watch` | Watch mode. |
| `npm run sync:rolltypes` | Re-extract the system's roll vocabulary into the snapshot. |
| `npm run sync:aa` | Re-extract the Automated Animations contract into the snapshot. |
| `npm run fvtt:probe` | List joinable users in the running world. |
| `npm run fvtt:capture` | Roll every type live, dump what the bridge reads back. |
| `npm run fvtt:smoke` | Roll an attack, prove AA took the call exactly once. |
| `npm run fvtt:canvas` | Borrow an Autorec rule, prove an animation renders. |
| `npm run fvtt:verify` | Every live check; exits non-zero on failure. |

There is **no build step, no TypeScript, and no linter.** `scripts/**/*.js` is loaded by Foundry
as native ESM directly from the tree — edit, reload, done. The release zip is the tree minus its
tooling.

### Driving a live world

```bash
FOUNDRY_USER=Claude npm run fvtt:capture
FOUNDRY_USER=Claude npm run fvtt:smoke
FOUNDRY_USER=Claude npm run fvtt:canvas
FOUNDRY_USER=Claude npm run fvtt:verify
HEADED=1 FOUNDRY_USER=Claude npm run fvtt:smoke   # watch it
```

It needs a **dedicated GM account** — Foundry disables a user who is already connected, so the
driver cannot share yours — and a **launched world**; a Foundry sitting on its setup screen has
no user select and the driver times out waiting for one. Output lands in `tools/.out/`.

In-world, `DeltaGreenAABridge.explainLast()` reports what the bridge would do with the last
roll in chat, and why.

---

## Why this module exists

Automated Animations supports a system natively or through its generic chat-message handler,
which digs an item id out of the card's HTML. Delta Green defeats both: it fires no roll hook,
`flags.deltagreen` carries only `chatCard: true`, and its chat card carries no `data-item-id`.

What the system does put in the message is the roll. `DGRoll`'s constructor writes `rollType`,
`key`, `actor` and `item` into `roll.options`, and Foundry serialises `options` with the roll.
That is the entire signal this module reads. Everything else follows from it.

---

## Architecture

Three seams. Dependencies point inward: the adapters know about `core/`, `core/` knows about
nobody.

```
scripts/bridge.js           Composition root. Settings, one hook, the API.
scripts/roll-listener.js    createChatMessage → plan → play. Author-only.
scripts/settings.js         The only file that reads a setting.
scripts/system-adapter.js   The only file that reads Delta Green documents.
scripts/aa-adapter.js       The only file that knows AA exists.
scripts/core/roll-parse.js      Pure. Roll → facts, family, verdict, name.
scripts/core/animation-plan.js  Pure. Facts + settings → a plan, or a reason.
```

- **Automated Animations** is reached only through `globalThis.AutomatedAnimations`, only from
  `aa-adapter.js`. Never by importing anything under `modules/autoanimations/` — AA's releases
  have changed that layout.
- **The Delta Green system** is reached only through `system-adapter.js`, and only as documents.
  Nothing imports from `/systems/`.

### The test that keeps this true

> Delete `scripts/aa-adapter.js`. What is left is a module that reads Delta Green rolls and
> decides what should animate — retargetable at any animation module without touching a rule.

Asserted by `tests/architecture.test.mjs`, because these invariants existed in prose in the
sibling modules and were violated anyway. `bridge.js` is exempt from the seams by role: it is
the composition root, and wiring the two adapters together is its entire job.

---

## Invariants

**Architecture** — ARCH-1 `scripts/core/` is pure: no `game`, no `canvas`, no `Hooks`, no `ui`,
no AA. ARCH-2 Only `aa-adapter.js` names Automated Animations (composition root exempt).
ARCH-3 Only `system-adapter.js` resolves Delta Green documents (composition root exempt).
ARCH-4 Only `settings.js` calls `game.settings`; the pure layer receives a plain config object.
ARCH-5 Never mutate a global other than the module's own API handle. ARCH-6 Never import from
`/systems/` or from AA's bundle — both are resolved by Foundry at runtime.

**Deference** — DEF-1 This module reads rolls; it never makes one, never modifies one, and
never touches an actor. DEF-2 Where the system offers a verdict (`isSuccess`, `isCritical`) it
is read, never recomputed; the arithmetic fallback exists only for a roll that revived without
one and must never disagree. DEF-3 AA owns what plays and how it looks — this module chooses
*whether* and hands over *what was rolled*. Never reimplement an AA feature; never ship
animations. DEF-4 AA's own UI is the configuration surface. This module adds no animation
picker.

**Detection** — DET-1 Every field read from a roll is verified against
`systems/deltagreen/module/roll/` and cited in a comment; no speculative `??` chains across
invented shapes. DET-2 Absence is `undefined`, never a default — the system's getters return
`null` for an unevaluated roll, and that is not a failure. DET-3 A roll with no verdict is
`UNKNOWN`, never a miss. DET-4 A roll type the snapshot does not know is refused loudly, not
animated on a guess. DET-5 Only the message's author animates; every client sees the message,
and AA broadcasts from whoever calls it.

**UX** — UX-1 Every setting has a reader and appears in `readConfig()`. UX-2 No hardcoded
user-facing strings. UX-3 Refusals are legible: every path that declines to animate returns a
named reason, and the debug log prints it. "Nothing happened" is the symptom this module is
hardest to diagnose from. UX-4 Speak Delta Green: Agent, Handler, Bond, Lethality, SAN. Never
D&D's vocabulary.

**Testing** — see [docs/TESTING.md](docs/TESTING.md) for TEST-1 … TEST-5.

**Process** — PROC-1 Green tests are not evidence; verify in a live world. PROC-2 Delete dead
code in the commit that orphans it. PROC-3 Update this file in the same commit as an
architecture change. PROC-4 A drift test firing stops work against that dependency until the
diff has been read and answered — never regenerate a snapshot to get green. PROC-5 A feature is
done only when reachable, localised, tested and confirmed in-world.
