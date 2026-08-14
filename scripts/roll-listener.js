import { MODULE_ID } from "./constants.js";
import { planFor } from "./core/animation-plan.js";
import { sceneFromMessage } from "./system-adapter.js";
import { play } from "./aa-adapter.js";
import { isDebug, isEnabled, readConfig } from "./settings.js";

/**
 * Animations are driven from chat messages, and only by the message's author.
 *
 * Every client sees the message, so every client would otherwise start the same
 * animation. AA broadcasts through socketlib from whoever calls it, so the one
 * client that rolled is the one that must call.
 */
export function registerRollListener() {
  Hooks.on("createChatMessage", async (message) => {
    if (message.author?.id !== game.user.id) return;
    if (!isEnabled()) return;

    await handleMessage(message);
  });
}

/**
 * Exported for the live-world driver, which needs to replay a message without
 * waiting on the hook.
 *
 * @param {ChatMessage} message
 * @returns {Promise<{played: boolean, reason?: string, plan?: object}>}
 */
export async function handleMessage(message) {
  const scene = sceneFromMessage(message);
  if (!scene) return report(message, { played: false, reason: "no-delta-green-roll" });

  const { plan, reason } = planFor(scene.facts, readConfig());
  if (!plan) return report(message, { played: false, reason, scene });

  Hooks.callAll(`${MODULE_ID}.plan`, plan, scene, message);

  const played = await play(plan, scene);
  return report(message, { played, plan, scene, reason: played ? undefined : "aa-declined" });
}

function report(message, result) {
  if (isDebug()) {
    console.log(`${MODULE_ID} | ${result.played ? "played" : `skipped (${result.reason})`}`, {
      plan: result.plan ?? null,
      facts: result.scene?.facts ?? null,
      item: result.scene?.item?.name ?? null,
      token: result.scene?.token?.name ?? null,
      targets: result.scene?.targets?.map((t) => t.name) ?? [],
      message: message?.id
    });
  }
  return { played: result.played, reason: result.reason, plan: result.plan };
}
