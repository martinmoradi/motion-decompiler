#!/usr/bin/env bun
'use strict';
/*
 * Deterministic, model-free stub repair provider (design §1, §5).
 *
 * Implements the external-command contract exactly:
 *   bun repair-stub-provider.js <input.json>    ->   writes <output.json>,
 *                                                     prints its path on stdout
 *
 * It returns canned repairs branched ONLY on structural fields of the diagnosis
 * input, so the capture-repair loop is exercisable with no real browser and no
 * LLM. The branches mirror the three residual shapes the smoke suite asserts:
 *   - nothing animatable + no occluder      -> terminal_give_up(genuinely_absent)
 *   - captureId contains "garbage"          -> invalid output (fail-safe path)
 *   - otherwise (state-gated / occluded)    -> precondition_action
 */

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write('repair-stub-provider: missing <input.json> argument\n');
  process.exit(2);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
  process.stderr.write(`repair-stub-provider: cannot read input: ${e.message}\n`);
  process.exit(2);
}

const id = String(input.captureId || '');
const rc = input.repairContext || {};
const anim = rc.animatableHere || {};
const animatable = Boolean(anim.selfHover || anim.pseudoHover || anim.childAnimated || anim.scrollTriggerBound);
const occluded = (Array.isArray(rc.matches) && rc.matches.some(m => m && m.occludedBy))
  || Boolean(input.failure && input.failure.causeSignals && input.failure.causeSignals.occludedBy);
const failSelector = (input.failedRecipe && input.failedRecipe.selector) || null;

let output;
if (id.includes('garbage')) {
  // Malformed on purpose: no action.kind -> the loop must fail safe to
  // terminal_give_up(provider_error), never act on it.
  output = { diagnosis: 'intentionally malformed', notAnAction: true };
} else if (!animatable && !occluded) {
  // Drift / genuinely absent: no occluder and nothing animatable nearby. The
  // honest result is a terminal STOP, not a hunt (design §7).
  output = {
    diagnosis: 'No occluder and nothing animatable near the target; motion appears to no longer exist.',
    rootCause: 'ambiguous',
    confidence: 0.9,
    action: { kind: 'terminal_give_up', terminalCause: 'genuinely_absent', rationale: 'no occluder + animatableHere all false' },
    successCriterion: { expect: 'moved' },
  };
} else {
  // State-gated / occluded: open or advance via the highest-signal candidate
  // trigger, then capture unchanged. precondition_action is stateful (the loop
  // forces a fresh, isolated re-run — M1).
  const trigger = (Array.isArray(rc.candidateTriggers) && rc.candidateTriggers[0] && rc.candidateTriggers[0].selector)
    || '.carousel__arrow--next';
  output = {
    diagnosis: `Target is state-gated; advance/open ${trigger} first, then capture.`,
    rootCause: (input.failure && input.failure.cause) || 'occlusion',
    confidence: 0.8,
    action: { kind: 'precondition_action', actions: [`click ${trigger}`, 'wait 400'] },
    successCriterion: failSelector ? { expect: 'moved', onSelector: failSelector } : { expect: 'moved' },
    abortCriterion: 'If still empty with no occluder, give up — inert.',
  };
}

const outPath = inputPath.replace(/input\.json$/, 'output.json').replace(/\.json$/, '.output.json');
const finalOut = /input\.json$/.test(inputPath) ? inputPath.replace(/input\.json$/, 'output.json') : outPath;
fs.writeFileSync(finalOut, JSON.stringify(output, null, 2) + '\n');
process.stdout.write(finalOut + '\n');
