/**
 * Composition root. Registers settings and the one hook, and publishes the API.
 *
 * Delta Green ⇄ Automated Animations: the system fires no roll hook and its
 * chat cards carry no item id, so AA's generic handler finds nothing to
 * animate. This module reads the roll instead, and calls AA directly.
 */

import { AA_ID, FAMILIES, MODULE_ID, SETTINGS, VERDICTS } from "./constants.js";
import { planFor, REASONS } from "./core/animation-plan.js";
import { factsFromRoll } from "./core/roll-parse.js";
import { sceneFromMessage } from "./system-adapter.js";
import { observe, isAutomatedAnimationsActive } from "./aa-adapter.js";
import { handleMessage, registerRollListener } from "./roll-listener.js";
import { readConfig, registerSettings } from "./settings.js";

Hooks.once("init", () => {
  registerSettings();
  registerRollListener();

  const api = {
    MODULE_ID,
    FAMILIES,
    SETTINGS,
    VERDICTS,
    REASONS,
    factsFromRoll,
    sceneFromMessage,
    planFor,
    readConfig,
    handleMessage,
    observe,
    /** What the bridge would do with the last roll in chat, and why. */
    explainLast: () => explain(game.messages.contents.at(-1))
  };

  game.modules.get(MODULE_ID).api = api;
  globalThis.DeltaGreenAABridge = api;

  console.log(`${MODULE_ID} | initialised`);
});

Hooks.once("ready", () => {
  if (game.system.id !== "deltagreen") {
    console.warn(
      `${MODULE_ID} | active system is "${game.system.id}"; this bridge reads "deltagreen" rolls only.`
    );
    return;
  }
  if (!isAutomatedAnimationsActive()) {
    ui.notifications.warn(game.i18n.localize("DGAA.Notifications.AAMissing"));
  }
});

/**
 * Diagnose a single message without animating. The question this answers —
 * "why did nothing happen?" — has half a dozen answers, and the console is
 * where users are asked to look first.
 */
function explain(message) {
  const scene = sceneFromMessage(message);
  if (!scene) return { plan: null, reason: "no-delta-green-roll" };

  const { plan, reason } = planFor(scene.facts, readConfig());
  return {
    plan,
    reason,
    facts: scene.facts,
    item: scene.item?.name ?? null,
    token: scene.token?.name ?? null,
    targets: scene.targets.map((t) => t.name),
    automatedAnimations: game.modules.get(AA_ID)?.version ?? "not installed"
  };
}
