/**
 * The only file in this repo that knows Automated Animations exists.
 *
 * AA's entry point for a system it does not support natively is
 * `AutomatedAnimations.playAnimation(sourceToken, item, options)`, assigned to
 * `window` in its `src/index.js`. The same call is reachable as the
 * `aa.workflow` hook, which AA registers as
 * `Hooks.on("aa.workflow", (token, item, options) => playAnimation(...))`.
 * Both are pinned by `tests/aa-contract.test.mjs` against a snapshot taken
 * from an installed copy; when AA renames one, that test fails rather than the
 * world going quiet.
 *
 * The deprecated `AutoAnimations.playAnimation(token, targets, item, options)`
 * — the one the older community bridges call — takes its arguments in a
 * different order and warns on every use. It is not used here.
 */

import { AA_ID, MODULE_ID } from "./constants.js";

/**
 * The options this bridge sets, mapped to the name AA's handler reads them
 * under. The two differ for `targets`, which AA stores as `allTargets` — and
 * that is the marker worth pinning, because "targets" appears in any bundle
 * and would pass the contract test while proving nothing.
 *
 * Note that AA's own doc comment advertises a `reachCheck` option its handler
 * does not read (it reads `data.reach`). Nothing here passes it.
 */
export const AA_OPTIONS = {
  targets: "allTargets",
  hitTargets: "hitTargets",
  playOnMiss: "playOnMiss"
};

export function isAutomatedAnimationsActive() {
  return game.modules.get(AA_ID)?.active === true;
}

/**
 * Automated Animations matches its Autorec rules on `item.name`, and reads
 * per-item overrides from an Item document's flags. When the roll had no item —
 * a skill check, a sanity check — AA accepts a stand-in carrying only a name
 * (documented in its own `system-support/external.js`), which is enough for an
 * Autorec rule and nothing more.
 *
 * @param {string} name
 * @returns {{name: string, flags: object}}
 */
export function pseudoItem(name) {
  return { name, flags: {} };
}

/**
 * Execute a plan.
 *
 * @param {import("./core/animation-plan.js").AnimationPlan} plan
 * @param {{token: Token, item: Item|null, targets: Token[]}} scene
 * @returns {Promise<boolean>} whether the call was made.
 */
export async function play(plan, scene) {
  const playAnimation = globalThis.AutomatedAnimations?.playAnimation;
  if (typeof playAnimation !== "function") {
    console.error(
      `${MODULE_ID} | AutomatedAnimations.playAnimation is not a function. ` +
        `Check the installed ${AA_ID} version against docs/TESTING.md.`
    );
    return false;
  }

  // AA cannot animate what it cannot place. It would bail on its own, but
  // silently, and "no animation" is the symptom this module is hardest to
  // diagnose from.
  if (!scene.token) {
    console.warn(`${MODULE_ID} | no token on this scene for "${plan.name}"; nothing to animate from.`);
    return false;
  }

  await playAnimation(scene.token, scene.item ?? pseudoItem(plan.name), {
    targets: scene.targets,
    // A miss is expressed by naming no target as hit, not by withholding the
    // targets: AA needs them to know where the animation was aimed.
    hitTargets: plan.hit ? scene.targets : [],
    playOnMiss: plan.playOnMiss
  });

  return true;
}

/**
 * Watch what AA does, for as long as the returned function is uncalled.
 *
 * Two witnesses, because "nothing animated" has two quite different causes and
 * the driver has to tell them apart:
 *
 * - `AutomatedAnimations-WorkflowStart` fires as AA takes the call, with the
 *   data it received and the Autorec rule it matched — `null` when it matched
 *   none. A workflow with a null rule means the bridge worked and the world
 *   has no animation configured for that name. No workflow at all means the
 *   bridge never reached AA. Two workflows mean it fired twice.
 * - `aa.animationStart` fires only once a sequence actually reaches the canvas.
 *
 * @returns {() => {workflows: object[], started: number}} stop watching, and report.
 */
export function observe() {
  const workflows = [];
  let started = 0;

  const onWorkflow = Hooks.on("AutomatedAnimations-WorkflowStart", (data, animationData) => {
    workflows.push({
      item: data?.item?.name ?? null,
      token: data?.token?.name ?? null,
      targets: (data?.targets ?? []).length,
      hitTargets: (data?.hitTargets ?? []).length,
      playOnMiss: data?.playOnMiss ?? null,
      matchedRule: Boolean(animationData)
    });
  });
  const onStart = Hooks.on("aa.animationStart", () => {
    started += 1;
  });

  return () => {
    Hooks.off("AutomatedAnimations-WorkflowStart", onWorkflow);
    Hooks.off("aa.animationStart", onStart);
    return { workflows, started };
  };
}
