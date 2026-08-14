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

### Not yet verified in a live world

Everything above is asserted by the test suite and by static extraction from the installed
`deltagreen` 2.0.1 and `autoanimations` 7.0.22. None of it has been run against a launched
world yet — `npm run fvtt:verify` is the gate before `0.1.0` is tagged.
