import { MODULE_ID, SETTINGS } from "./constants.js";

export function registerSettings() {
  const world = (key, defaultValue) =>
    game.settings.register(MODULE_ID, key, {
      name: `DGAA.Settings.${key}.Name`,
      hint: `DGAA.Settings.${key}.Hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: defaultValue
    });

  world(SETTINGS.ENABLED, true);

  // Attacks are the default because they are the only Delta Green roll with a
  // source, a target and a verdict — everything AA's melee and ranged
  // animations are built from. The rest are opt-in: a skill check fires an
  // animation only for someone who has written an Autorec rule for it.
  world(SETTINGS.ATTACKS, true);
  world(SETTINGS.DAMAGE, false);
  world(SETTINGS.SKILLS, false);
  world(SETTINGS.SANITY, false);

  world(SETTINGS.PLAY_ON_MISS, true);

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: `DGAA.Settings.${SETTINGS.DEBUG}.Name`,
    hint: `DGAA.Settings.${SETTINGS.DEBUG}.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * Settings as the plain object `core/animation-plan.js` expects. Reading them
 * all in one place is what keeps `game.settings` out of the pure layer.
 *
 * @returns {Record<string, boolean>}
 */
export function readConfig() {
  return Object.fromEntries(
    Object.values(SETTINGS).map((key) => [key, game.settings.get(MODULE_ID, key)])
  );
}

export function isEnabled() {
  return game.settings.get(MODULE_ID, SETTINGS.ENABLED);
}

export function isDebug() {
  return game.settings.get(MODULE_ID, SETTINGS.DEBUG);
}
