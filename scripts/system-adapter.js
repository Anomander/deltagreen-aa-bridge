/**
 * The Foundry-facing half: turn a chat message into documents.
 *
 * The `deltagreen` system publishes no roll hook and writes no outcome into
 * chat message flags — `flags.deltagreen` carries only `chatCard: true`, and
 * its card template (`templates/chat/dg-chat-card.hbs`) carries no
 * `data-item-id`. So the message's *roll* is the only signal, which is exactly
 * why Automated Animations' generic chat-message handler finds nothing here
 * and this bridge exists.
 *
 * This is the only file that reads Delta Green or Foundry documents. It knows
 * nothing about Automated Animations.
 */

import { factsFromRoll } from "./core/roll-parse.js";

/**
 * @typedef {object} RollScene
 * @property {import("./core/roll-parse.js").RollFacts} facts
 * @property {Actor|null}  actor
 * @property {Token|null}  token   Placeable on the current canvas — AA animates placeables.
 * @property {Item|null}   item    The real Item document, when the roll carried one.
 * @property {Token[]}     targets Targets held by the *rolling* user.
 * @property {Roll}        roll
 */

/**
 * @param {ChatMessage} message
 * @returns {RollScene|null} null when the message carries no Delta Green roll.
 */
export function sceneFromMessage(message) {
  const roll = message?.rolls?.[0];
  if (!roll) return null;

  const facts = factsFromRoll(roll);
  if (!facts.rollType) return null;

  const actor = resolveActor(message, facts);
  const token = resolveToken(message, actor);

  return {
    facts,
    actor,
    token,
    item: resolveItem(actor, facts),
    targets: resolveTargets(message),
    roll
  };
}

function resolveActor(message, facts) {
  const speaker = message.speaker ?? {};
  if (speaker.token) {
    const scene = game.scenes.get(speaker.scene);
    const tokenDoc = scene?.tokens.get(speaker.token);
    if (tokenDoc?.actor) return tokenDoc.actor;
  }
  return game.actors.get(speaker.actor ?? facts.actorId) ?? null;
}

/**
 * The placeable on the *current* canvas. A token document from another scene
 * has no position AA could animate at, so it is worse than nothing.
 */
function resolveToken(message, actor) {
  const speaker = message.speaker ?? {};
  if (speaker.token && speaker.scene === canvas.scene?.id) {
    const placed = canvas.tokens?.get(speaker.token);
    if (placed) return placed;
  }
  if (!actor) return null;
  return canvas.tokens?.placeables.find((t) => t.actor?.id === actor.id) ?? null;
}

/**
 * The live Item, not the snapshot the roll serialised.
 *
 * `roll.options.item` survives into the message as plain data, which is enough
 * to name but not enough to animate: AA reads the item's own animation flags,
 * and a plain object has none. Resolving the id back to the document is what
 * makes the "A-A" button on a weapon sheet mean anything.
 */
function resolveItem(actor, facts) {
  if (!facts.itemId) return null;
  const owner = actor ?? game.actors.get(facts.actorId);
  return owner?.items?.get(facts.itemId) ?? null;
}

/**
 * Targets are read from the rolling user, not the local one — otherwise every
 * client resolves the animation against whatever it happens to have targeted.
 */
function resolveTargets(message) {
  const user = game.users.get(message.author?.id ?? message.user?.id);
  return Array.from(user?.targets ?? []);
}
