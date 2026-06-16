#!/usr/bin/env bun
'use strict';
/*
 * repair-step.js coverage — browser-free, model-free.
 *
 * Drives skill/codex/scripts/repair-step.js as a subprocess with YOINKIT_BIN
 * pointed at a fake tool (tests/fixtures/fake-yoinkit-tool.js) that re-exports
 * the real helpers but fakes the ENGINE capture. Proves the deterministic bridge
 * matches the in-tool loop contract:
 *   (A) a converged apply rewrites the row from the engine recapture and CLEARS
 *       stale failure fields + promotes the sub-run timeline,
 *   (B) the sub-run timeline is read via engine.timelineRef (not a guessed path),
 *   (C) group setup is prepended ahead of the repair precondition in the field
 *       executeRecipe runs,
 *   (D) cmdTerminal coerces an unknown --cause to needs_human.
 */

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skill', 'codex', 'scripts', 'repair-step.js');
const FAKE = path.join(__dirname, 'fixtures', 'fake-yoinkit-tool.js');
const tempDirs = new Set();
fs.chmodSync(FAKE, 0o755);

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function mkRun(resultRow) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-step-test-'));
  tempDirs.add(runDir);
  writeJson(path.join(runDir, 'capture-results.json'), { capturedAt: 'x', count: 1, results: [resultRow] });
  return runDir;
}

function parseVerdict(stdout) {
  return JSON.parse(stdout.trim().split('\n').filter(Boolean).pop());
}

function runStepRaw(sub, args, env = {}, input = undefined) {
  const argv = [SCRIPT, sub];
  for (const [k, v] of Object.entries(args)) { argv.push(`--${k}`); if (v !== true) argv.push(String(v)); }
  return spawnSync(process.execPath, argv, { encoding: 'utf8', input, env: Object.assign({}, process.env, { YOINKIT_BIN: FAKE }, env) });
}

function runStep(sub, args, env = {}, input = undefined) {
  const r = runStepRaw(sub, args, env, input);
  if (r.status !== 0) throw new Error(`repair-step ${sub} exited ${r.status}: ${r.stderr}`);
  return { stdout: r.stdout, verdict: parseVerdict(r.stdout) };
}

function validRepairOutput(selector = '.fixed') {
  return {
    diagnosis: 'target the visible moving affordance',
    rootCause: 'occlusion',
    confidence: 0.8,
    action: { kind: 'retarget_selector', selector },
    successCriterion: { expect: 'moved' },
  };
}

test('apply converges, clears stale failure fields, and promotes timelineRef', () => {
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

  expect(verdict.converged).toBe(true);
  expect(verdict.measured).toBe(true);
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  expect(row.status).toBe('ok');
  expect(row.origin).toBe('after-repair');
  expect(!('cause' in row) || row.cause == null).toBe(true);
  expect(!('causeSignals' in row) || row.causeSignals == null).toBe(true);
  expect(!('error' in row) || row.error == null).toBe(true);
  expect(!('preflight' in row) || row.preflight == null).toBe(true);
  expect(!('pageState' in row) || row.pageState == null).toBe(true);
  expect('lowConfidenceDiagnosis' in row).toBe(false);
  expect(row.stop).toBe(null);
  expect(row.summary).toBe('fake recapture summary');
  expect(row.findings).toBe(1);
  expect(row.page && row.page.engine).toBe(true);
  expect(row.page && row.page.repairRecapture).toBe(true);
  expect(row.repair.failureCause).toBe('occlusion');
  expect(row.repair.outcome).toBe('ok-after-repair');
  expect(row.repair.winningAction).toBe('retarget_selector');
  expect(row.repair.attempts).toHaveLength(1);
  expect(row.repair.terminalCause).toBe(null);
  expect(row.timelineRef).toBe(path.join('timelines', 'work-card-hover.json'));
  expect(fs.existsSync(path.join(runDir, 'timelines', 'work-card-hover.json'))).toBe(true);
});

test('apply prepends group setup ahead of repair precondition in setupAction', () => {
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
  expect(cloned.setupAction[0]).toBe('click .dismiss-intro');
  expect(cloned.setupAction.indexOf('click .opener') > 0).toBe(true);
  expect(cloned.setupAction[cloned.setupAction.length - 1]).toBe('eval window.x=1');
  expect((cloned.beforeAction || []).includes('click .dismiss-intro')).toBe(false);
  expect(cloned.fresh).toBe(true);
  expect(cloned.id).toBe('cap');
});

test('terminal coerces unknown causes to needs_human', () => {
  const runDir = mkRun({ id: 'x', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const { verdict } = runStep('terminal', { run: runDir, id: 'x', cause: 'totally_bogus', attempt: 1 });
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  expect(row.repair.terminalCause).toBe('needs_human');
  expect(verdict.terminalCause).toBe('needs_human');
  expect(row.repair.outcome).toBe('terminal');
});

test('terminal preserves valid causes', () => {
  const runDir = mkRun({ id: 'y', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  runStep('terminal', { run: runDir, id: 'y', cause: 'genuinely_inert', attempt: 1 });
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  expect(row.repair.terminalCause).toBe('genuinely_inert');
});

test('save-output validates stdin, writes deterministic output, and apply consumes it', () => {
  const runDir = mkRun({ id: 'save-cap', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const manifestFile = path.join(runDir, 'manifest.json');
  writeJson(manifestFile, { url: 'https://example.test/', captures: [{ id: 'save-cap', type: 'hover', root: '.old' }] });

  const output = validRepairOutput('.new-target');
  const saved = runStep('save-output', { run: runDir, id: 'save-cap', attempt: 1 }, {}, JSON.stringify(output));
  const outputFile = path.join(runDir, 'repair', 'save-cap.attempt-1.output.json');

  expect(saved.verdict.saved).toBe(true);
  expect(saved.verdict.valid).toBe(true);
  expect(saved.verdict.id).toBe('save-cap');
  expect(saved.verdict.attempt).toBe(1);
  expect(saved.verdict.output).toBe(outputFile);
  expect(saved.verdict.kind).toBe('retarget_selector');
  expect(saved.verdict.confidence).toBe(0.8);
  expect(readJson(outputFile)).toEqual(output);

  const applied = runStep('apply',
    { run: runDir, manifest: manifestFile, index: 0, id: 'save-cap', output: outputFile, attempt: 1 },
    { FAKE_ENGINE_STATUS: 'ok', FAKE_MOVED: '.new-target' });

  expect(applied.verdict.converged).toBe(true);
  expect(readJson(path.join(runDir, 'capture-results.json')).results[0].repair.outcome).toBe('ok-after-repair');
});

test('save-output rejects malformed stdin and writes nothing', () => {
  const runDir = mkRun({ id: 'bad-json', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const r = runStepRaw('save-output', { run: runDir, id: 'bad-json', attempt: 1 }, {}, '{ nope');
  const outputFile = path.join(runDir, 'repair', 'bad-json.attempt-1.output.json');
  const verdict = parseVerdict(r.stdout);

  expect(r.status).toBe(2);
  expect(verdict.saved).toBe(false);
  expect(verdict.valid).toBe(false);
  expect(verdict.error.includes('invalid JSON on stdin')).toBe(true);
  expect(fs.existsSync(outputFile)).toBe(false);
});

test('save-output rejects schema-invalid stdin and writes nothing', () => {
  const runDir = mkRun({ id: 'bad-schema', type: 'hover', status: 'empty', cause: 'occlusion', findings: 0 });
  const invalid = Object.assign(validRepairOutput(), { action: { kind: 'retarget_selector' } });
  const r = runStepRaw('save-output', { run: runDir, id: 'bad-schema', attempt: 1 }, {}, JSON.stringify(invalid));
  const outputFile = path.join(runDir, 'repair', 'bad-schema.attempt-1.output.json');
  const verdict = parseVerdict(r.stdout);

  expect(r.status).toBe(2);
  expect(verdict.saved).toBe(false);
  expect(verdict.valid).toBe(false);
  expect(verdict.error).toBe('retarget_selector needs a concrete selector');
  expect(fs.existsSync(outputFile)).toBe(false);
});
