#!/usr/bin/env bun
'use strict';
/*
 * Stateful local repair-loop coordinator for the Codex skill.
 *
 * This script never calls a provider or remote API. It writes diagnosis prompts
 * for local subscription subagents, accepts their final JSON, and delegates all
 * schema validation, repair application, re-measurement, and capture-results
 * provenance to repair-step.js.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA_VERSION = 1;
const DEFAULT_BATCH_SIZE = 6;
const SCRIPT_DIR = __dirname;
const REPAIR_STEP = path.join(SCRIPT_DIR, 'repair-step.js');
const PROMPT_TEMPLATE = path.resolve(SCRIPT_DIR, '..', 'references', 'diagnosis-subagent.md');

function fail(msg) {
  process.stderr.write(`repair-loop: ${msg}\n`);
  process.exit(2);
}

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
  }
  return out;
}

function req(args, name) {
  if (args[name] === undefined || args[name] === true) fail(`missing --${name}`);
  return args[name];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function findTool() {
  const candidates = [
    process.env.YOINKIT_BIN,
    path.join(process.cwd(), 'bin', 'yoinkit'),
    path.resolve(SCRIPT_DIR, '..', '..', '..', 'bin', 'yoinkit'),
  ].filter(Boolean);
  const found = candidates.find(p => {
    try { return fs.statSync(p).isFile(); } catch (e) { return false; }
  });
  if (!found) fail('cannot locate bin/yoinkit - run from the YoinkIt repo root or set YOINKIT_BIN');
  return found;
}

function loadTool() {
  return require(findTool());
}

function statePath(runDir) {
  return path.join(runDir, 'repair', 'loop-state.json');
}

function toRunRel(runDir, file) {
  const abs = path.resolve(file);
  const rel = path.relative(runDir, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : abs;
}

function resolveRunPath(runDir, file) {
  if (!file) return null;
  return path.isAbsolute(file) ? file : path.join(runDir, file);
}

function loadState(runDir) {
  const file = statePath(runDir);
  if (!fs.existsSync(file)) fail(`missing ${file}; run init first`);
  const state = readJson(file);
  if (state.schemaVersion !== SCHEMA_VERSION) fail(`unsupported loop-state schemaVersion ${state.schemaVersion}`);
  return state;
}

function saveState(runDir, state) {
  state.updatedAt = new Date().toISOString();
  writeJson(statePath(runDir), state);
}

function resultTriple(tool, result) {
  if (tool && typeof tool.resultTriple === 'function') return tool.resultTriple(result);
  const occ = (result && result.causeSignals && result.causeSignals.occludedBy) || '';
  return `${result && result.status}|${(result && result.cause) || ''}|${occ}`;
}

function recordById(state, id) {
  const record = (state.records || []).find(r => r.id === id);
  if (!record) fail(`no repair record with id "${id}"`);
  return record;
}

function attemptByNumber(record, attemptNo, create) {
  let attempt = (record.attempts || []).find(a => a.attempt === attemptNo);
  if (!attempt && create) {
    attempt = { attempt: attemptNo };
    record.attempts = record.attempts || [];
    record.attempts.push(attempt);
    record.attempts.sort((a, b) => a.attempt - b.attempt);
  }
  return attempt;
}

function safePathPart(value) {
  return String(value || 'capture').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function promptRelPath(id, attemptNo) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.prompt.md`);
}

function retryInputRelPath(id, attemptNo) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.input.json`);
}

function rawOutputRelPath(id, attemptNo) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.raw-output.json`);
}

function existingScreenshot(runDir, input) {
  const rel = input && input.screenshot;
  if (!rel) return 'Screenshot unavailable; reason from repairContext alone.';
  const abs = resolveRunPath(runDir, rel);
  return fs.existsSync(abs) ? abs : 'Screenshot unavailable; reason from repairContext alone.';
}

function historyRows(record) {
  return (record.attempts || [])
    .filter(a => a.appliedAt || a.applyVerdict || a.terminalization)
    .map(a => {
      const verdict = a.applyVerdict || {};
      const action = a.action || {};
      return {
        attempt: a.attempt,
        action: a.kind || action.kind || verdict.kind || null,
        params: action && Object.keys(action).length ? action : null,
        confidence: a.confidence == null ? null : a.confidence,
        resultStatus: verdict.status || null,
        resultCause: verdict.cause || null,
        resultTriple: a.resultTriple || verdict.resultTriple || null,
        occludedBy: verdict.occludedBy || null,
        outcome: verdict.outcome || null,
        terminalization: a.terminalization || null,
      };
    });
}

function historyNote(record) {
  const rows = historyRows(record);
  if (!rows.length) return '';
  const lines = rows.map(row => {
    const params = row.params ? JSON.stringify(row.params) : '{}';
    const measured = row.resultStatus || 'not measured';
    const occ = row.occludedBy || 'none';
    return `attempt ${row.attempt} used ${row.action || 'unknown'} (${params}) and the engine measured ${measured} (occludedBy: ${occ}); it did not converge.`;
  });
  return [
    'ATTEMPT HISTORY:',
    ...lines,
    'Do not repeat a prior action unchanged. Refine it, choose a different stable target/precondition, or give an honest terminal_give_up if nothing here animates.',
  ].join('\n');
}

function buildPrompt(runDir, inputRel, record, attemptNo) {
  const inputAbs = resolveRunPath(runDir, inputRel);
  const input = readJson(inputAbs);
  const screenshot = existingScreenshot(runDir, input);
  let prompt = fs.readFileSync(PROMPT_TEMPLATE, 'utf8')
    .replace(/\{INPUT_JSON_PATH\}/g, inputAbs)
    .replace(/\{SCREENSHOT_PATH\}/g, screenshot);
  if (attemptNo > 1) {
    prompt += `\n\n---\n\n## Retry Instruction\n\n${historyNote(record)}\n`;
  }
  return prompt;
}

function writeRetryInput(runDir, record, attemptNo) {
  const base = readJson(resolveRunPath(runDir, record.repairInput));
  base.attempt = attemptNo;
  base.attemptHistory = historyRows(record);
  base.retryInstruction = historyNote(record);
  const rel = retryInputRelPath(record.id, attemptNo);
  writeJson(resolveRunPath(runDir, rel), base);
  return rel;
}

function parseLastJson(stdout) {
  const lines = String(stdout || '').trim().split('\n').filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch (e) { /* keep scanning */ }
  }
  return null;
}

function runStep(sub, args, input) {
  const argv = [REPAIR_STEP, sub];
  for (const [key, value] of Object.entries(args)) {
    argv.push(`--${key}`);
    if (value !== true) argv.push(String(value));
  }
  const res = spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    input,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    verdict: parseLastJson(res.stdout),
  };
}

function cmdInit(args, tool) {
  const runDir = path.resolve(req(args, 'run'));
  const manifestFile = path.resolve(req(args, 'manifest'));
  const file = statePath(runDir);
  if (fs.existsSync(file) && !args.force) fail(`${file} already exists; pass --force to reinitialize`);

  const resultsDoc = readJson(path.join(runDir, 'capture-results.json'));
  const manifest = readJson(manifestFile);
  const results = Array.isArray(resultsDoc.results) ? resultsDoc.results : [];
  const captures = Array.isArray(manifest.captures) ? manifest.captures : [];
  const records = [];

  results.forEach((result, index) => {
    if (!result || !result.repairInput) return;
    const capture = captures[index] || {};
    const id = String(result.id || capture.id || `capture-${index + 1}`);
    const triple = resultTriple(tool, result);
    records.push({
      id,
      index,
      type: result.type || capture.type || null,
      repairInput: result.repairInput,
      originalResultTriple: triple,
      seenTriples: [triple],
      state: 'needs-diagnosis',
      nextAttempt: 1,
      attempts: [],
      terminalCause: null,
    });
  });

  const defaults = tool.REPAIR_DEFAULTS || { maxRetries: 2, confidenceFloor: 0.4, budgetMultiplier: 2, budgetCeiling: 24 };
  const budgetTotal = Math.min(defaults.budgetMultiplier * records.length, defaults.budgetCeiling);
  const now = new Date().toISOString();
  const state = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    manifestPath: toRunRel(runDir, manifestFile),
    manifestHash: sha256(manifestFile),
    limits: {
      maxRetries: defaults.maxRetries,
      confidenceFloor: defaults.confidenceFloor,
      budgetTotal,
      promptBatchSize: DEFAULT_BATCH_SIZE,
    },
    budgetSpent: 0,
    records,
  };
  saveState(runDir, state);
  emit({ initialized: true, repairable: records.length, budgetTotal, state: file });
}

function nextAttemptFor(record, state) {
  if (record.state === 'needs-diagnosis') return 1;
  if (record.state === 'needs-retry') return record.nextAttempt || ((record.attempts || []).length + 1);
  return null;
}

function cmdNextPrompts(args) {
  const runDir = path.resolve(req(args, 'run'));
  const state = loadState(runDir);
  const limit = Number(args.limit || state.limits.promptBatchSize || DEFAULT_BATCH_SIZE);
  const prompts = [];
  const budgetRemaining = Math.max(0, state.limits.budgetTotal - state.budgetSpent);

  for (const record of state.records || []) {
    if (prompts.length >= limit) break;
    const attemptNo = nextAttemptFor(record, state);
    if (!attemptNo) continue;
    if (attemptNo > state.limits.maxRetries) {
      record.state = 'unrepaired';
      continue;
    }
    if (budgetRemaining <= 0) {
      record.state = 'budget-exhausted';
      continue;
    }

    const attempt = attemptByNumber(record, attemptNo, true);
    if (attempt.rawOutputPath || attempt.validatedOutputPath || attempt.appliedAt) continue;

    const inputRel = attemptNo === 1 ? record.repairInput : writeRetryInput(runDir, record, attemptNo);
    const promptRel = promptRelPath(record.id, attemptNo);
    const promptAbs = resolveRunPath(runDir, promptRel);
    writeText(promptAbs, buildPrompt(runDir, inputRel, record, attemptNo));

    attempt.inputPath = inputRel;
    attempt.promptPath = promptRel;
    attempt.promptedAt = new Date().toISOString();
    record.state = 'waiting-output';
    record.nextAttempt = attemptNo;
    prompts.push({ id: record.id, attempt: attemptNo, prompt: promptAbs, input: resolveRunPath(runDir, inputRel) });
  }

  saveState(runDir, state);
  emit({
    prompts: prompts.length,
    batchLimit: limit,
    budgetRemaining,
    items: prompts,
  });
}

function cmdSaveOutput(args) {
  const runDir = path.resolve(req(args, 'run'));
  const id = String(req(args, 'id'));
  const attemptNo = Number(req(args, 'attempt'));
  if (!Number.isInteger(attemptNo) || attemptNo < 1) fail('--attempt must be a positive integer');

  const state = loadState(runDir);
  if (attemptNo > state.limits.maxRetries) fail(`attempt ${attemptNo} exceeds maxRetries ${state.limits.maxRetries}`);
  const record = recordById(state, id);
  const attempt = attemptByNumber(record, attemptNo, true);
  if (attempt.appliedAt) fail(`${id} attempt ${attemptNo} has already been applied`);

  const raw = args.file
    ? fs.readFileSync(path.resolve(String(args.file)), 'utf8')
    : fs.readFileSync(0, 'utf8');
  const rawRel = rawOutputRelPath(id, attemptNo);
  writeText(resolveRunPath(runDir, rawRel), raw);

  const saved = runStep('save-output', { run: runDir, id, attempt: attemptNo }, raw);
  const verdict = saved.verdict || { saved: false, valid: false, error: saved.stderr || 'repair-step save-output returned no verdict' };

  attempt.rawOutputPath = rawRel;
  attempt.saveOutputVerdict = verdict;
  attempt.outputSavedAt = new Date().toISOString();
  attempt.valid = Boolean(verdict.saved && verdict.valid);
  if (attempt.valid) {
    attempt.validatedOutputPath = toRunRel(runDir, verdict.output);
    attempt.kind = verdict.kind;
    attempt.confidence = verdict.confidence;
    try {
      const output = readJson(resolveRunPath(runDir, attempt.validatedOutputPath));
      attempt.action = output.action || null;
      attempt.successCriterion = output.successCriterion || null;
      attempt.diagnosis = output.diagnosis || null;
    } catch (e) { /* save-output already validated the file; keep going if it vanished */ }
  } else {
    attempt.validationError = verdict.error || saved.stderr || 'invalid repair output';
  }
  record.state = 'ready';
  record.nextAttempt = attemptNo;
  saveState(runDir, state);

  emit({
    saved: attempt.valid,
    ready: true,
    id,
    attempt: attemptNo,
    rawOutput: resolveRunPath(runDir, rawRel),
    output: attempt.validatedOutputPath ? resolveRunPath(runDir, attempt.validatedOutputPath) : null,
    error: attempt.validationError || null,
  });
}

function hasAnimatableHere(input) {
  const anim = input && input.repairContext && input.repairContext.animatableHere;
  return Boolean(anim && (anim.selfHover || anim.pseudoHover || anim.childAnimated || anim.scrollTriggerBound));
}

function duplicateTerminalCause(runDir, attempt, verdict) {
  let input = null;
  try { input = readJson(resolveRunPath(runDir, attempt.inputPath)); } catch (e) { input = null; }
  const occluded = Boolean(verdict && verdict.occludedBy);
  return (!hasAnimatableHere(input) && !occluded) ? 'genuinely_inert' : 'needs_human';
}

function latestReadyAttempt(record) {
  return (record.attempts || [])
    .filter(a => !a.appliedAt && (a.validatedOutputPath || a.rawOutputPath))
    .sort((a, b) => a.attempt - b.attempt)[0] || null;
}

function finalizeRecordAfterVerdict(runDir, state, record, attempt, verdict) {
  attempt.applyVerdict = verdict;
  attempt.appliedAt = new Date().toISOString();
  attempt.outcome = verdict.outcome || null;
  attempt.resultTriple = verdict.resultTriple || null;

  if (verdict.outcome === 'ok-after-repair' || verdict.converged) {
    record.state = 'ok-after-repair';
    record.completedAt = attempt.appliedAt;
    return null;
  }

  if (verdict.outcome === 'terminal') {
    record.state = 'terminal';
    record.terminalCause = verdict.terminalCause || null;
    record.completedAt = attempt.appliedAt;
    return null;
  }

  if (verdict.lowConfidence) {
    record.state = 'unrepaired';
    record.completedAt = attempt.appliedAt;
    return null;
  }

  if (verdict.measured && verdict.converged === false && verdict.resultTriple) {
    if ((record.seenTriples || []).includes(verdict.resultTriple)) {
      const cause = duplicateTerminalCause(runDir, attempt, verdict);
      const term = runStep('terminal', {
        run: runDir,
        id: record.id,
        attempt: attempt.attempt,
        cause,
        diagnosis: 'repeated-identical; not converging',
      });
      if (term.status !== 0 || !term.verdict) fail(`terminalizing ${record.id} failed: ${term.stderr || term.stdout}`);
      attempt.terminalization = { reason: 'repeated-identical', cause, verdict: term.verdict };
      record.state = 'terminal';
      record.terminalCause = cause;
      record.completedAt = new Date().toISOString();
      return term.verdict;
    }
    record.seenTriples = record.seenTriples || [];
    record.seenTriples.push(verdict.resultTriple);
    if (attempt.attempt < state.limits.maxRetries) {
      record.state = 'needs-retry';
      record.nextAttempt = attempt.attempt + 1;
    } else {
      record.state = 'unrepaired';
      record.completedAt = attempt.appliedAt;
    }
    return null;
  }

  record.state = 'unrepaired';
  record.completedAt = attempt.appliedAt;
  return null;
}

function cmdApplyReady(args) {
  const runDir = path.resolve(req(args, 'run'));
  const state = loadState(runDir);
  const manifest = resolveRunPath(runDir, state.manifestPath);
  const applied = [];
  const exhausted = [];

  for (const record of state.records || []) {
    if (record.state !== 'ready') continue;
    const attempt = latestReadyAttempt(record);
    if (!attempt) continue;
    const remaining = state.limits.budgetTotal - state.budgetSpent;
    if (remaining <= 0) {
      record.state = 'budget-exhausted';
      exhausted.push(record.id);
      continue;
    }

    const outputRel = attempt.validatedOutputPath || attempt.rawOutputPath;
    if (!outputRel) fail(`${record.id} attempt ${attempt.attempt} has no output path`);
    state.budgetSpent += 1;
    const res = runStep('apply', {
      run: runDir,
      manifest,
      index: record.index,
      id: record.id,
      output: resolveRunPath(runDir, outputRel),
      attempt: attempt.attempt,
    });
    if (res.status !== 0 || !res.verdict) {
      attempt.applyError = res.stderr || res.stdout || `repair-step apply exited ${res.status}`;
      saveState(runDir, state);
      fail(`applying ${record.id} attempt ${attempt.attempt} failed: ${attempt.applyError}`);
    }

    const terminalVerdict = finalizeRecordAfterVerdict(runDir, state, record, attempt, res.verdict);
    applied.push({
      id: record.id,
      attempt: attempt.attempt,
      verdict: res.verdict,
      terminalized: terminalVerdict || null,
      state: record.state,
    });
  }

  saveState(runDir, state);
  emit({
    applied: applied.length,
    budget: {
      spent: state.budgetSpent,
      total: state.limits.budgetTotal,
      remaining: Math.max(0, state.limits.budgetTotal - state.budgetSpent),
    },
    exhausted,
    items: applied,
  });
}

function summarizeResults(runDir, state) {
  let results = [];
  try {
    const doc = readJson(path.join(runDir, 'capture-results.json'));
    results = Array.isArray(doc.results) ? doc.results : [];
  } catch (e) {
    results = [];
  }

  const counts = {
    firstTry: 0,
    afterRepair: 0,
    terminal: 0,
    unrepaired: 0,
    pending: 0,
    budgetExhausted: 0,
  };

  for (const result of results) {
    if (!result) continue;
    const okish = result.status === 'ok' || result.status === 'check';
    const repair = result.repair || null;
    if (okish && (!repair || repair.outcome !== 'ok-after-repair')) counts.firstTry += 1;
    if (repair && repair.outcome === 'ok-after-repair') counts.afterRepair += 1;
    if (repair && repair.outcome === 'terminal') counts.terminal += 1;
    if (repair && repair.outcome === 'unrepaired') counts.unrepaired += 1;
  }

  const pendingStates = new Set(['needs-diagnosis', 'waiting-output', 'ready', 'needs-retry']);
  for (const record of state.records || []) {
    if (pendingStates.has(record.state)) counts.pending += 1;
    if (record.state === 'budget-exhausted') counts.budgetExhausted += 1;
  }
  return counts;
}

function cmdSummary(args) {
  const runDir = path.resolve(req(args, 'run'));
  const state = loadState(runDir);
  const counts = summarizeResults(runDir, state);
  const nextActions = {
    prompts: (state.records || []).filter(r => nextAttemptFor(r, state)).length,
    waitingOutput: (state.records || []).filter(r => r.state === 'waiting-output').length,
    applyReady: (state.records || []).filter(r => r.state === 'ready').length,
    retryReady: (state.records || []).filter(r => r.state === 'needs-retry').length,
  };
  emit({
    repairable: (state.records || []).length,
    counts,
    budget: {
      spent: state.budgetSpent,
      total: state.limits.budgetTotal,
      remaining: Math.max(0, state.limits.budgetTotal - state.budgetSpent),
    },
    nextActions,
    state: statePath(runDir),
  });
}

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const tool = loadTool();
  if (sub === 'init') cmdInit(args, tool);
  else if (sub === 'next-prompts') cmdNextPrompts(args);
  else if (sub === 'save-output') cmdSaveOutput(args);
  else if (sub === 'apply-ready') cmdApplyReady(args);
  else if (sub === 'summary') cmdSummary(args);
  else fail(`unknown subcommand "${sub}" (use: init | next-prompts | save-output | apply-ready | summary)`);
}

main();
