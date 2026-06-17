'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  loadPageModel,
  mapReportDir,
  motionScoutDir,
  readJson,
  savePageModel,
  staticMapDir,
  writeJson,
} = require('./artifacts');

const MAP_GATE_SCHEMA_VERSION = 1;

class MapGateBlockedError extends Error {
  constructor(message, gate) {
    super(message);
    this.name = 'MapGateBlockedError';
    this.gate = gate;
  }
}

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function runRelativePath(runDir, file) {
  return path.relative(runDir, file).split(path.sep).join('/');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stableJson(value) {
  return JSON.stringify(value);
}

function pageModelWithoutMapGateExceptions(pageModel) {
  const next = JSON.parse(JSON.stringify(pageModel || {}));
  if (Array.isArray(next.exceptions)) {
    next.exceptions = next.exceptions.filter(item => !(item && item.stage === 'map-gate'));
  }
  return next;
}

function samePageModelExceptGateExceptions(runDir, snapshot) {
  if (!snapshot || !snapshot.pageModel) return false;
  try {
    const current = readJson(path.join(runDir, 'page-model.json'));
    return stableJson(pageModelWithoutMapGateExceptions(current)) === stableJson(pageModelWithoutMapGateExceptions(snapshot.pageModel));
  } catch (error) {
    return false;
  }
}

function requiredInputFiles(runDir) {
  return [
    path.join(runDir, 'page-model.json'),
    path.join(staticMapDir(runDir), 'assertions.json'),
    path.join(staticMapDir(runDir), 'coverage.md'),
    path.join(motionScoutDir(runDir), 'assertions.json'),
    path.join(motionScoutDir(runDir), 'coverage.md'),
  ];
}

function inputHashes(runDir) {
  const hashes = {};
  for (const file of requiredInputFiles(runDir)) {
    hashes[runRelativePath(runDir, file)] = sha256File(file);
  }
  return hashes;
}

function evaluateFreshness(runDir, snapshot) {
  const expected = snapshot && snapshot.inputHashes && typeof snapshot.inputHashes === 'object'
    ? snapshot.inputHashes
    : {};
  const hashes = {};
  const blockers = [];

  for (const [relativeFile, expectedHash] of Object.entries(expected)) {
    const file = path.join(runDir, relativeFile);
    if (!fs.existsSync(file)) {
      blockers.push({
        id: relativeFile,
        source: 'report-freshness',
        status: 'missing',
        message: `${relativeFile} is missing; rerun map-report`,
      });
      continue;
    }
    const hash = sha256File(file);
    hashes[relativeFile] = hash;
    if (hash !== expectedHash) {
      if (relativeFile === 'page-model.json' && samePageModelExceptGateExceptions(runDir, snapshot)) {
        continue;
      }
      blockers.push({
        id: relativeFile,
        source: 'report-freshness',
        status: 'stale',
        message: `${relativeFile} changed after Report v0; rerun map-report`,
      });
    }
  }

  return {
    hashes,
    blockers,
    summary: {
      staleInputs: blockers.filter(item => item.status === 'stale').length,
      missingInputs: blockers.filter(item => item.status === 'missing').length,
    },
  };
}

function exceptionIdFor(row) {
  return row && (row.exceptionId || row.exception || row.exceptionRef || null);
}

function requiredFailures(assertionArtifact, source, approvedExceptions = new Set()) {
  const rows = Array.isArray(assertionArtifact && assertionArtifact.assertions)
    ? assertionArtifact.assertions
    : [];
  return rows
    .filter(row => row && row.required && row.status === 'fail')
    .filter(row => !approvedExceptions.has(exceptionIdFor(row)))
    .map(row => ({
      id: row.id,
      source,
      kind: row.kind || null,
      status: 'fail',
      message: row.failure || row.id,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
    }));
}

function assertionSummary(staticAssertions, motionAssertions, approvedExceptions = new Set()) {
  const rows = []
    .concat(Array.isArray(staticAssertions.assertions) ? staticAssertions.assertions : [])
    .concat(Array.isArray(motionAssertions.assertions) ? motionAssertions.assertions : []);
  const required = rows.filter(row => row && row.required);
  const exceptedRequired = required
    .filter(row => row.status === 'fail' && approvedExceptions.has(exceptionIdFor(row)))
    .length;
  const failedRequired = required
    .filter(row => row.status === 'fail' && !approvedExceptions.has(exceptionIdFor(row)))
    .length;
  return {
    total: rows.length,
    required: required.length,
    failedRequired,
    exceptedRequired,
  };
}

function tableCell(value) {
  return String(value || '').replace(/\\\|/g, '|').trim();
}

function headerCell(value) {
  return tableCell(value).toLowerCase().replace(/\s+/g, '-');
}

function cellAt(cells, headers, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return cells[index] || '';
  }
  return '';
}

function parseCoverageRows(markdown) {
  const rows = [];
  let headers = [];
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    if (/^\|\s*-/.test(line)) continue;
    const cells = line.slice(1, -1).split('|').map(tableCell);
    const normalized = cells.map(headerCell);
    if (normalized.includes('status')) {
      headers = normalized;
      continue;
    }
    if (!headers.includes('status')) continue;
    const area = cellAt(cells, headers, ['area', 'source', 'candidate', 'region']) || cells[0] || '';
    const required = cellAt(cells, headers, ['required']);
    const status = cellAt(cells, headers, ['status']);
    rows.push({
      area,
      required: /^(yes|true|required)$/i.test(required),
      status: String(status || '').toLowerCase(),
      evidence: cellAt(cells, headers, ['evidence']),
      reason: cellAt(cells, headers, ['reason']),
    });
  }
  return rows.filter(row => row.area);
}

function coveragePasses(row) {
  return ['complete', 'pass', 'passed', 'out_of_scope', 'out of scope', 'exception', 'approved'].includes(row.status);
}

function coverageBlockers(markdown, source) {
  return parseCoverageRows(markdown)
    .filter(row => row.required && !coveragePasses(row))
    .map(row => ({
      id: row.area,
      source,
      status: row.status || 'missing',
      message: row.reason || `${row.area} coverage is ${row.status || 'missing'}`,
      evidence: row.evidence ? [row.evidence] : [],
    }));
}

function coverageSummary(staticCoverageText, motionCoverageText) {
  const staticBlockers = coverageBlockers(staticCoverageText, 'static-map-coverage');
  const motionBlockers = coverageBlockers(motionCoverageText, 'motion-scout-coverage');
  return {
    summary: {
      staticMap: { incompleteRequired: staticBlockers.length },
      motionScout: { incompleteRequired: motionBlockers.length },
    },
    blockers: staticBlockers.concat(motionBlockers),
  };
}

function gateInputsFromSnapshot(snapshot) {
  return {
    staticAssertions: snapshot.staticMap && snapshot.staticMap.assertions,
    motionAssertions: snapshot.motionScout && snapshot.motionScout.assertions,
    staticCoverageText: snapshot.staticMap && snapshot.staticMap.coverageText,
    motionCoverageText: snapshot.motionScout && snapshot.motionScout.coverageText,
    pageModel: snapshot.pageModel,
  };
}

function readGateInputs(runDir, snapshot, freshness) {
  if (freshness.summary.missingInputs > 0) {
    return gateInputsFromSnapshot(snapshot);
  }
  return {
    staticAssertions: readJson(path.join(staticMapDir(runDir), 'assertions.json')),
    motionAssertions: readJson(path.join(motionScoutDir(runDir), 'assertions.json')),
    staticCoverageText: fs.readFileSync(path.join(staticMapDir(runDir), 'coverage.md'), 'utf8'),
    motionCoverageText: fs.readFileSync(path.join(motionScoutDir(runDir), 'coverage.md'), 'utf8'),
    pageModel: loadPageModel(runDir),
  };
}

function blockedApprovalPrefix(freshness) {
  if (freshness.summary.missingInputs > 0) return 'Report v0 inputs are missing; rerun map-report';
  if (freshness.summary.staleInputs > 0) return 'Report v0 is stale; rerun map-report';
  return 'Map Gate approval blocked';
}

function pageRegions(pageModel) {
  const home = pageModel && pageModel.pages && pageModel.pages.home;
  return home && Array.isArray(home.regions) ? home.regions : [];
}

function unknownSummary(pageModel) {
  const unknowns = [];
  for (const region of pageRegions(pageModel)) {
    const rows = Array.isArray(region.unknowns) ? region.unknowns : [];
    for (const [index, unknown] of rows.entries()) {
      const field = unknown && unknown.field ? unknown.field : `unknown-${index + 1}`;
      unknowns.push({
        id: `${region.id}:${field}`,
        regionId: region.id,
        field,
        reason: unknown && typeof unknown.reason === 'string' ? unknown.reason.trim() : '',
      });
    }
  }
  const blockers = unknowns
    .filter(item => !item.reason)
    .map(item => ({
      id: item.id,
      source: 'page-model-unknowns',
      status: 'unknown',
      message: `${item.id} is unknown without a reason`,
    }));
  return {
    summary: {
      total: unknowns.length,
      withoutReason: blockers.length,
    },
    blockers,
  };
}

function parseScope(scope) {
  const match = String(scope || '').match(/^([^:]+):(.+)$/);
  if (!match || !match[1].trim() || !match[2].trim()) {
    throw new Error('map-gate --approve-exception requires --scope <kind:id>');
  }
  return { kind: match[1].trim(), id: match[2].trim() };
}

function approvedExceptionIds(pageModel) {
  return (Array.isArray(pageModel.exceptions) ? pageModel.exceptions : [])
    .filter(item => item && item.stage === 'map-gate' && item.approvedBy === 'human' && item.approvedAt)
    .map(item => item.id);
}

function exceptionBlockers(pageModel) {
  return (Array.isArray(pageModel.exceptions) ? pageModel.exceptions : [])
    .filter(item => item && item.stage === 'map-gate')
    .filter(item => !(item.approvedBy === 'human' && item.approvedAt))
    .map(item => ({
      id: item.id,
      source: 'page-model-exceptions',
      status: 'exception',
      message: item.reason || `${item.id} requires human approval`,
    }));
}

function approveException(pageModel, decision, approvedAt) {
  if (!(typeof decision.reason === 'string' && decision.reason.trim())) {
    throw new Error('map-gate --approve-exception requires --reason with a human-readable reason');
  }
  const scope = parseScope(decision.scope);
  const next = JSON.parse(JSON.stringify(pageModel));
  if (!Array.isArray(next.exceptions)) next.exceptions = [];
  const existing = next.exceptions.find(item => item && item.id === decision.exceptionId);
  const record = existing || { id: decision.exceptionId };
  record.stage = 'map-gate';
  record.scope = scope;
  record.reason = decision.reason.trim();
  record.approvedBy = 'human';
  record.approvedAt = approvedAt;
  if (decision.expiresAfterStage) record.expiresAfterStage = decision.expiresAfterStage;
  if (!existing) next.exceptions.push(record);
  return next;
}

function writeGate(runDir, gate) {
  const file = path.join(mapReportDir(runDir), 'gate.json');
  writeJson(file, gate);
  return file;
}

function runMapGate(runDir, decision, env = {}) {
  const absRunDir = path.resolve(runDir);
  const reportDir = mapReportDir(absRunDir);
  const reportFile = path.join(reportDir, 'index.html');
  const snapshotFile = path.join(reportDir, 'report-snapshot.json');
  if (!fs.existsSync(reportFile) || !fs.existsSync(snapshotFile)) {
    throw new Error('map-gate requires current Report v0; rerun map-report');
  }

  const snapshot = readJson(snapshotFile);
  const freshness = evaluateFreshness(absRunDir, snapshot);
  const inputs = readGateInputs(absRunDir, snapshot, freshness);
  const staticAssertions = inputs.staticAssertions || { assertions: [] };
  const motionAssertions = inputs.motionAssertions || { assertions: [] };
  const coverage = coverageSummary(inputs.staticCoverageText, inputs.motionCoverageText);
  let pageModel = inputs.pageModel || {};
  if (decision.action === 'approve-exception') {
    pageModel = approveException(pageModel, decision, nowIso(env));
    savePageModel(absRunDir, pageModel);
  }
  const exceptionIds = approvedExceptionIds(pageModel);
  const approvedExceptions = new Set(exceptionIds);
  const unknowns = unknownSummary(pageModel);
  const exceptions = exceptionBlockers(pageModel);
  const blockers = freshness.blockers
    .concat(requiredFailures(staticAssertions, 'static-map-assertions', approvedExceptions))
    .concat(requiredFailures(motionAssertions, 'motion-scout-assertions', approvedExceptions))
    .concat(coverage.blockers)
    .concat(unknowns.blockers)
    .concat(exceptions);

  const gate = {
    schemaVersion: MAP_GATE_SCHEMA_VERSION,
    stage: 'map-gate',
    updatedAt: nowIso(env),
    inputHashes: Object.keys(freshness.hashes).length ? freshness.hashes : inputHashes(absRunDir),
    freshnessSummary: freshness.summary,
    assertionSummary: assertionSummary(staticAssertions, motionAssertions, approvedExceptions),
    coverageSummary: coverage.summary,
    unknownSummary: unknowns.summary,
    exceptionIds,
    decision: decision.action === 'approve-exception'
      ? 'exception-approved'
      : (decision.action === 'reject' ? 'rejected' : (blockers.length ? 'blocked' : 'approved')),
    humanDecision: {
      action: decision.action,
      note: decision.note || null,
      reason: decision.reason || null,
      exceptionId: decision.exceptionId || null,
      scope: decision.scope || null,
    },
    blockers,
  };
  gate.artifacts = { gate: path.join(mapReportDir(absRunDir), 'gate.json') };
  writeGate(absRunDir, gate);

  if (decision.action === 'approve' && blockers.length) {
    const prefix = blockedApprovalPrefix(freshness);
    throw new MapGateBlockedError(`${prefix}: ${blockers.map(item => item.id).join(', ')}`, gate);
  }

  return gate;
}

module.exports = {
  MAP_GATE_SCHEMA_VERSION,
  MapGateBlockedError,
  runMapGate,
};
