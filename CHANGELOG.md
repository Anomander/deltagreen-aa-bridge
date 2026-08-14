# Changelog

## Unreleased

- Initial implementation.
- Reads `roll.options` out of Delta Green chat messages — the system fires no roll hook and its
  chat cards carry no item id, so Automated Animations' generic handler finds nothing.
- Resolves the acting token, the live weapon document and the rolling user's targets, and calls
  `AutomatedAnimations.playAnimation(token, item, options)`.
- Hit and miss come from the system's own `isSuccess`; a roll with no verdict counts as a hit,
  never a miss.
- Attack rolls animate by default. Damage, skill and SAN rolls are opt-in. Stat and Luck rolls
  are never animated.
- Snapshot-contract tests pin both undocumented dependencies: the system's roll-type vocabulary
  and Automated Animations' API surface.
- Live-world driver (`fvtt:capture` / `fvtt:smoke` / `fvtt:verify`) with AA's own
  `AutomatedAnimations-WorkflowStart` as the witness, so "the bridge failed" and "this world has
  no animation configured" are told apart.

### Verified in a live world

Foundry 14.363, `deltagreen` 2.0.1, `autoanimations` 7.0.22 — `npm run fvtt:verify`, 12/12:

- A weapon roll survives into the chat message with its `rollType`, and **`roll.options.item`
  carries an `_id` that resolves back to the live Item document** — which is what makes AA's
  per-item **A-A** button apply. `localizedKey`, `isSuccess` and `isCritical` survive too, so
  the system's own verdict is used rather than the arithmetic fallback.
- An attack roll produces **exactly one** AA workflow, carrying the weapon (not a name-only
  stand-in), the acting token, and the target.
- An animation reaches the canvas: with an Autorec rule borrowed for a Delta Green weapon,
  `aa.animationStart` fires and a Sequencer effect renders.
- Stat rolls are refused; skill rolls are refused while their setting is off.

Added `fvtt:canvas` for that last check, and with it two things AA does not document: Autorec
rule ids must be UUIDv4 or AA throws while loading its stores and strands the bad rule in the
setting, and AA rebuilds those stores asynchronously from the setting's `onChange` — rolling
before the rebuild finishes produces no workflow at all, which reads exactly like a broken
bridge.
