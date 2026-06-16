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

const SCHEMA_VERSION = 2;
const DEFAULT_WORKER_LIMIT = 6;
const DEFAULT_WAVE_SIZE = 10;
const DEFAULT_CAPTURES_PER_PROMPT = 3;
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

function batchPromptRelPath(batchId) {
  return path.join('repair', `${safePathPart(batchId)}.prompt.md`);
}

function batchInputRelPath(batchId) {
  return path.join('repair', `${safePathPart(batchId)}.input.json`);
}

function retryInputRelPath(id, attemptNo) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.input.json`);
}

function rawOutputRelPath(id, attemptNo) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.raw-output.json`);
}

function batchRawOutputRelPath(batchId) {
  return path.join('repair', `${safePathPart(batchId)}.raw-output.json`);
}

function hypothesisOutputRelPath(id, attemptNo, role) {
  return path.join('repair', `${safePathPart(id)}.attempt-${attemptNo}.${safePathPart(role)}.output.json`);
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

function buildBatchPrompt(runDir, inputRel, captures) {
  const inputAbs = resolveRunPath(runDir, inputRel);
  const list = captures.map(c => `- ${c.id} attempt ${c.attempt}: ${c.input}`).join('\n');
  const history = captures
    .map(c => c.context && c.context.retryInstruction)
    .filter(Boolean)
    .join('\n\n');
  return fs.readFileSync(PROMPT_TEMPLATE, 'utf8')
    .replace(/\{BATCH_INPUT_JSON_PATH\}/g, inputAbs)
    .replace(/\{INPUT_JSON_PATH\}/g, inputAbs)
    .replace(/\{SCREENSHOT_PATH\}/g, 'See each capture.screenshot in the batch input JSON.')
    .concat(`\n\n---\n\n## Batch Contents\n\n${list}\n${history ? `\n\n---\n\n## Retry Instructions\n\n${history}\n` : ''}`);
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
    if (value === undefined || value === null) continue;
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

function validateRepairObject(tool, output) {
  if (tool && typeof tool.validateRepairOutput === 'function') return tool.validateRepairOutput(output);
  return { valid: false, error: 'repair validation helper unavailable' };
}

function fillAttemptFromOutput(runDir, attempt, outputRel, role, validated) {
  attempt.validatedOutputPath = outputRel;
  attempt.valid = true;
  attempt.hypothesisRole = role;
  attempt.kind = validated.repair.action.kind;
  attempt.confidence = validated.repair.confidence;
  attempt.action = outputRel ? readJson(resolveRunPath(runDir, outputRel)).action || null : null;
  attempt.successCriterion = validated.repair.successCriterion || null;
  attempt.diagnosis = validated.repair.diagnosis || null;
}

function saveHypothesisOutput(runDir, id, attemptNo, role, output) {
  const rel = hypothesisOutputRelPath(id, attemptNo, role);
  writeJson(resolveRunPath(runDir, rel), output);
  return rel;
}

function terminalFromOutput(output, validated, outputRel, role, batchId) {
  return {
    role,
    batchId,
    outputPath: outputRel,
    valid: true,
    action: output.action || null,
    confidence: validated.repair.confidence,
    diagnosis: validated.repair.diagnosis || null,
  };
}

function queueItemFromOutput(runDir, id, attemptNo, role, output, validated, outputRel, batchId, inputPath, promptPath) {
  return {
    role,
    batchId,
    attempt: attemptNo,
    inputPath,
    promptPath,
    outputPath: outputRel,
    valid: true,
    kind: validated.repair.action.kind,
    confidence: validated.repair.confidence,
    action: output.action || null,
    successCriterion: validated.repair.successCriterion || null,
    diagnosis: validated.repair.diagnosis || null,
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
      promptBatchSize: DEFAULT_WORKER_LIMIT,
      promptWorkerLimit: DEFAULT_WORKER_LIMIT,
      promptWaveSize: DEFAULT_WAVE_SIZE,
      capturesPerPrompt: DEFAULT_CAPTURES_PER_PROMPT,
    },
    budgetSpent: 0,
    nextBatchNo: 1,
    batches: [],
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
  const workerLimit = Math.max(1, Number(args.limit || state.limits.promptWorkerLimit || state.limits.promptBatchSize || DEFAULT_WORKER_LIMIT));
  const waveSize = Math.max(1, Number(args.waveSize || state.limits.promptWaveSize || DEFAULT_WAVE_SIZE));
  const capturesPerPrompt = Math.max(1, Number(args.capturesPerPrompt || state.limits.capturesPerPrompt || DEFAULT_CAPTURES_PER_PROMPT));
  const captureLimit = Math.min(waveSize, workerLimit * capturesPerPrompt);
  const selected = [];
  const batches = [];
  const budgetRemaining = Math.max(0, state.limits.budgetTotal - state.budgetSpent);

  for (const record of state.records || []) {
    if (selected.length >= captureLimit) break;
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
    const inputAbs = resolveRunPath(runDir, inputRel);
    const input = readJson(inputAbs);
    selected.push({
      record,
      attempt,
      attemptNo,
      inputRel,
      inputAbs,
      screenshot: existingScreenshot(runDir, input),
      context: input,
    });
  }

  state.batches = state.batches || [];
  state.nextBatchNo = state.nextBatchNo || 1;
  for (let i = 0; i < selected.length; i += capturesPerPrompt) {
    const group = selected.slice(i, i + capturesPerPrompt);
    const batchId = `batch-${state.nextBatchNo++}`;
    const batchInputRel = batchInputRelPath(batchId);
    const batchPromptRel = batchPromptRelPath(batchId);
    const captures = group.map(({ record, attemptNo, inputRel, inputAbs, screenshot, context }) => ({
      id: record.id,
      captureId: record.id,
      attempt: attemptNo,
      input: inputAbs,
      inputPath: inputRel,
      screenshot,
      context,
    }));
    writeJson(resolveRunPath(runDir, batchInputRel), {
      batchId,
      captures,
      outputContract: 'Return a JSON array with one item per captureId. Each item contains captureId, primary, fallback, and terminal hypotheses.',
    });
    writeText(resolveRunPath(runDir, batchPromptRel), buildBatchPrompt(runDir, batchInputRel, captures));

    const now = new Date().toISOString();
    for (const item of group) {
      item.attempt.inputPath = item.inputRel;
      item.attempt.promptPath = batchPromptRel;
      item.attempt.batchId = batchId;
      item.attempt.promptedAt = now;
      item.record.state = 'waiting-output';
      item.record.nextAttempt = item.attemptNo;
    }

    const batch = {
      batchId,
      promptPath: batchPromptRel,
      inputPath: batchInputRel,
      createdAt: now,
      captures: captures.map(c => ({ id: c.id, attempt: c.attempt, inputPath: c.inputPath, screenshot: c.screenshot })),
    };
    state.batches.push(batch);
    batches.push({
      batchId,
      prompt: resolveRunPath(runDir, batchPromptRel),
      input: resolveRunPath(runDir, batchInputRel),
      captures: captures.map(c => ({ id: c.id, attempt: c.attempt, input: c.input, screenshot: c.screenshot })),
    });
  }

  saveState(runDir, state);
  emit({
    prompts: batches.length,
    batchLimit: workerLimit,
    captureLimit,
    capturesPerPrompt,
    budgetRemaining,
    items: batches,
  });
}

function cmdSaveSingleOutput(args) {
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

function markBatchCaptureProviderError(record, attempt, rawRel, error, batchId) {
  attempt.rawOutputPath = rawRel;
  attempt.batchId = batchId;
  attempt.outputSavedAt = new Date().toISOString();
  attempt.valid = false;
  attempt.validationError = error;
  attempt.saveOutputVerdict = { saved: false, valid: false, error };
  record.state = 'ready';
  record.nextAttempt = attempt.attempt;
}

function cmdSaveBatchOutput(args, tool) {
  const runDir = path.resolve(req(args, 'run'));
  const batchId = String(req(args, 'batch'));
  const state = loadState(runDir);
  const batch = (state.batches || []).find(b => b.batchId === batchId);
  if (!batch) fail(`no prompt batch with id "${batchId}"`);

  const raw = args.file
    ? fs.readFileSync(path.resolve(String(args.file)), 'utf8')
    : fs.readFileSync(0, 'utf8');
  const rawRel = batchRawOutputRelPath(batchId);
  writeText(resolveRunPath(runDir, rawRel), raw);

  let parsed = null;
  let parseError = null;
  try { parsed = JSON.parse(raw); }
  catch (e) { parseError = `invalid JSON on stdin: ${e.message}`; }
  if (parsed && !Array.isArray(parsed)) parseError = 'batch output must be a JSON array';

  const byId = new Map();
  if (!parseError) {
    for (const item of parsed) {
      if (item && item.captureId != null) byId.set(String(item.captureId), item);
    }
  }

  const items = [];
  for (const capture of batch.captures || []) {
    const record = recordById(state, capture.id);
    const attempt = attemptByNumber(record, Number(capture.attempt), true);
    if (attempt.appliedAt) fail(`${record.id} attempt ${attempt.attempt} has already been applied`);
    attempt.rawOutputPath = rawRel;
    attempt.outputSavedAt = new Date().toISOString();
    attempt.batchId = batchId;
    attempt.hypothesisValidation = {};
    record.hypothesisQueue = record.hypothesisQueue || [];

    const item = byId.get(record.id);
    if (parseError || !item) {
      const error = parseError || `batch output missing captureId ${record.id}`;
      markBatchCaptureProviderError(record, attempt, rawRel, error, batchId);
      items.push({ id: record.id, attempt: attempt.attempt, saved: false, ready: true, error });
      continue;
    }

    const primary = validateRepairObject(tool, item.primary);
    attempt.hypothesisValidation.primary = primary.valid ? { valid: true } : { valid: false, error: primary.error };
    if (!primary.valid) {
      markBatchCaptureProviderError(record, attempt, rawRel, primary.error || 'invalid primary hypothesis', batchId);
      items.push({ id: record.id, attempt: attempt.attempt, saved: false, ready: true, error: attempt.validationError });
      continue;
    }

    const primaryRel = saveHypothesisOutput(runDir, record.id, attempt.attempt, 'primary', item.primary);
    fillAttemptFromOutput(runDir, attempt, primaryRel, 'primary', primary);

    record.hypothesisQueue = [];
    let fallbackQueued = false;
    let terminalQueued = false;
    let fallbackError = null;
    let terminalError = null;

    if (item.fallback != null && attempt.attempt < state.limits.maxRetries) {
      const fallback = validateRepairObject(tool, item.fallback);
      attempt.hypothesisValidation.fallback = fallback.valid ? { valid: true } : { valid: false, error: fallback.error };
      if (fallback.valid && fallback.repair.action.kind !== 'terminal_give_up') {
        const fallbackAttempt = attempt.attempt + 1;
        const fallbackRel = saveHypothesisOutput(runDir, record.id, fallbackAttempt, 'fallback', item.fallback);
        record.hypothesisQueue.push(queueItemFromOutput(runDir, record.id, fallbackAttempt, 'fallback', item.fallback, fallback, fallbackRel, batchId, attempt.inputPath, attempt.promptPath));
        fallbackQueued = true;
      } else {
        fallbackError = fallback.valid ? 'fallback must be actionable, not terminal_give_up' : fallback.error;
      }
    }

    if (item.terminal != null) {
      const terminal = validateRepairObject(tool, item.terminal);
      attempt.hypothesisValidation.terminal = terminal.valid ? { valid: true } : { valid: false, error: terminal.error };
      if (terminal.valid && terminal.repair.action.kind === 'terminal_give_up') {
        const terminalRel = saveHypothesisOutput(runDir, record.id, attempt.attempt, 'terminal', item.terminal);
        record.terminalHypothesis = terminalFromOutput(item.terminal, terminal, terminalRel, 'terminal', batchId);
        terminalQueued = true;
      } else {
        terminalError = terminal.valid ? 'terminal must use terminal_give_up' : terminal.error;
      }
    }

    record.state = 'ready';
    record.nextAttempt = attempt.attempt;
    items.push({
      id: record.id,
      attempt: attempt.attempt,
      saved: true,
      ready: true,
      output: resolveRunPath(runDir, primaryRel),
      fallbackQueued,
      terminalQueued,
      fallbackError,
      terminalError,
    });
  }

  batch.rawOutputPath = rawRel;
  batch.outputSavedAt = new Date().toISOString();
  saveState(runDir, state);
  emit({
    saved: items.filter(item => item.saved).length,
    ready: items.length,
    batch: batchId,
    rawOutput: resolveRunPath(runDir, rawRel),
    items,
  });
}

function cmdSaveOutput(args, tool) {
  if (args.batch) return cmdSaveBatchOutput(args, tool);
  return cmdSaveSingleOutput(args);
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

function queueNextHypothesis(record, attempt, state) {
  const queue = record.hypothesisQueue || [];
  const next = queue.shift();
  record.hypothesisQueue = queue;
  if (!next) return null;
  if (next.attempt > state.limits.maxRetries) return null;
  const nextAttempt = attemptByNumber(record, next.attempt, true);
  if (nextAttempt.appliedAt) return null;
  nextAttempt.inputPath = next.inputPath || attempt.inputPath;
  nextAttempt.promptPath = next.promptPath || attempt.promptPath;
  nextAttempt.batchId = next.batchId || attempt.batchId || null;
  nextAttempt.validatedOutputPath = next.outputPath;
  nextAttempt.valid = true;
  nextAttempt.hypothesisRole = next.role || 'fallback';
  nextAttempt.kind = next.kind;
  nextAttempt.confidence = next.confidence;
  nextAttempt.action = next.action || null;
  nextAttempt.successCriterion = next.successCriterion || null;
  nextAttempt.diagnosis = next.diagnosis || null;
  nextAttempt.outputSavedAt = new Date().toISOString();
  record.state = 'ready';
  record.nextAttempt = nextAttempt.attempt;
  return nextAttempt;
}

function terminalizeFromHypothesis(runDir, record, attempt, reason) {
  const terminal = record.terminalHypothesis;
  if (!terminal || !terminal.valid || !terminal.action || terminal.action.kind !== 'terminal_give_up') return null;
  const args = {
    run: runDir,
    id: record.id,
    attempt: attempt.attempt,
    cause: terminal.action.terminalCause || 'needs_human',
    diagnosis: terminal.diagnosis || terminal.action.rationale || `ranked terminal after ${reason}`,
  };
  if (terminal.confidence != null) args.confidence = terminal.confidence;
  const term = runStep('terminal', args);
  if (term.status !== 0 || !term.verdict) fail(`terminalizing ${record.id} failed: ${term.stderr || term.stdout}`);
  terminal.appliedAt = new Date().toISOString();
  attempt.terminalization = { reason: 'ranked-terminal', cause: term.verdict.terminalCause, verdict: term.verdict };
  record.state = 'terminal';
  record.terminalCause = term.verdict.terminalCause || null;
  record.completedAt = terminal.appliedAt;
  return term.verdict;
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
    const queued = queueNextHypothesis(record, attempt, state);
    if (queued) return { queuedHypothesis: queued };
    const terminalVerdict = terminalizeFromHypothesis(runDir, record, attempt, 'low-confidence primary');
    if (terminalVerdict) return terminalVerdict;
    record.state = 'unrepaired';
    record.completedAt = attempt.appliedAt;
    return null;
  }

  if (verdict.measured && verdict.converged === false && verdict.resultTriple) {
    const queued = queueNextHypothesis(record, attempt, state);
    if (queued) return { queuedHypothesis: queued };
    const terminalVerdict = terminalizeFromHypothesis(runDir, record, attempt, 'failed ranked hypotheses');
    if (terminalVerdict) return terminalVerdict;
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

  const queued = queueNextHypothesis(record, attempt, state);
  if (queued) return { queuedHypothesis: queued };
  const terminalVerdict = terminalizeFromHypothesis(runDir, record, attempt, 'unrepaired hypothesis');
  if (terminalVerdict) return terminalVerdict;
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

    const followup = finalizeRecordAfterVerdict(runDir, state, record, attempt, res.verdict);
    const queuedHypothesis = followup && followup.queuedHypothesis ? followup.queuedHypothesis : null;
    const terminalVerdict = followup && followup.queuedHypothesis ? null : followup;
    applied.push({
      id: record.id,
      attempt: attempt.attempt,
      verdict: res.verdict,
      terminalized: terminalVerdict || null,
      queuedHypothesis: queuedHypothesis ? { attempt: queuedHypothesis.attempt, role: queuedHypothesis.hypothesisRole || null } : null,
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
  else if (sub === 'save-output') cmdSaveOutput(args, tool);
  else if (sub === 'apply-ready') cmdApplyReady(args);
  else if (sub === 'summary') cmdSummary(args);
  else fail(`unknown subcommand "${sub}" (use: init | next-prompts | save-output | apply-ready | summary)`);
}

main();
