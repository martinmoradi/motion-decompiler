#!/usr/bin/env bun
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

const m = require('../bin/yoinkit');
const STUB = path.join(__dirname, 'fixtures', 'repair-stub-provider.js');
const RUNTIME = process.execPath;
const STUB_CMD = `${RUNTIME} ${STUB}`;

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
  // Helper: a well-formed output around a given action (valid confidence etc.).
  const out = (action, extra = {}) => Object.assign({ diagnosis: 'd', rootCause: 'occlusion', confidence: 0.8, action, successCriterion: { expect: 'moved' } }, extra);

  ok('validate: unknown kind invalid', m.validateRepairOutput(out({ kind: 'nope' })).valid === false);
  ok('validate: precondition needs actions[]', m.validateRepairOutput(out({ kind: 'precondition_action' })).valid === false);
  ok('validate: precondition rejects unknown string step', m.validateRepairOutput(out({ kind: 'precondition_action', actions: ['frobnicate .x'] })).valid === false);
  ok('validate: precondition accepts string recipe steps', m.validateRepairOutput(out({ kind: 'precondition_action', actions: ['click .x', 'wait 400'] })).valid === true);
  // SF6: object-form { command } steps are checked against the SAME verb set.
  ok('validate: precondition accepts good object step', m.validateRepairOutput(out({ kind: 'precondition_action', actions: [{ command: 'click', selector: '.x' }] })).valid === true);
  ok('validate: precondition rejects bad object-step verb', m.validateRepairOutput(out({ kind: 'precondition_action', actions: [{ command: 'frobnicate' }] })).valid === false);
  ok('validate: precondition accepts { waitMs } object step', m.validateRepairOutput(out({ kind: 'precondition_action', actions: [{ waitMs: 200 }] })).valid === true);
  ok('validate: precondition rejects non-numeric waitMs', m.validateRepairOutput(out({ kind: 'precondition_action', actions: [{ waitMs: 'soon' }] })).valid === false);
  ok('validate: precondition rejects empty object step', m.validateRepairOutput(out({ kind: 'precondition_action', actions: [{}] })).valid === false);

  // MF2: nth-only retarget / use_other_instance is rejected (not a silent no-op).
  ok('validate: retarget needs concrete selector', m.validateRepairOutput(out({ kind: 'retarget_selector' })).valid === false);
  ok('validate: retarget nth-only rejected', m.validateRepairOutput(out({ kind: 'retarget_selector', nth: 2 })).valid === false);
  ok('validate: use_other_instance nth-only rejected', m.validateRepairOutput(out({ kind: 'use_other_instance', nth: 1 })).valid === false);
  ok('validate: retarget with selector valid', m.validateRepairOutput(out({ kind: 'retarget_selector', selector: '.p' })).valid === true);
  ok('validate: retarget blank selector rejected', m.validateRepairOutput(out({ kind: 'retarget_selector', selector: '   ' })).valid === false);
  // MF2: retarget_iframe frameSelector-only is rejected (only url is implemented).
  ok('validate: retarget_iframe frameSelector-only rejected', m.validateRepairOutput(out({ kind: 'retarget_iframe', frameSelector: 'iframe.embed' })).valid === false);
  ok('validate: retarget_iframe with url valid', m.validateRepairOutput(out({ kind: 'retarget_iframe', url: 'https://x.test/' })).valid === true);

  // SF6: confidence must be a real number.
  ok('validate: missing confidence invalid', m.validateRepairOutput({ action: { kind: 'terminal_give_up' }, rootCause: 'ambiguous' }).valid === false);
  ok('validate: non-numeric confidence invalid', m.validateRepairOutput({ action: { kind: 'terminal_give_up' }, confidence: '0.8' }).valid === false);
  ok('validate: out-of-range confidence clamped not rejected', m.validateRepairOutput(out({ kind: 'terminal_give_up' }, { confidence: 9 })).repair.confidence === 1);
  ok('validate: rootCause coerced to ambiguous', m.validateRepairOutput(out({ kind: 'terminal_give_up' }, { rootCause: 'made_up' })).repair.rootCause === 'ambiguous');

  ok('apply: precondition is stateful (fresh)', m.applyRepair({ root: '.t' }, 'hover', { kind: 'precondition_action', actions: ['click .o'] }).fresh === true);
  ok('apply: scroll_into_view is stateful (fresh)', m.applyRepair({ root: '.t' }, 'hover', { kind: 'scroll_into_view', selector: '.t' }).fresh === true);
  ok('apply: retarget_selector NOT stateful', m.applyRepair({ root: '.t' }, 'hover', { kind: 'retarget_selector', selector: '.p' }).fresh === undefined);
  ok('apply: retarget rewrites root', m.applyRepair({ root: '.t' }, 'hover', { kind: 'retarget_selector', selector: '.p' }).root === '.p');
  ok('apply: no dead repairNth field', m.applyRepair({ root: '.t' }, 'hover', { kind: 'retarget_selector', selector: '.p', nth: 3 }).repairNth === undefined);
  ok('isStateful: precondition true', m.isStatefulRepairKind('precondition_action') === true);
  ok('isStateful: use_other_instance false', m.isStatefulRepairKind('use_other_instance') === false);
}

// ── MF1: meetsSuccess parsed-selector matching edge cases ────────────────────
{
  const moved = (sels, onSelector, expect = 'moved') => m.meetsSuccess({ status: 'ok', movedSelectors: sels }, { expect, onSelector });
  ok('meetsSuccess: ok meets moved (no onSelector)', m.meetsSuccess({ status: 'ok' }, { expect: 'moved' }) === true);
  ok('meetsSuccess: empty fails', m.meetsSuccess({ status: 'empty' }, { expect: 'moved' }) === false);
  // .nav must NOT match .navigation (the old substring bug).
  ok('meetsSuccess: .nav does NOT match .navigation', moved(['.navigation'], '.nav') === false);
  ok('meetsSuccess: .nav matches .nav', moved(['div.nav'], '.nav') === true);
  // Filtered/extra state classes on the moved selector are allowed.
  ok('meetsSuccess: extra state classes allowed', moved(['button.btn.is-active.swiper-button-disabled'], 'button.btn') === true);
  // Criterion class the moved selector lacks -> no match.
  ok('meetsSuccess: missing criterion class -> no match', moved(['button.btn'], 'button.btn.is-active') === false);
  // id and tag discrimination.
  ok('meetsSuccess: id mismatch -> no match', moved(['#other.box'], '#wanted.box') === false);
  ok('meetsSuccess: tag mismatch -> no match', moved(['span.x'], 'div.x') === false);
  // The enerblock prev-arrow shape (engine reports extra classes).
  ok('meetsSuccess: class-token across CSS-path shapes', moved(['div.carousel__arrow.carousel__arrow--prev'], 'div.carousel__arrow--prev') === true);
  // Degenerate onSelector values can never be satisfied.
  ok('meetsSuccess: degenerate "." -> no match', moved(['div.x'], '.') === false);
  ok('meetsSuccess: degenerate ">" -> no match', moved(['div.x'], '>') === false);
  ok('meetsSuccess: empty onSelector -> no match', moved(['div.x'], '') === false);
  ok('meetsSuccess: whitespace onSelector -> no match', moved(['div.x'], '   ') === false);
  // MF1: onSelector is enforced EVEN when expect is status_ok_or_check.
  ok('meetsSuccess: status_ok_or_check still enforces onSelector', moved(['.a'], '.b', 'status_ok_or_check') === false);
  ok('meetsSuccess: status_ok_or_check + matching onSelector', moved(['.b'], '.b', 'status_ok_or_check') === true);
  ok('meetsSuccess: status_ok_or_check + no onSelector -> ok', m.meetsSuccess({ status: 'check' }, { expect: 'status_ok_or_check' }) === true);
  // parseSimpleSelector / selectorSatisfies directly.
  ok('parse: rightmost compound', JSON.stringify(m.parseSimpleSelector('div.wrap > a.link.btn')) === JSON.stringify({ tag: 'a', id: null, classes: ['link', 'btn'] }));
  ok('selectorSatisfies: subset classes', m.selectorSatisfies('a.link.btn', 'a.link') === true);
  ok('selectorSatisfies: degenerate criterion false', m.selectorSatisfies('a.link', '>') === false);
}

// ── MF3: a successful repair retains its ORIGINAL failure bucket ─────────────
{
  const env = makeEnv({
    repairContext: { animatableHere: { childAnimated: true }, candidateTriggers: [{ selector: '.next' }], matches: [{ occludedBy: '.o' }] },
    recapture: (cloned, type, id) => ({ id, type, status: 'ok', findings: 1, movedSelectors: ['.target'], page: { strategy: 'fresh', opened: true, isolated: true } }),
  }).env;
  const out = m.runRepairLoop(env, {
    capture: { root: '.target' }, type: 'hover', id: 'bucket', url: 'u', viewport: [1, 1], map: {},
    result: { id: 'bucket', type: 'hover', status: 'error', cause: 'occlusion' },
    config: CONFIG, budget: mkBudget(24), failSelector: '.target',
  });
  ok('MF3: repair block records original failureCause', out.repair.failureCause === 'occlusion');
  ok('MF3: successful repair result has null/absent cause but bucket preserved', out.repair.outcome === 'ok-after-repair' && out.repair.failureCause === 'occlusion');
  // MF5: the loop keeps the recapture's OWN page provenance, not the failure's.
  ok('MF5: recapture page provenance preserved (isolated fresh)', out.result.page && out.result.page.isolated === true && out.result.page.opened === true);
}

// ── calib-metrics buckets repair att/ok from failureCause (MF3) ──────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-metrics-'));
  fs.writeFileSync(path.join(dir, 'capture-results.json'), JSON.stringify({
    capturedAt: '2026-06-15T00:00:00.000Z', count: 3, results: [
      { id: 'win', type: 'hover', status: 'ok', origin: 'after-repair', findings: 2,
        repair: { attempted: true, failureCause: 'occlusion', attempts: [{ action: 'precondition_action' }], winningAction: 'precondition_action', outcome: 'ok-after-repair', terminalCause: null } },
      { id: 'check-win', type: 'scroll', status: 'check', origin: 'after-repair', findings: 1,
        repair: { attempted: true, failureCause: 'hidden_not_visible', attempts: [{ action: 'scroll_into_view' }], winningAction: 'scroll_into_view', outcome: 'ok-after-repair', terminalCause: null } },
      { id: 'stop', type: 'hover', status: 'empty', origin: 'first-try', cause: 'inert_representative', findings: 0,
        repair: { attempted: true, failureCause: 'inert_representative', attempts: [{ action: 'terminal_give_up' }], winningAction: null, outcome: 'terminal', terminalCause: 'genuinely_inert' } },
    ],
  }));
  const r = require('child_process').spawnSync(RUNTIME, [path.join(__dirname, '..', 'bin', 'calib-metrics'), dir, '--site', 'm'], { encoding: 'utf8' });
  const metrics = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
  ok('metrics: command succeeded', r.status === 0);
  ok('metrics: win bucketed under occlusion (not "other")', metrics.repair.by_bucket.occlusion && metrics.repair.by_bucket.occlusion.ok === 1);
  ok('metrics: repaired check bucketed under hidden_not_visible', metrics.repair.by_bucket.hidden_not_visible && metrics.repair.by_bucket.hidden_not_visible.ok === 1);
  ok('metrics: no spurious "other" bucket', !metrics.repair.by_bucket.other);
  ok('metrics: ok_after_repair split', metrics.captures.ok_after_repair === 1 && metrics.captures.ok_first_try === 0);
  ok('metrics: check_after_repair split', metrics.captures.check_after_repair === 1 && metrics.captures.check_first_try === 0);
  ok('metrics stdout: canonical usable scoreboard', r.stdout.includes('usable scoreboard: first_try=0 (ok=0 check=0); after_repair=2 (ok=1 check=1)'));
  ok('metrics stdout: no old ok/check repair split line', !r.stdout.includes('  ok: first_try='));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── SF8: terminal + low-confidence attempts DO consume budget ────────────────
{
  const budget = mkBudget(24);
  const env = makeEnv({
    repairContext: { animatableHere: {}, candidateTriggers: [], matches: [{ occludedBy: null }] },
    recapture: () => { throw new Error('no recapture for terminal'); },
  }).env;
  m.runRepairLoop(env, {
    capture: { root: '.t' }, type: 'hover', id: 'term-budget', url: 'u', viewport: [1, 1], map: {},
    result: { status: 'empty', cause: 'occlusion' }, config: CONFIG, budget, failSelector: '.t',
  });
  ok('SF8: a terminal attempt spends one budget unit', budget.remaining() === 23);
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
  ok('transport: bad command -> null (fail safe)', m.invokeRepairProvider(`${RUNTIME} /no/such/stub.js`, inputFile, null) === null);

  // SF7: a provider that prints diagnostics AFTER the path still resolves.
  const noisyStub = path.join(runDir, 'noisy-stub.js');
  fs.writeFileSync(noisyStub, [
    'const fs = require("fs");',
    'const input = process.argv[2];',
    'const outPath = input.replace(/input\\.json$/, "output.json");',
    'fs.writeFileSync(outPath, JSON.stringify({ diagnosis: "ok", rootCause: "occlusion", confidence: 0.7, action: { kind: "retarget_selector", selector: ".p" }, successCriterion: { expect: "moved" } }));',
    'process.stdout.write("starting provider...\\n" + outPath + "\\ndone (cleanup ok)\\n");',
  ].join('\n'));
  const noisy = m.invokeRepairProvider(`${RUNTIME} ${noisyStub}`, inputFile, null);
  ok('SF7: output path found despite trailing diagnostics', noisy && noisy.action && noisy.action.kind === 'retarget_selector');
}

// ── --repair-dump gating predicate (browser-free) ────────────────────────────
{
  const causes = m.DEFAULT_REPAIRABLE_CAUSES;
  const r = (status, cause) => ({ status, cause });
  // Off by default: no dump when the flag is not set, even for a repairable fail.
  ok('dump: flag off -> never dumps', m.shouldDumpRepairInput(r('empty', 'occlusion'), false, causes) === false);
  // Repairable empty/error of a repairable cause -> dump.
  ok('dump: repairable empty dumps', m.shouldDumpRepairInput(r('empty', 'occlusion'), true, causes) === true);
  ok('dump: repairable error dumps', m.shouldDumpRepairInput(r('error', 'hidden_not_visible'), true, causes) === true);
  ok('dump: inert_representative dumps', m.shouldDumpRepairInput(r('empty', 'inert_representative'), true, causes) === true);
  // Successes never dump.
  ok('dump: ok never dumps', m.shouldDumpRepairInput(r('ok', 'occlusion'), true, causes) === false);
  ok('dump: check never dumps', m.shouldDumpRepairInput(r('check', 'occlusion'), true, causes) === false);
  ok('dump: skipped never dumps', m.shouldDumpRepairInput(r('skipped', undefined), true, causes) === false);
  // Out-of-bucket causes are not dumped (Parts 2/4 already fixed these).
  ok('dump: pseudo_element not dumped by default', m.shouldDumpRepairInput(r('empty', 'pseudo_element'), true, causes) === false);
  ok('dump: wrong_document_iframe not dumped by default', m.shouldDumpRepairInput(r('error', 'wrong_document_iframe'), true, causes) === false);
  ok('dump: null cause not dumped', m.shouldDumpRepairInput(r('empty', null), true, causes) === false);
  ok('dump: missing result -> false', m.shouldDumpRepairInput(null, true, causes) === false);

  // repairDumpCauses: explicit --repair-causes narrows/overrides; default else.
  ok('dumpCauses: default is the narrow three', JSON.stringify(m.repairDumpCauses({})) === JSON.stringify(m.DEFAULT_REPAIRABLE_CAUSES));
  ok('dumpCauses: explicit list honored', JSON.stringify(m.repairDumpCauses({ repairCauses: ['occlusion'] })) === JSON.stringify(['occlusion']));
  ok('dumpCauses: junk causes filtered, falls back to default', JSON.stringify(m.repairDumpCauses({ repairCauses: ['made_up'] })) === JSON.stringify(m.DEFAULT_REPAIRABLE_CAUSES));
}

fs.rmSync(runDir, { recursive: true, force: true });
console.log(`repair-loop.test.js: ${passed} checks passed`);
