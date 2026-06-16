#!/usr/bin/env node
'use strict';
/*
 * repair-step.js coverage — browser-free, model-free.
 *
 * Drives skill/codex/scripts/repair-step.js as a subprocess with MOTION_DECOMPILE_BIN
 * pointed at a fake tool (tests/fixtures/fake-decompile-tool.js) that re-exports
 * the real helpers but fakes the ENGINE capture. Proves the deterministic bridge
 * matches the in-tool loop contract:
 *   (A) a converged apply rewrites the row from the engine recapture and CLEARS
 *       stale failure fields + promotes the sub-run timeline,
 *   (B) the sub-run timeline is read via engine.timelineRef (not a guessed path),
 *   (C) group setup is prepended ahead of the repair precondition in the field
 *       executeRecipe runs,
 *   (D) cmdTerminal coerces an unknown --cause to needs_human.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skill', 'codex', 'scripts', 'repair-step.js');
const FAKE = path.join(__dirname, 'fixtures', 'fake-decompile-tool.js');
fs.chmodSync(FAKE, 0o755);

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed += 1; }

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function mkRun(resultRow) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-step-test-'));
  writeJson(path.join(runDir, 'capture-results.json'), { capturedAt: 'x', count: 1, results: [resultRow] });
  return runDir;
}

function runStep(sub, args, env = {}) {
  const argv = [SCRIPT, sub];
  for (const [k, v] of Object.entries(args)) { argv.push(`--${k}`); if (v !== true) argv.push(String(v)); }
  const r = spawnSync('node', argv, { encoding: 'utf8', env: Object.assign({}, process.env, { MOTION_DECOMPILE_BIN: FAKE }, env) });
  if (r.status !== 0) throw new Error(`repair-step ${sub} exited ${r.status}: ${r.stderr}`);
  return { stdout: r.stdout, verdict: JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop()) };
}

// ── (A)+(B) converged apply: row reflects engine recapture, stale fields gone,
//            timeline read via engine.timelineRef + promoted. ────────────────
{
  const runDir = mkRun({
    id: 'work-card-hover', type: 'hover', status: 'empty',
    cause: 'occlusion', causeSignals: { occludedBy: '.cover' }, error: 'boom',
    stop: 'error', preflight: { status: 'covered' }, pageState: { blocked: false },
    page: { strategy: 'reuse-page', opened: true }, findings: 0, summary: 'old failure summary',
    lowConfidenceDiagnosis: 'stale note',
  });
  const manifestFile = path.join(runDir, 'manifest.json');
  writeJson(manifestFile, { url: 'https://example.test/', captures: [{ id: 'work-card-hover', type: 'hover', root: 'a.card' }] });
  const outputFile = path.join(runDir, 'out.json');
  writeJson(outputFile, { diagnosis: 'use the visible card', rootCause: 'occlusion', confidence: 0.8,
    action: { kind: 'retarget_selector', selector: 'a.card-visible' }, successCriterion: { expect: 'moved' } });

  // The engine reports its timeline at a non-default path; repair-step must read
  // it via engine.timelineRef (proves fix #3), then promote to the id-based name.
  const { verdict } = runStep('apply',
    { run: runDir, manifest: manifestFile, index: 0, id: 'work-card-hover', output: outputFile, attempt: 1 },
    { FAKE_ENGINE_STATUS: 'ok', FAKE_MOVED: 'a.card-visible', FAKE_TIMELINE_REF: 'timelines/sub-weird-name.json' });

  ok('(A) verdict converged', verdict.converged === true && verdict.measured === true);
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  ok('(A) status is engine ok', row.status === 'ok');
  ok('(A) origin after-repair', row.origin === 'after-repair');
  ok('(A) stale cause cleared', !('cause' in row) || row.cause == null);
  ok('(A) stale causeSignals cleared', !('causeSignals' in row) || row.causeSignals == null);
  ok('(A) stale error cleared', !('error' in row) || row.error == null);
  ok('(A) stale preflight cleared', !('preflight' in row) || row.preflight == null);
  ok('(A) stale pageState cleared', !('pageState' in row) || row.pageState == null);
  ok('(A) stale lowConfidenceDiagnosis cleared', !('lowConfidenceDiagnosis' in row));
  ok('(A) stop from recapture (null)', row.stop === null);
  ok('(A) summary from recapture', row.summary === 'fake recapture summary');
  ok('(A) findings from timeline', row.findings === 1);
  ok('(A) page provenance from recapture', row.page && row.page.engine === true && row.page.repairRecapture === true);
  ok('(A) repair block preserves original failureCause', row.repair.failureCause === 'occlusion');
  ok('(A) repair outcome ok-after-repair', row.repair.outcome === 'ok-after-repair');
  ok('(A) winningAction retarget_selector', row.repair.winningAction === 'retarget_selector');
  ok('(A) one attempt recorded', row.repair.attempts.length === 1);
  ok('(A) terminalCause null on success', row.repair.terminalCause === null);
  // (B) the timeline was read (via engine.timelineRef) and promoted to the id name.
  ok('(B) timelineRef promoted to id path', row.timelineRef === path.join('timelines', 'work-card-hover.json'));
  ok('(B) promoted timeline file exists', fs.existsSync(path.join(runDir, 'timelines', 'work-card-hover.json')));
  fs.rmSync(runDir, { recursive: true, force: true });
}

// ── (C) group setup prepended ahead of the repair precondition, in the field
//        executeRecipe runs (setupAction when the capture already has one). ───
{
  const runDir = mkRun({ id: 'cap', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const manifestFile = path.join(runDir, 'manifest.json');
  writeJson(manifestFile, {
    url: 'https://example.test/',
    captureGroups: { 'main-page-after-intro': { setupAction: 'click .dismiss-intro' } },
    captures: [{ id: 'cap', type: 'hover', root: '.t', setupAction: 'eval window.x=1' }],
  });
  const outputFile = path.join(runDir, 'out.json');
  writeJson(outputFile, { diagnosis: 'open it first', rootCause: 'occlusion', confidence: 0.8,
    action: { kind: 'precondition_action', actions: ['click .opener', 'wait 300'] }, successCriterion: { expect: 'moved' } });

  runStep('apply', { run: runDir, manifest: manifestFile, index: 0, id: 'cap', output: outputFile, attempt: 1 }, { FAKE_ENGINE_STATUS: 'ok' });

  const subManifest = readJson(path.join(runDir, 'repair', 'apply-cap-att1', 'apply-manifest.json'));
  const cloned = subManifest.captures[0];
  // applyRepair put the precondition into setupAction (the capture had one), so
  // prependGroupSetup must prepend the group setup to setupAction, not beforeAction.
  ok('(C) group setup runs first in setupAction', cloned.setupAction[0] === 'click .dismiss-intro');
  ok('(C) precondition follows group setup', cloned.setupAction.indexOf('click .opener') > 0);
  ok('(C) original capture setup preserved last', cloned.setupAction[cloned.setupAction.length - 1] === 'eval window.x=1');
  ok('(C) group setup NOT misplaced into beforeAction', !(cloned.beforeAction || []).includes('click .dismiss-intro'));
  ok('(C) fresh:true for stateful precondition', cloned.fresh === true);
  ok('(C) cloned id forced to the run id', cloned.id === 'cap');
  fs.rmSync(runDir, { recursive: true, force: true });
}

// ── (D) cmdTerminal validates --cause against the closed vocabulary ──────────
{
  const runDir = mkRun({ id: 'x', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const { verdict } = runStep('terminal', { run: runDir, id: 'x', cause: 'totally_bogus', attempt: 1 });
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  ok('(D) unknown cause coerced to needs_human', row.repair.terminalCause === 'needs_human');
  ok('(D) verdict reports coerced cause', verdict.terminalCause === 'needs_human');
  ok('(D) outcome terminal', row.repair.outcome === 'terminal');
  fs.rmSync(runDir, { recursive: true, force: true });

  const runDir2 = mkRun({ id: 'y', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  runStep('terminal', { run: runDir2, id: 'y', cause: 'genuinely_inert', attempt: 1 });
  const row2 = readJson(path.join(runDir2, 'capture-results.json')).results[0];
  ok('(D) valid cause passes through', row2.repair.terminalCause === 'genuinely_inert');
  fs.rmSync(runDir2, { recursive: true, force: true });
}

console.log(`repair-step.test.js: ${passed} checks passed`);
