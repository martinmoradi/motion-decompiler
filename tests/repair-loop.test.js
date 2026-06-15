#!/usr/bin/env node
'use strict';
/*
 * Capture-repair loop smoke — browser-free and model-free (design §1).
 *
 * Exercises the loop mechanics with INJECTED effects: env.recapture returns
 * canned ENGINE results (no browser), and env.callProvider shells to the
 * deterministic stub provider via the REAL external-command transport
 * (invokeRepairProvider), so the §5 contract is proven for real without a model.
 *
 * Covers: (a) precondition_action -> ok_after_repair + M1 fresh isolation flag,
 * (b) terminal_give_up(genuinely_absent) on the drift shape with no wasted
 * retries, (c) invalid provider output -> fail-safe terminal(provider_error),
 * (d) budget + maxRetries ceilings, (e) provider absent -> inert.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const m = require('../bin/motion-decompile');
const STUB = path.join(__dirname, 'fixtures', 'repair-stub-provider.js');
const STUB_CMD = `node ${STUB}`;

const CONFIG = {
  maxRetries: 2,
  confidenceFloor: 0.4,
  budget: null,
  repairableCauses: ['occlusion', 'hidden_not_visible', 'inert_representative'],
};

function mkBudget(total) {
  let spent = 0;
  return { total, spend: () => { spent += 1; }, remaining: () => total - spent };
}

// A run dir on disk so writeInput/the stub round-trip through real files.
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-test-'));

// Build an env whose provider is the REAL stub command and whose recapture is a
// canned engine result. `repairContext` is what the test injects into the input
// the stub reads, so the test controls which stub branch fires.
function makeEnv({ repairContext, recapture }) {
  const writes = [];
  return {
    env: {
      log: () => {},
      screenshot: () => 'repair/fake.png',   // no browser
      repairContext: () => repairContext,
      writeInput: (input, attempt) => {
        const file = path.join(runDir, `${input.captureId}.attempt-${attempt}.input.json`);
        fs.writeFileSync(file, JSON.stringify(input, null, 2));
        writes.push(file);
        return file;
      },
      callProvider: (inputPath) => m.invokeRepairProvider(STUB_CMD, inputPath, null),
      recapture,
    },
    writes,
  };
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
}

// ── (a) precondition_action -> ok_after_repair + M1 fresh isolation ──────────
{
  let freshArg = null;
  let recaptureCalls = 0;
  const { env } = makeEnv({
    repairContext: {
      animatableHere: { childAnimated: true },
      candidateTriggers: [{ selector: 'div.carousel__arrow--next', text: 'next' }],
      matches: [{ nth: 0, visible: true, occludedBy: 'div.carousel__arrow--next' }],
    },
    recapture: (cloned, type, id, fresh) => {
      recaptureCalls += 1;
      freshArg = fresh;
      // M1: a stateful repair must arrive with fresh:true on the cloned capture.
      assert.strictEqual(cloned.fresh, true, 'cloned capture carries fresh:true');
      assert.ok(Array.isArray(cloned.beforeAction) && /click/.test(String(cloned.beforeAction[0])), 'precondition prepended as beforeAction');
      return { id, type, status: 'ok', findings: 2, movedSelectors: ['div.carousel__arrow--prev'] };
    },
  });
  const out = m.runRepairLoop(env, {
    capture: { root: 'div.carousel__arrow--prev', type: 'hover' },
    type: 'hover', id: 'enerblock-prev', url: 'https://example.test/', viewport: [1280, 800], map: {},
    result: { id: 'enerblock-prev', type: 'hover', status: 'error', cause: 'occlusion', causeSignals: { occludedBy: 'div.carousel__arrow--next' } },
    config: CONFIG, budget: mkBudget(24), failSelector: 'div.carousel__arrow--prev',
  });
  ok('(a) origin after-repair', out.origin === 'after-repair');
  ok('(a) status is engine ok', out.result.status === 'ok');
  ok('(a) outcome ok-after-repair', out.repair.outcome === 'ok-after-repair');
  ok('(a) winning action precondition_action', out.repair.winningAction === 'precondition_action');
  ok('(a) M1 fresh isolation applied to re-run', freshArg === true);
  ok('(a) exactly one recapture', recaptureCalls === 1);
}

// ── (b) drift -> terminal_give_up(genuinely_absent), no wasted retries ───────
{
  let recaptureCalls = 0;
  const budget = mkBudget(24);
  const { env } = makeEnv({
    repairContext: { animatableHere: { selfHover: false, pseudoHover: false, childAnimated: false, scrollTriggerBound: false }, candidateTriggers: [], matches: [{ nth: 0, occludedBy: null }] },
    recapture: () => { recaptureCalls += 1; return { status: 'empty' }; },
  });
  const out = m.runRepairLoop(env, {
    capture: { root: 'div.speakers__grid-lines' },
    type: 'scroll-reveal', id: 'flowfest-grid-lines', url: 'u', viewport: [1280, 800], map: {},
    result: { id: 'flowfest-grid-lines', type: 'scroll-reveal', status: 'empty', cause: 'occlusion' },
    config: CONFIG, budget, failSelector: 'div.speakers__grid-lines',
  });
  ok('(b) outcome terminal', out.repair.outcome === 'terminal');
  ok('(b) terminalCause genuinely_absent', out.repair.terminalCause === 'genuinely_absent');
  ok('(b) status stays engine empty', out.result.status === 'empty');
  ok('(b) no recapture burned', recaptureCalls === 0);
  ok('(b) exactly one budget unit spent', budget.remaining() === 23);
}

// ── (c) invalid provider output -> fail-safe terminal(provider_error) ────────
{
  let recaptureCalls = 0;
  const { env } = makeEnv({
    repairContext: { animatableHere: { childAnimated: true }, candidateTriggers: [], matches: [{ occludedBy: '.x' }] },
    recapture: () => { recaptureCalls += 1; return { status: 'ok' }; },
  });
  const out = m.runRepairLoop(env, {
    capture: { root: '.garbage-target' },
    type: 'hover', id: 'garbage-case', url: 'u', viewport: [1, 1], map: {},
    result: { status: 'empty', cause: 'occlusion' },
    config: CONFIG, budget: mkBudget(24), failSelector: '.garbage-target',
  });
  ok('(c) outcome terminal', out.repair.outcome === 'terminal');
  ok('(c) terminalCause provider_error', out.repair.terminalCause === 'provider_error');
  ok('(c) no recapture on garbage', recaptureCalls === 0);
}

// ── (d) budget + maxRetries ceilings ─────────────────────────────────────────
{
  // budget exhausted up front -> zero attempts.
  const { env } = makeEnv({
    repairContext: { animatableHere: { childAnimated: true }, candidateTriggers: [{ selector: '.next' }], matches: [{ occludedBy: '.x' }] },
    recapture: () => { throw new Error('recapture should not be called when budget is 0'); },
  });
  const out = m.runRepairLoop(env, {
    capture: { root: '.t' }, type: 'hover', id: 'budget-zero', url: 'u', viewport: [1, 1], map: {},
    result: { status: 'empty', cause: 'occlusion' }, config: CONFIG, budget: mkBudget(0), failSelector: '.t',
  });
  ok('(d) budget 0 -> no attempts', out.repair.attempts.length === 0);
  ok('(d) budget 0 -> unrepaired', out.repair.outcome === 'unrepaired');

  // maxRetries: a repair that never satisfies the criterion and keeps producing
  // DISTINCT triples must stop at maxRetries (not loop forever).
  let n = 0;
  const env2 = makeEnv({
    repairContext: { animatableHere: { childAnimated: true }, candidateTriggers: [{ selector: '.next' }], matches: [{ occludedBy: '.x' }] },
    recapture: (cloned, type, id) => ({ id, type, status: 'empty', cause: 'inert_representative', causeSignals: { occludedBy: 'occ-' + (n++) } }),
  }).env;
  const out2 = m.runRepairLoop(env2, {
    capture: { root: '.t' }, type: 'hover', id: 'never-fixes', url: 'u', viewport: [1, 1], map: {},
    result: { status: 'empty', cause: 'occlusion', causeSignals: { occludedBy: 'orig' } },
    config: CONFIG, budget: mkBudget(24), failSelector: '.t',
  });
  ok('(d) maxRetries caps attempts at 2', out2.repair.attempts.length === 2);

  // repeated-identical: same triple every time -> terminal before maxRetries
  // waste. Here the provider keeps proposing a (non-terminal) repair, but the
  // re-measure reproduces the same (status,cause,occludedBy); with nothing
  // animatable + no occluder the honest terminal is genuinely_inert. callProvider
  // is overridden to a fixed valid repair (the stub would terminate early — that
  // is its own, correct, branch tested in (b)).
  const env3 = makeEnv({
    repairContext: { animatableHere: {}, candidateTriggers: [{ selector: '.next' }], matches: [{ occludedBy: null }] },
    recapture: (cloned, type, id) => ({ id, type, status: 'empty', cause: 'inert_representative', causeSignals: {} }),
  }).env;
  env3.callProvider = () => ({
    diagnosis: 'try a sibling', rootCause: 'inert_representative', confidence: 0.7,
    action: { kind: 'use_other_instance', selector: '.alt' }, successCriterion: { expect: 'moved' },
  });
  const out3 = m.runRepairLoop(env3, {
    capture: { root: '.t' }, type: 'hover', id: 'repeated', url: 'u', viewport: [1, 1], map: {},
    result: { status: 'empty', cause: 'occlusion' }, config: CONFIG, budget: mkBudget(24), failSelector: '.t',
  });
  ok('(d) repeated-identical -> terminal', out3.repair.outcome === 'terminal');
  ok('(d) repeated-identical genuinely_inert', out3.repair.terminalCause === 'genuinely_inert');

  // absolute ceiling constant is enforced (design §11).
  ok('(d) absolute budget ceiling is 24', m.REPAIR_DEFAULTS.budgetCeiling === 24);
  ok('(d) budget multiplier is 2', m.REPAIR_DEFAULTS.budgetMultiplier === 2);
}

// ── (e) provider absent -> loop is inert (byte-identical soft-fail) ──────────
{
  ok('(e) no command -> repairConfig null', m.repairConfig({}, {}) === null);
  ok('(e) no command (manifest repair block w/o command) -> null', m.repairConfig({ repair: { maxRetries: 3 } }, {}) === null);
  const cfg = m.repairConfig({}, { repairCmd: STUB_CMD });
  ok('(e) --repair-cmd arms the loop', cfg && cfg.command === STUB_CMD);
  ok('(e) default repairable causes are the narrow three', JSON.stringify(cfg.repairableCauses) === JSON.stringify(m.DEFAULT_REPAIRABLE_CAUSES));
}

// ── validation + apply unit coverage (defense-in-depth) ──────────────────────
{
  ok('validate: unknown kind invalid', m.validateRepairOutput({ action: { kind: 'nope' } }).valid === false);
  ok('validate: precondition needs actions[]', m.validateRepairOutput({ action: { kind: 'precondition_action' } }).valid === false);
  ok('validate: precondition rejects unknown step', m.validateRepairOutput({ action: { kind: 'precondition_action', actions: ['frobnicate .x'] } }).valid === false);
  ok('validate: precondition accepts recipe steps', m.validateRepairOutput({ action: { kind: 'precondition_action', actions: ['click .x', 'wait 400'] } }).valid === true);
  ok('validate: retarget needs selector/nth', m.validateRepairOutput({ action: { kind: 'retarget_selector' } }).valid === false);
  ok('validate: rootCause coerced to ambiguous', m.validateRepairOutput({ action: { kind: 'terminal_give_up' }, rootCause: 'made_up' }).repair.rootCause === 'ambiguous');
  ok('validate: confidence clamped 0..1', m.validateRepairOutput({ action: { kind: 'terminal_give_up' }, confidence: 9 }).repair.confidence === 1);

  ok('apply: precondition is stateful (fresh)', m.applyRepair({ root: '.t' }, 'hover', { kind: 'precondition_action', actions: ['click .o'] }).fresh === true);
  ok('apply: scroll_into_view is stateful (fresh)', m.applyRepair({ root: '.t' }, 'hover', { kind: 'scroll_into_view', selector: '.t' }).fresh === true);
  ok('apply: retarget_selector NOT stateful', m.applyRepair({ root: '.t' }, 'hover', { kind: 'retarget_selector', selector: '.p' }).fresh === undefined);
  ok('apply: retarget rewrites root', m.applyRepair({ root: '.t' }, 'hover', { kind: 'retarget_selector', selector: '.p' }).root === '.p');
  ok('isStateful: precondition true', m.isStatefulRepairKind('precondition_action') === true);
  ok('isStateful: use_other_instance false', m.isStatefulRepairKind('use_other_instance') === false);

  ok('meetsSuccess: ok meets moved', m.meetsSuccess({ status: 'ok' }, { expect: 'moved' }) === true);
  ok('meetsSuccess: empty fails moved', m.meetsSuccess({ status: 'empty' }, { expect: 'moved' }) === false);
  ok('meetsSuccess: onSelector enforced', m.meetsSuccess({ status: 'ok', movedSelectors: ['.a'] }, { expect: 'moved', onSelector: '.b' }) === false);
  ok('meetsSuccess: onSelector matched', m.meetsSuccess({ status: 'ok', movedSelectors: ['.b.x'] }, { expect: 'moved', onSelector: '.b.x' }) === true);
  // Class-token match: engine finding selector carries extra classes, criterion
  // names the specific one (the enerblock prev-arrow case from the headed e2e).
  ok('meetsSuccess: class-token match across CSS-path shapes',
    m.meetsSuccess({ status: 'ok', movedSelectors: ['div.carousel__arrow.carousel__arrow--prev'] }, { expect: 'moved', onSelector: 'div.carousel__arrow--prev' }) === true);
}

// ── external-command transport proof (no browser, no model) ──────────────────
{
  const inputFile = path.join(runDir, 'transport.attempt-1.input.json');
  fs.writeFileSync(inputFile, JSON.stringify({
    captureId: 'transport', repairContext: { animatableHere: {}, candidateTriggers: [], matches: [{ occludedBy: null }] },
    failure: { cause: 'occlusion' }, failedRecipe: { selector: '.t' },
  }, null, 2));
  const parsed = m.invokeRepairProvider(STUB_CMD, inputFile, null);
  ok('transport: provider output parsed from printed path', parsed && parsed.action && parsed.action.kind === 'terminal_give_up');
  ok('transport: bad command -> null (fail safe)', m.invokeRepairProvider('node /no/such/stub.js', inputFile, null) === null);
}

fs.rmSync(runDir, { recursive: true, force: true });
console.log(`repair-loop.test.js: ${passed} checks passed`);
