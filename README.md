# Delta Green — Automated Animations Bridge

A Foundry VTT module that teaches [Automated Animations](https://github.com/theripper93/autoanimations)
to read [Delta Green](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system) rolls.

Roll a firearms attack; the shot flies from your Agent to the target, or past them on a miss.
No macros, no chat-card hacking.

## Why a bridge is needed

Automated Animations supports a system either natively or through its generic chat-message
handler, which digs an item id out of the card's HTML. Delta Green defeats both:

- The system fires **no roll hook**.
- `flags.deltagreen` on a chat message carries only `chatCard: true` — no item, no outcome.
- Its chat card (`templates/chat/dg-chat-card.hbs`) carries **no `data-item-id`**.

So AA's generic handler finds nothing and does nothing. What the system *does* put in the
message is the roll itself: `DGRoll`'s constructor writes `rollType`, `key`, `actor` and `item`
into `roll.options`, and Foundry serialises those alongside the roll. This bridge reads that,
resolves the live token, weapon and targets, and hands them to AA.

## Requirements

| | |
|---|---|
| Foundry VTT | v13+, verified on v14 |
| System | `deltagreen` 2.0.0+ |
| Required module | [Automated Animations](https://github.com/theripper93/autoanimations) 7.0.0+ |
| Recommended | [JB2A](https://github.com/Jules-Bens-Aa/JB2A_DnD5e) — the animation library AA's presets are built from |

## Usage

1. Install and enable this module alongside Automated Animations.
2. Tell AA what to play. Either works, and both are AA's own UI, not this module's:
   - **Per weapon** — open a weapon's item sheet and click the **A-A** (biohazard) header
     button. AA already offers this on any system; the bridge is what makes it fire. (The
     weapon resolves back to its live document, which is what makes per-item settings apply —
     confirmed in a live world, not assumed.)
   - **By name** — an Autorec rule matching the weapon or skill name, in AA's
     **Automatic Recognition Menu**.
3. Target something and roll an attack from the character sheet.

Nothing here changes how Delta Green's dice work. The bridge reads rolls; it never makes one.

### Settings

| Setting | Default | |
|---|---|---|
| Enable the bridge | on | Stop feeding rolls to AA without disabling either module. |
| Animate attack rolls | **on** | The one roll with a source, a target and a verdict. |
| Animate damage rolls | off | With attacks also on, one attack plays two animations. |
| Animate skill rolls | off | Needs an Autorec rule named after the skill. |
| Animate SAN rolls | off | Needs an Autorec rule named after the check. |
| Animate misses | on | On a failed attack, AA's miss animation — the shot goes past. |
| Log every roll | off | The first thing to turn on when nothing plays. |

Stat and Luck rolls are **never** animated, at any setting. They have no source, no target and
nothing to show on the canvas, and an animation on every STR check is the failure mode this
module most wants to avoid.

## Troubleshooting

Turn on **Log every roll**. Every Delta Green roll is then printed with the facts read from it,
the plan derived, and — when nothing plays — the reason:

| Reason | What it means |
|---|---|
| `no-delta-green-roll` | The message carried no roll, or not one of the system's. |
| `unrecognised-roll-type` | The system has grown a roll type this module predates. Please file it. |
| `roll-type-is-never-animated` | A stat or luck roll. Working as intended. |
| `family-disabled-in-settings` | That family's setting is off. |
| `roll-missed-and-play-on-miss-is-off` | Working as intended. |
| `no-name-to-match-an-autorec-rule-against` | The roll carried neither an item nor a label. |

For a one-off answer about the last roll in chat, without rolling again:

```js
DeltaGreenAABridge.explainLast()
```

If the plan is right and *still* nothing appears, the bridge has done its job and AA has no
animation configured for that name — see step 2 above.

## API

```js
const bridge = game.modules.get("deltagreen-aa-bridge").api;

bridge.explainLast();            // what the bridge would do with the last roll, and why
bridge.planFor(facts, config);   // the pure decision
bridge.sceneFromMessage(msg);    // token, item, targets for a chat message
bridge.observe();                // watch what AA does; call the result to stop and report
```

A hook fires for every animation the bridge decides on, before AA is called:

```js
Hooks.on("deltagreen-aa-bridge.plan", (plan, scene, message) => {
  console.log(plan.family, plan.name, plan.verdict);
});
```

## Development

No build step — plain ES modules, loaded by Foundry straight from the tree. Symlink the repo
into your Foundry data directory to work on it live:

```sh
ln -s "$PWD" "$HOME/Library/Application Support/FoundryVTT/Data/modules/deltagreen-aa-bridge"
```

```sh
npm install
npm test                                    # unit, architecture and contract tests
npm run sync:rolltypes                      # re-extract the system's roll vocabulary
npm run sync:aa                             # re-extract the Automated Animations contract
FOUNDRY_USER=Claude npm run fvtt:capture    # roll in a live world, dump what the bridge reads
FOUNDRY_USER=Claude npm run fvtt:smoke      # prove AA takes the call, exactly once
FOUNDRY_USER=Claude npm run fvtt:canvas     # borrow an Autorec rule, prove one renders
FOUNDRY_USER=Claude npm run fvtt:verify     # every live check, non-zero on failure
```

The live-world commands drive Foundry with Playwright and need a **dedicated GM account** —
Foundry disables a user who is already connected, so the driver cannot share yours.
See [docs/TESTING.md](docs/TESTING.md) for the full strategy, and
[docs/RELEASE.md](docs/RELEASE.md) for cutting a release.

## Credits

The idea, and the shape of the problem, come from two earlier bridges:
[ds-aa-bridge](https://github.com/stgreenb/ds-aa-bridge) (Draw Steel) and
[Automated Animations for Nimble](https://github.com/MatthieuGA/Automated-Animations-for-Nimble).

## License

MIT. Delta Green is a trademark of the Delta Green Partnership; this module is an unofficial
fan project and ships no game content and no animations.
