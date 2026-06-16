#!/usr/bin/env bun
'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skill', 'codex', 'scripts', 'repair-loop.js');
const FAKE = path.join(__dirname, 'fixtures', 'fake-yoinkit-tool.js');
const tempDirs = new Set();
fs.chmodSync(FAKE, 0o755);

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function mkRun(count = 1, repairContext = null) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-coord-'));
  tempDirs.add(runDir);
  const captures = [];
  const results = [];
  const ids = [];
  const rc = repairContext || {
    animatableHere: { selfHover: false, pseudoHover: false, childAnimated: true, scrollTriggerBound: false },
    candidateTriggers: [{ selector: '.next' }],
    matches: [{ occludedBy: '.cover' }],
  };

  for (let i = 0; i < count; i += 1) {
    const id = `cap-${i + 1}`;
    ids.push(id);
    captures.push({ id, type: 'hover', root: `.target-${i + 1}` });
    const inputRel = path.join('repair', `${id}.attempt-1.input.json`);
    const shotRel = path.join('repair', `${id}.attempt-1.png`);
    writeJson(path.join(runDir, inputRel), {
      captureId: id,
      attempt: 1,
      url: 'https://example.test/',
      viewport: [1280, 800],
      failure: { status: 'empty', cause: 'occlusion', causeSignals: { occludedBy: '.cover' } },
      failedRecipe: { type: 'hover', selector: `.target-${i + 1}`, root: `.target-${i + 1}` },
      screenshot: shotRel,
      mapSubtree: {},
      repairContext: JSON.parse(JSON.stringify(rc)),
      attemptHistory: [],
    });
    fs.writeFileSync(path.join(runDir, shotRel), 'fake png');
    results.push({
      id,
      type: 'hover',
      status: 'empty',
      cause: 'occlusion',
      causeSignals: { occludedBy: '.cover' },
      findings: 0,
      origin: 'first-try',
      repairInput: inputRel,
    });
  }

  const manifestFile = path.join(runDir, 'manifest.proposed.json');
  writeJson(manifestFile, { url: 'https://example.test/', captures });
  writeJson(path.join(runDir, 'capture-results.json'), { capturedAt: 'x', count, results });
  return { runDir, manifestFile, ids };
}

function runLoop(sub, args, input, env = {}) {
  const argv = [SCRIPT, sub];
  for (const [k, v] of Object.entries(args)) {
    argv.push(`--${k}`);
    if (v !== true) argv.push(String(v));
  }
  const r = spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    input,
    env: Object.assign({}, process.env, { YOINKIT_BIN: FAKE }, env),
  });
  if (r.status !== 0) throw new Error(`repair-loop ${sub} exited ${r.status}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function validRepair(selector = '.fixed') {
  return {
    diagnosis: 'Retarget to the visible moving element.',
    rootCause: 'occlusion',
    confidence: 0.8,
    action: { kind: 'retarget_selector', selector },
    successCriterion: { expect: 'moved' },
  };
}

function state(runDir) {
  return readJson(path.join(runDir, 'repair', 'loop-state.json'));
}

test('init discovers repairable rows and computes budget', () => {
  const { runDir, manifestFile } = mkRun(3);
  const out = runLoop('init', { run: runDir, manifest: manifestFile });
  const s = state(runDir);

  expect(out.repairable).toBe(3);
  expect(out.budgetTotal).toBe(6);
  expect(s.records).toHaveLength(3);
  expect(s.records[0].index).toBe(0);
  expect(s.records[0].originalResultTriple).toBe('empty|occlusion|.cover');
});

test('next-prompts writes attempt-1 prompts and caps the batch at six', () => {
  const { runDir, manifestFile } = mkRun(7);
  runLoop('init', { run: runDir, manifest: manifestFile });
  const out = runLoop('next-prompts', { run: runDir });
  const s = state(runDir);

  expect(out.prompts).toBe(6);
  expect(out.items).toHaveLength(6);
  expect(fs.existsSync(out.items[0].prompt)).toBe(true);
  expect(fs.readFileSync(out.items[0].prompt, 'utf8')).toContain('Diagnosis subagent');
  expect(s.records.filter(r => r.state === 'waiting-output')).toHaveLength(6);
  expect(s.records.filter(r => r.state === 'needs-diagnosis')).toHaveLength(1);
});

test('save-output stores valid and invalid outputs, and invalid output applies as provider_error terminal', () => {
  const { runDir, manifestFile, ids } = mkRun(1);
  runLoop('init', { run: runDir, manifest: manifestFile });
  runLoop('next-prompts', { run: runDir });

  const saved = runLoop('save-output', { run: runDir, id: ids[0], attempt: 1 }, '{ nope');
  expect(saved.saved).toBe(false);
  expect(saved.ready).toBe(true);
  expect(fs.existsSync(saved.rawOutput)).toBe(true);
  expect(state(runDir).records[0].attempts[0].valid).toBe(false);

  const applied = runLoop('apply-ready', { run: runDir });
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];
  expect(applied.applied).toBe(1);
  expect(applied.budget.spent).toBe(1);
  expect(row.repair.outcome).toBe('terminal');
  expect(row.repair.terminalCause).toBe('provider_error');
});

test('apply-ready converges a repair and preserves repair-step provenance', () => {
  const { runDir, manifestFile, ids } = mkRun(1);
  runLoop('init', { run: runDir, manifest: manifestFile });
  runLoop('next-prompts', { run: runDir });
  runLoop('save-output', { run: runDir, id: ids[0], attempt: 1 }, JSON.stringify(validRepair('.fixed')));

  const applied = runLoop('apply-ready', { run: runDir }, undefined, { FAKE_ENGINE_STATUS: 'ok', FAKE_MOVED: '.fixed' });
  const s = state(runDir);
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];

  expect(applied.applied).toBe(1);
  expect(s.budgetSpent).toBe(1);
  expect(s.records[0].state).toBe('ok-after-repair');
  expect(row.origin).toBe('after-repair');
  expect(row.repair.outcome).toBe('ok-after-repair');
  expect(row.repair.winningAction).toBe('retarget_selector');
});

test('a distinct failed attempt produces an attempt-2 prompt with history', () => {
  const { runDir, manifestFile, ids } = mkRun(1);
  runLoop('init', { run: runDir, manifest: manifestFile });
  runLoop('next-prompts', { run: runDir });
  runLoop('save-output', { run: runDir, id: ids[0], attempt: 1 }, JSON.stringify(validRepair('.miss')));
  runLoop('apply-ready', { run: runDir }, undefined, { FAKE_ENGINE_STATUS: 'empty' });

  expect(state(runDir).records[0].state).toBe('needs-retry');
  const prompts = runLoop('next-prompts', { run: runDir });
  const retryInput = readJson(path.join(runDir, 'repair', `${ids[0]}.attempt-2.input.json`));
  const promptText = fs.readFileSync(prompts.items[0].prompt, 'utf8');

  expect(prompts.prompts).toBe(1);
  expect(retryInput.attempt).toBe(2);
  expect(retryInput.attemptHistory).toHaveLength(1);
  expect(promptText).toContain('ATTEMPT HISTORY');
  expect(promptText).toContain('Do not repeat');
});

test('repeated-identical recapture terminalizes automatically', () => {
  const inertContext = {
    animatableHere: { selfHover: false, pseudoHover: false, childAnimated: false, scrollTriggerBound: false },
    candidateTriggers: [{ selector: '.next' }],
    matches: [{ occludedBy: null }],
  };
  const { runDir, manifestFile, ids } = mkRun(1, inertContext);
  runLoop('init', { run: runDir, manifest: manifestFile });
  runLoop('next-prompts', { run: runDir });
  runLoop('save-output', { run: runDir, id: ids[0], attempt: 1 }, JSON.stringify(validRepair('.miss')));
  runLoop('apply-ready', { run: runDir }, undefined, { FAKE_ENGINE_STATUS: 'empty' });
  runLoop('next-prompts', { run: runDir });
  runLoop('save-output', { run: runDir, id: ids[0], attempt: 2 }, JSON.stringify(validRepair('.miss-again')));

  const applied = runLoop('apply-ready', { run: runDir }, undefined, { FAKE_ENGINE_STATUS: 'empty' });
  const s = state(runDir);
  const row = readJson(path.join(runDir, 'capture-results.json')).results[0];

  expect(applied.items[0].terminalized.terminalCause).toBe('genuinely_inert');
  expect(s.records[0].state).toBe('terminal');
  expect(s.records[0].terminalCause).toBe('genuinely_inert');
  expect(row.repair.outcome).toBe('terminal');
  expect(row.repair.terminalCause).toBe('genuinely_inert');
});

test('budget exhaustion prevents new applies and is visible in summary', () => {
  const { runDir, manifestFile, ids } = mkRun(1);
  runLoop('init', { run: runDir, manifest: manifestFile });
  runLoop('next-prompts', { run: runDir });
  runLoop('save-output', { run: runDir, id: ids[0], attempt: 1 }, JSON.stringify(validRepair('.fixed')));

  const file = path.join(runDir, 'repair', 'loop-state.json');
  const s = state(runDir);
  s.budgetSpent = s.limits.budgetTotal;
  writeJson(file, s);

  const applied = runLoop('apply-ready', { run: runDir });
  const summary = runLoop('summary', { run: runDir });

  expect(applied.applied).toBe(0);
  expect(applied.exhausted).toEqual([ids[0]]);
  expect(summary.budget.remaining).toBe(0);
  expect(summary.counts.budgetExhausted).toBe(1);
});
