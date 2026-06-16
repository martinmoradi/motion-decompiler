#!/usr/bin/env bun
'use strict';
/*
 * Test double for bin/yoinkit, used by repair-step.test.js.
 *
 *  - When REQUIRED (require.main !== module) it re-exports the REAL tool's
 *    helpers (validateRepairOutput, applyRepair, meetsSuccess, …) so repair-step's
 *    apply/success contract stays byte-identical to production.
 *  - When RUN as `capture <subRun> <subManifest>` it fakes the ENGINE with NO
 *    browser: it writes a canned capture-results.json + timeline driven by env
 *    vars, so the deterministic apply→record path can be exercised offline.
 *
 * Env knobs (all optional):
 *   FAKE_ENGINE_STATUS   ok | empty | error      (default ok)
 *   FAKE_MOVED           selector that "moved"    (default: capture root/selector)
 *   FAKE_TIMELINE_REF    relative timeline path the engine reports + writes to
 *                        (default timelines/<capture.id>.json) — used to prove
 *                        repair-step prefers engine.timelineRef.
 */
const fs = require('fs');
const path = require('path');
const realBin = path.resolve(__dirname, '..', '..', 'bin', 'yoinkit');

if (require.main !== module) {
  module.exports = require(realBin);
} else {
  const [sub, subRun, subManifestFile] = process.argv.slice(2);
  if (sub !== 'capture') process.exit(0);

  const manifest = JSON.parse(fs.readFileSync(subManifestFile, 'utf8'));
  const capture = (manifest.captures || [])[0] || {};
  const id = capture.id || 'capture-1';
  const type = String(capture.type || 'manual').toLowerCase();
  const status = process.env.FAKE_ENGINE_STATUS || 'ok';
  const moved = process.env.FAKE_MOVED || capture.root || capture.selector || '.moved';
  const timelineRel = process.env.FAKE_TIMELINE_REF || path.join('timelines', `${id}.json`);

  const writeJson = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  };

  const result = { id, type, status, stop: null, page: { strategy: capture.fresh ? 'fresh' : 'reuse-page', opened: true, group: capture.group || null, engine: true } };
  if (status === 'ok' || status === 'check') {
    const timeline = { summary: 'fake recapture summary', findings: [{ selector: moved, frames: [] }], meta: { elementsMoved: 1 } };
    writeJson(path.join(subRun, timelineRel), timeline);
    result.timelineRef = timelineRel;
    result.summary = timeline.summary;
    result.findings = 1;
  } else {
    result.summary = 'fake empty recapture';
    result.findings = 0;
    result.cause = 'inert_representative';
    result.causeSignals = {};
  }
  writeJson(path.join(subRun, 'capture-results.json'), { capturedAt: '2026-06-16T00:00:00.000Z', count: 1, results: [result] });
}
