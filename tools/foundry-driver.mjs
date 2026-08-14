/**
 * Drive a live Foundry world in a real browser.
 *
 * This module sits between two dependencies that document none of what it
 * depends on. The `deltagreen` system publishes no roll hook, so the bridge
 * reads `roll.options` out of a chat message — and what survives being
 * serialised into a message and revived from it is not something a unit test
 * can settle. Automated Animations ships one bundled file with no types, so
 * whether `playAnimation(token, item, options)` still means what the bridge
 * thinks it means is likewise a question only a running world answers.
 *
 *   node tools/foundry-driver.mjs probe     # list joinable users
 *   node tools/foundry-driver.mjs capture   # roll for real, dump what the bridge reads
 *   node tools/foundry-driver.mjs smoke     # roll an attack, prove AA took the call
 *   node tools/foundry-driver.mjs canvas    # borrow an Autorec rule, prove one renders
 *   node tools/foundry-driver.mjs verify    # every check, exits non-zero on failure
 *
 * Environment:
 *   FOUNDRY_URL       default http://localhost:30000
 *   FOUNDRY_USER      user to join as (default: first joinable gamemaster)
 *   FOUNDRY_PASSWORD  that user's password, if set
 *   HEADED=1          watch it happen
 *
 * It needs a dedicated GM account: Foundry disables a user who is already
 * connected, so the driver cannot share the one you are playing on.
 *
 * `capture`, `smoke` and `verify` roll in the live world and leave chat
 * messages behind. `verify` also changes this module's own settings and puts
 * them back. None of them writes to an actor. This is a development tool: not
 * bundled, not shipped.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.FOUNDRY_URL ?? 'http://localhost:30000';
const HEADED = process.env.HEADED === '1';
const OUT = path.join('tools', '.out');

const MODULE_ID = 'deltagreen-aa-bridge';

/* ------------------------------------------------------------------ session */

async function connect({ join = true } = {}) {
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await context.newPage();

  const consoleLog = [];
  page.on('console', (message) => consoleLog.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => consoleLog.push({ type: 'pageerror', text: error.message }));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Wait for a populated option, not the container: the join screen is built
  // client-side. `state: 'attached'` matters — an <option> never satisfies
  // Playwright's visibility check, so the default would always time out.
  await page.waitForSelector('select[name="userid"] option[value]:not([value=""])', {
    state: 'attached',
    timeout: 30_000
  });

  if (join) await joinWorld(page);
  return { browser, page, consoleLog };
}

async function joinWorld(page) {
  const select = page.locator('select[name="userid"]');
  await select.waitFor({ timeout: 30_000 });

  const users = await readUsers(page);
  const wanted = process.env.FOUNDRY_USER;
  const target = wanted ? users.find((u) => u.user === wanted) : users.find((u) => u.joinable);

  if (!target) {
    const available = users.map((u) => `${u.user}${u.joinable ? '' : ' (connected)'}`).join(', ');
    throw new Error(
      wanted ? `No such user "${wanted}". Available: ${available}` : `No joinable user. Available: ${available}`
    );
  }
  if (!target.joinable) {
    throw new Error(`"${target.user}" is already connected — Foundry disables that option. Use another user.`);
  }

  await select.selectOption(target.id);

  const password = process.env.FOUNDRY_PASSWORD;
  if (password) await page.fill('input[name="password"]', password);

  await page.click('button[name="join"], #join-game button[type="submit"]');
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 60_000 });
}

async function readUsers(page) {
  return page.locator('select[name="userid"] option').evaluateAll((options) =>
    options
      .filter((o) => o.value)
      .map((o) => ({ user: o.textContent.trim(), joinable: !o.disabled, id: o.value }))
  );
}

/** Refuse to run against the wrong world rather than reporting nonsense. */
async function requireEnvironment(page) {
  const info = await page.evaluate((moduleId) => ({
    system: game.system.id,
    systemVersion: game.system.version,
    bridge: game.modules.get(moduleId)?.active ?? false,
    aa: game.modules.get('autoanimations')?.active ?? false,
    aaVersion: game.modules.get('autoanimations')?.version ?? null,
    api: typeof globalThis.DeltaGreenAABridge === 'object'
  }), MODULE_ID);

  if (info.system !== 'deltagreen') throw new Error(`World is running "${info.system}", not "deltagreen".`);
  if (!info.bridge) throw new Error(`"${MODULE_ID}" is not active in this world.`);
  if (!info.api) throw new Error(`"${MODULE_ID}" is active but exposed no API — it failed to initialise.`);

  console.log(
    `System ${info.system} ${info.systemVersion} · bridge active · ` +
      `autoanimations ${info.aa ? info.aaVersion : 'NOT ACTIVE'}\n`
  );
  return info;
}

function write(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

/* ------------------------------------------------------------------- probe */

async function probe() {
  const { browser, page } = await connect({ join: false });
  console.log('World:', await page.title());
  console.table(await readUsers(page));
  await browser.close();
}

/* ----------------------------------------------------------------- capture */

/**
 * Roll each type for real, and report what the bridge reads back out.
 *
 * The point is the difference between the live roll and the revived one. The
 * bridge reads the revived roll — the same object every other client gets — so
 * a field present live and gone after the round trip is a field it must not
 * depend on. `explain` runs the real planner over the real message, so the
 * output is the bridge's actual decision, not a reconstruction of it.
 */
async function capture() {
  const { browser, page } = await connect();
  await requireEnvironment(page);

  // The function is serialised into the page, so it must be self-contained —
  // it can close over nothing from this file, only its argument.
  const observed = await page.evaluate(rollEveryType, MODULE_ID);

  if (observed.error) {
    console.error(observed.error);
    await browser.close();
    process.exit(1);
  }

  for (const result of observed.results) {
    console.log(`\n── ${result.label} ${'─'.repeat(Math.max(0, 40 - result.label.length))}`);
    if (result.error) {
      console.log(`  error: ${result.error}`);
      continue;
    }
    console.log(`  live    class=${result.live?.class} type=${result.live?.type} total=${result.live?.total}`);
    console.log(`  revived rollType=${result.facts?.rollType} name=${result.facts?.itemName ?? result.facts?.key}`);
    console.log(`  plan    ${result.plan ? JSON.stringify(result.plan) : `none (${result.reason})`}`);
  }

  console.log(`\nWrote ${write('capture.json', observed)}`);
  await browser.close();
}

/**
 * Runs inside the page. Rolls every type the system offers through its own
 * public API, then hands each resulting message to the bridge's planner.
 */
/* c8 ignore start -- executes in the browser */
function rollEveryType(moduleId) {
  return (async () => {
    const { createDGRollFromDataset, processDGRoll } = await import('/systems/deltagreen/module/roll/roll.js');
    const api = globalThis.DeltaGreenAABridge;

    const token =
      canvas.tokens.controlled[0] ??
      canvas.tokens.placeables.find((t) => t.actor?.isOwner && ['agent', 'npc'].includes(t.actor?.type));
    if (!token) return { error: 'No ownable agent/npc token on this scene. Place one and retry.' };

    const actor = token.actor;
    const weapon = actor.items.find((i) => i.type === 'weapon');
    const skillKey = Object.keys(actor.system.skills ?? {})[0];

    const cases = [
      { label: 'skill', dataset: { rolltype: 'skill', key: skillKey } },
      { label: 'stat', dataset: { rolltype: 'stat', key: 'str' } },
      { label: 'sanity', dataset: { rolltype: 'sanity', key: 'sanity' } },
      ...(weapon
        ? [
            { label: 'weapon', dataset: { rolltype: 'weapon', key: weapon.system.skill }, item: weapon },
            { label: 'damage', dataset: { rolltype: 'damage', key: 'damage' }, item: weapon }
          ]
        : [])
    ];

    const results = [];

    for (const testCase of cases) {
      let live = null;
      try {
        const roll = createDGRollFromDataset(testCase.dataset, {
          actor,
          item: testCase.item ?? null,
          token: token.document
        });
        // No shiftKey, no which: processDGRoll skips the modifier dialog.
        await processDGRoll({}, roll);
        live = {
          class: roll.constructor.name,
          type: roll.type,
          key: roll.key,
          total: roll.total,
          isSuccess: roll.isSuccess ?? null,
          hasItem: Boolean(roll.item)
        };
      } catch (error) {
        results.push({ label: testCase.label, error: String(error?.message ?? error) });
        continue;
      }

      // The message the bridge would actually have seen.
      const message = game.messages.contents.at(-1);
      const explained = api.explainLast();

      results.push({
        label: testCase.label,
        live,
        messageId: message?.id,
        facts: explained.facts ?? null,
        plan: explained.plan ?? null,
        reason: explained.reason ?? null,
        resolvedItem: explained.item ?? null,
        resolvedToken: explained.token ?? null,
        targets: explained.targets ?? []
      });
    }

    return {
      module: moduleId,
      token: token.name,
      weapon: weapon?.name ?? null,
      settings: api.readConfig(),
      results
    };
  })();
}
/* c8 ignore stop */

/* ------------------------------------------------------------------- smoke */

/**
 * Roll an attack for real and prove Automated Animations took the call.
 *
 * The witness is AA's own `AutomatedAnimations-WorkflowStart`, which fires as
 * it accepts the data and reports whether an Autorec rule matched. That
 * distinction is the whole point: exactly one workflow means the bridge worked,
 * whether or not this particular world has an animation configured for that
 * weapon. Zero means the bridge never reached AA. Two means it fired twice —
 * the failure to expect if AA ever grows native `deltagreen` support.
 */
async function smoke() {
  const { browser, page } = await connect();
  const info = await requireEnvironment(page);

  if (!info.aa) {
    console.error('Automated Animations is not active in this world — there is nothing to smoke-test.');
    await browser.close();
    process.exit(1);
  }

  const result = await page.evaluate(rollAttackAndWatch);

  if (result.error) {
    console.error(result.error);
    await browser.close();
    process.exit(1);
  }

  console.log(`Rolled ${result.weapon} on ${result.token} at ${result.targets} target(s)`);
  console.log(`  bridge plan     : ${result.plan ? JSON.stringify(result.plan) : `none (${result.reason})`}`);
  console.log(`  AA workflows    : ${result.workflows.length}`);
  for (const workflow of result.workflows) {
    console.log(
      `    item=${workflow.item} token=${workflow.token} targets=${workflow.targets} ` +
        `hit=${workflow.hitTargets} playOnMiss=${workflow.playOnMiss} matchedRule=${workflow.matchedRule}`
    );
  }
  console.log(`  animations begun: ${result.started}`);

  if (result.workflows.length !== 1) {
    console.error(
      result.workflows.length === 0
        ? '\nFAIL: the bridge never reached Automated Animations.'
        : `\nFAIL: ${result.workflows.length} workflows for one roll — something is firing twice.`
    );
    await browser.close();
    process.exit(1);
  }
  if (!result.workflows[0].matchedRule) {
    console.log(
      '\nThe bridge worked: AA took the call and matched no Autorec rule for this weapon.\n' +
        'Configure one (or the weapon\'s own A-A menu) to see an animation on the canvas.'
    );
  }

  console.log(`\nWrote ${write('smoke.json', result)}`);
  await browser.close();
}

/* c8 ignore start -- executes in the browser */
function rollAttackAndWatch() {
  return (async () => {
    const { createDGRollFromDataset, processDGRoll } = await import('/systems/deltagreen/module/roll/roll.js');
    const api = globalThis.DeltaGreenAABridge;

    const token =
      canvas.tokens.controlled[0] ??
      canvas.tokens.placeables.find((t) => t.actor?.isOwner && t.actor?.items.some((i) => i.type === 'weapon'));
    if (!token) return { error: 'No ownable token with a weapon on this scene.' };

    const weapon = token.actor.items.find((i) => i.type === 'weapon');
    if (!weapon) return { error: `${token.actor.name} has no weapon to attack with.` };

    // A target makes the difference between a melee/ranged animation and
    // nothing: AA bails on a ranged animation with no target of its own accord.
    const other = canvas.tokens.placeables.find((t) => t.id !== token.id);
    const restoreTargets = Array.from(game.user.targets).map((t) => t.id);
    if (other) other.setTarget(true, { releaseOthers: true, groupSelection: false });

    const stop = api.observe();
    let plan = null;
    let reason = null;

    try {
      const roll = createDGRollFromDataset(
        { rolltype: 'weapon', key: weapon.system.skill },
        { actor: token.actor, item: weapon, token: token.document }
      );
      await processDGRoll({}, roll);

      // The listener runs on createChatMessage; give it and AA's async
      // handleItem lookup room to finish before reading the witnesses.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const explained = api.explainLast();
      plan = explained.plan;
      reason = explained.reason ?? null;
    } finally {
      if (other) other.setTarget(false, { releaseOthers: false, groupSelection: false });
      for (const id of restoreTargets) {
        canvas.tokens.get(id)?.setTarget(true, { releaseOthers: false, groupSelection: false });
      }
    }

    const { workflows, started } = stop();
    return {
      token: token.name,
      weapon: weapon.name,
      targets: other ? 1 : 0,
      plan,
      reason,
      workflows,
      started
    };
  })();
}
/* c8 ignore stop */

/* ------------------------------------------------------------------ verify */

/**
 * Every check `npm test` cannot reach, in one run, exiting non-zero on any
 * failure. It changes this module's settings and puts them back.
 */
async function verify() {
  const { browser, page } = await connect();
  const info = await requireEnvironment(page);

  const checks = [];
  const record = (name, pass, detail) => {
    checks.push({ name, pass, detail });
    console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  // The gating checks below assert what each setting does, so the run cannot
  // depend on how this world happens to be configured. Restored at the end,
  // including if a check throws.
  const restore = await page.evaluate(setSettings, {
    moduleId: MODULE_ID,
    values: {
      enabled: true,
      animateAttacks: true,
      animateDamage: false,
      animateSkills: false,
      animateSanity: false,
      playOnMiss: true
    }
  });
  console.log(`Settings held at a known baseline for this run (restored afterwards).\n`);

  try {
    await runChecks();
  } finally {
    await page.evaluate(setSettings, { moduleId: MODULE_ID, values: restore });
  }

  console.log(`\nWrote ${write('verify.json', { environment: info, checks })}`);

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  await browser.close();
  if (failed.length) process.exit(1);

  async function runChecks() {
  console.log('Contract');
  record(
    'AutomatedAnimations.playAnimation is a function',
    await page.evaluate(() => typeof globalThis.AutomatedAnimations?.playAnimation === 'function')
  );
  record(
    'aa.workflow hook is registered',
    await page.evaluate(() => (Hooks.events?.['aa.workflow']?.length ?? 0) > 0)
  );

  console.log('\nRoll round trip');
  const captured = await page.evaluate(rollEveryType, MODULE_ID);
  if (captured.error) {
    record('rolls can be made in this world', false, captured.error);
  } else {
    const weapon = captured.results.find((r) => r.label === 'weapon');
    record(
      'a weapon roll survives the chat message with its rollType',
      weapon?.facts?.rollType === 'weapon',
      `got ${weapon?.facts?.rollType}`
    );
    record(
      'the weapon item resolves back to a live document',
      Boolean(weapon?.resolvedItem),
      weapon?.resolvedItem ?? 'unresolved — AA would fall back to a name-only stand-in'
    );
    record(
      'a stat roll is refused rather than animated',
      captured.results.find((r) => r.label === 'stat')?.plan === null
    );
    record(
      'a skill roll is refused while its setting is off',
      captured.results.find((r) => r.label === 'skill')?.plan === null
    );
  }

  console.log('\nEnd to end');
  if (!info.aa) {
    record('Automated Animations takes the call', false, 'autoanimations is not active');
  } else {
    const result = await page.evaluate(rollAttackAndWatch);
    if (result.error) {
      record('an attack can be rolled', false, result.error);
    } else {
      record('exactly one AA workflow per attack roll', result.workflows.length === 1, `got ${result.workflows.length}`);
      record(
        'AA receives the weapon, not a stand-in',
        result.workflows[0]?.item === result.weapon,
        `got ${result.workflows[0]?.item}`
      );
      record(
        'AA receives the target',
        (result.workflows[0]?.targets ?? 0) === result.targets,
        `got ${result.workflows[0]?.targets}`
      );
    }

    console.log('\nCanvas');
    const canvasResult = await page.evaluate(proveCanvas);
    if (canvasResult.error) {
      record('an animation reaches the canvas', false, canvasResult.error);
    } else {
      record(
        'a borrowed Autorec rule matches a Delta Green weapon',
        canvasResult.workflows[0]?.matchedRule === true
      );
      // `started` is the witness, not `effects`: a short melee animation can
      // finish inside the wait, leaving nothing on the canvas to count.
      record(
        'an animation reaches the canvas',
        canvasResult.started > 0,
        `${canvasResult.started} started, ${canvasResult.effects} still playing`
      );
      record('the borrowed rule is put back', canvasResult.rulesRestored === true);
    }
  }
  }
}

/* ------------------------------------------------------------------ canvas */

/**
 * The last link: prove an animation actually reaches the canvas.
 *
 * `smoke` stops at "AA took the call", which is all the bridge is responsible
 * for. But a world with no Autorec rule for any Delta Green weapon can never
 * distinguish that from a broken render, so this borrows one: it clones an
 * existing rule, relabels it after a real weapon on a real token, rolls, and
 * puts the rule list back.
 *
 * Runs in the page.
 */
/* c8 ignore start -- executes in the browser */
function proveCanvas() {
  return (async () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const KEY = 'aaAutorec-range';
    const api = globalThis.DeltaGreenAABridge;

    // AA validates rule ids as UUIDv4 and throws while loading its stores if
    // one is not — which strands the bad rule in the setting, breaking the
    // menu until it is removed. Clear any leftover before adding one.
    const current = game.settings.get('autoanimations', KEY);
    const original = current.filter((rule) => UUID_V4.test(rule.id ?? ''));
    const removed = current.length - original.length;
    if (removed) await game.settings.set('autoanimations', KEY, original);

    const donor = original.find((rule) => rule.primary?.video?.animation);
    if (!donor) return { removed, error: 'No Autorec rule to clone — this world has none configured.' };

    const token = canvas.tokens.placeables.find(
      (t) => t.actor?.isOwner && t.actor?.items.some((i) => i.type === 'weapon')
    );
    if (!token) return { removed, error: 'No ownable token with a weapon on this scene.' };

    const weapon = token.actor.items.find((i) => i.type === 'weapon');
    const other = canvas.tokens.placeables.find((t) => t.id !== token.id);
    const restoreTargets = Array.from(game.user.targets).map((t) => t.id);

    let watched = { workflows: [], started: 0 };
    let effects = 0;

    try {
      // AA matches `rinsedName.includes(rinseName(rule.label))`, so the whole
      // weapon name is the safest label — it can only match this weapon.
      const rule = foundry.utils.deepClone(donor);
      rule.id = crypto.randomUUID();
      rule.label = weapon.name;
      rule.metaData = { ...(rule.metaData ?? {}), default: false };
      await game.settings.set('autoanimations', KEY, [...original, rule]);

      // AA rebuilds its Autorec stores from the setting's onChange. Rolling
      // into a half-built store produces no workflow at all — an artifact of
      // this test, not a defect, and one that cost an afternoon to read.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (other) other.setTarget(true, { releaseOthers: true, groupSelection: false });

      const { createDGRollFromDataset, processDGRoll } = await import('/systems/deltagreen/module/roll/roll.js');
      const stop = api.observe();
      const roll = createDGRollFromDataset(
        { rolltype: 'weapon', key: weapon.system.skill },
        { actor: token.actor, item: weapon, token: token.document }
      );
      await processDGRoll({}, roll);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      effects = Sequencer.EffectManager.effects.length;
      watched = stop();
    } finally {
      await game.settings.set('autoanimations', KEY, original);
      if (other) other.setTarget(false, { releaseOthers: false, groupSelection: false });
      for (const id of restoreTargets) {
        canvas.tokens.get(id)?.setTarget(true, { releaseOthers: false, groupSelection: false });
      }
    }

    return {
      removed,
      token: token.name,
      weapon: weapon.name,
      workflows: watched.workflows,
      started: watched.started,
      effects,
      rulesRestored: game.settings.get('autoanimations', KEY).length === original.length
    };
  })();
}
/* c8 ignore stop */

async function canvas() {
  const { browser, page } = await connect();
  const info = await requireEnvironment(page);

  if (!info.aa) {
    console.error('Automated Animations is not active in this world.');
    await browser.close();
    process.exit(1);
  }

  const result = await page.evaluate(proveCanvas);
  if (result.error) {
    console.error(result.error);
    await browser.close();
    process.exit(1);
  }

  if (result.removed) {
    console.log(`Removed ${result.removed} malformed Autorec rule(s) left by an earlier run.\n`);
  }
  console.log(`Borrowed an Autorec rule for "${result.weapon}" on ${result.token}, rolled, and put it back.`);
  console.log(`  AA workflows      : ${result.workflows.length} (matched a rule: ${result.workflows[0]?.matchedRule})`);
  console.log(`  animations begun  : ${result.started}`);
  console.log(`  effects on canvas : ${result.effects}`);
  console.log(`  rules restored    : ${result.rulesRestored}`);

  const ok = result.workflows[0]?.matchedRule === true && result.started > 0;
  console.log(`\n${ok ? 'An animation reached the canvas.' : 'FAIL: no animation reached the canvas.'}`);

  console.log(`Wrote ${write('canvas.json', result)}`);
  await browser.close();
  if (!ok) process.exit(1);
}

/**
 * Set this module's settings, and return what they were. Runs in the page.
 * @param {{moduleId: string, values: Record<string, boolean>}} input
 */
/* c8 ignore start -- executes in the browser */
function setSettings(input) {
  return (async () => {
    const previous = {};
    for (const [key, value] of Object.entries(input.values)) {
      previous[key] = game.settings.get(input.moduleId, key);
      if (previous[key] !== value) await game.settings.set(input.moduleId, key, value);
    }
    return previous;
  })();
}
/* c8 ignore stop */

/* -------------------------------------------------------------------- main */

const commands = { probe, capture, smoke, canvas, verify };
const command = process.argv[2];

if (!commands[command]) {
  console.error(`Usage: node tools/foundry-driver.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}

commands[command]().catch((error) => {
  console.error(error);
  process.exit(1);
});
