'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  loadRunConfig,
  loadPageModel,
  mapReportDir,
  motionScoutDir,
  readJson,
  savePageModel,
  staticMapDir,
  writeJson,
} = require('./artifacts');
const { mapWorkbenchRequiredInputFiles } = require('./map-inputs');
const { REQUIRED_DISCOVERY_SOURCES } = require('./motion-scout');

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

function serializedJson(value) {
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
    return serializedJson(pageModelWithoutMapGateExceptions(current)) === serializedJson(pageModelWithoutMapGateExceptions(snapshot.pageModel));
  } catch (error) {
    return false;
  }
}

function inputHashes(runDir) {
  const hashes = {};
  for (const file of mapWorkbenchRequiredInputFiles(runDir)) {
    if (!fs.existsSync(file)) continue;
    hashes[runRelativePath(runDir, file)] = sha256File(file);
  }
  return hashes;
}

function requiredInputHashKeys(runDir) {
  return mapWorkbenchRequiredInputFiles(runDir).map(file => runRelativePath(runDir, file));
}

function containedRunPath(runDir, relativeFile) {
  const root = path.resolve(runDir);
  const resolved = path.resolve(root, relativeFile);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) return resolved;
  return null;
}

function evaluateFreshness(runDir, snapshot) {
  const expected = snapshot && snapshot.inputHashes && typeof snapshot.inputHashes === 'object'
    ? snapshot.inputHashes
    : null;
  const hashes = {};
  const blockers = [];
  const requiredKeys = requiredInputHashKeys(runDir);
  const requiredKeySet = new Set(requiredKeys);

  if (!expected || Object.keys(expected).length === 0) {
    blockers.push({
      id: 'report-snapshot-input-hashes',
      source: 'report-freshness',
      status: 'missing',
      message: 'Report v0 input hashes are missing; rerun map-report',
    });
    return {
      hashes,
      blockers,
      summary: {
        staleInputs: 0,
        missingInputs: 1,
      },
    };
  }

  for (const relativeFile of Object.keys(expected)) {
    const file = containedRunPath(runDir, relativeFile);
    if (!file) {
      blockers.push({
        id: relativeFile,
        source: 'report-freshness',
        status: 'invalid',
        message: `${relativeFile} escapes the run directory; rerun map-report`,
      });
      continue;
    }
    if (!requiredKeySet.has(relativeFile)) {
      blockers.push({
        id: relativeFile,
        source: 'report-freshness',
        status: 'unexpected',
        message: `${relativeFile} is not a Map Report input; rerun map-report`,
      });
    }
  }

  for (const relativeFile of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(expected, relativeFile)) {
      blockers.push({
        id: relativeFile,
        source: 'report-freshness',
        status: 'missing',
        message: `${relativeFile} is missing from Report v0 input hashes; rerun map-report`,
      });
      continue;
    }
    const expectedHash = expected[relativeFile];
    const file = containedRunPath(runDir, relativeFile);
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
      unexpectedInputs: blockers.filter(item => item.status === 'unexpected' || item.status === 'invalid').length,
    },
  };
}

function exceptionIdFor(row) {
  return row && (row.exceptionId || row.exception || row.exceptionRef || null);
}

function pageRegions(pageModel) {
  const home = pageModel && pageModel.pages && pageModel.pages.home;
  return home && Array.isArray(home.regions) ? home.regions : [];
}

function knownRegionIds(pageModel) {
  return pageRegions(pageModel)
    .map(region => region && region.id)
    .filter(Boolean);
}

function regionIdForId(id, pageModel) {
  const target = String(id || '');
  return knownRegionIds(pageModel)
    .sort((left, right) => right.length - left.length)
    .find(regionId => target.startsWith(`static-map-${regionId}-`) || target.startsWith(`motion-scout-${regionId}-`)) || null;
}

function assertionRegionId(row, pageModel) {
  if (row && row.regionId && knownRegionIds(pageModel).includes(row.regionId)) return row.regionId;
  return regionIdForId(row && row.id, pageModel);
}

function approvedScopeMatchesRegion(regionId, approvedExceptionRecords) {
  if (!regionId) return false;
  return approvedExceptionRecords.some(item => (
    item &&
    item.scope &&
    item.scope.kind === 'region' &&
    item.scope.id === regionId
  ));
}

function assertionExcepted(row, pageModel, approvedExceptions, approvedExceptionRecords) {
  const exceptionId = exceptionIdFor(row);
  if (exceptionId && approvedExceptions.has(exceptionId)) {
    const approvedRecord = approvedExceptionRecords.find(item => item && item.id === exceptionId);
    return approvedScopeMatchesRegion(assertionRegionId(row, pageModel), approvedRecord ? [approvedRecord] : []);
  }
  return approvedScopeMatchesRegion(assertionRegionId(row, pageModel), approvedExceptionRecords);
}

function requiredFailures(assertionArtifact, source, approvedExceptions = new Set(), pageModel = {}, approvedExceptionRecords = []) {
  const rows = Array.isArray(assertionArtifact && assertionArtifact.assertions)
    ? assertionArtifact.assertions
    : [];
  return rows
    .filter(row => row && row.required && row.status !== 'pass')
    .filter(row => !assertionExcepted(row, pageModel, approvedExceptions, approvedExceptionRecords))
    .map(row => ({
      id: row.id,
      source,
      kind: row.kind || null,
      status: row.status || 'missing',
      message: row.failure || row.id,
      evidence: Array.isArray(row.evidence) ? row.evidence : [],
    }));
}

function assertionSummary(staticAssertions, motionAssertions, approvedExceptions = new Set(), pageModel = {}, approvedExceptionRecords = []) {
  const rows = []
    .concat(Array.isArray(staticAssertions.assertions) ? staticAssertions.assertions : [])
    .concat(Array.isArray(motionAssertions.assertions) ? motionAssertions.assertions : []);
  const required = rows.filter(row => row && row.required);
  const exceptedRequired = required
    .filter(row => row.status !== 'pass' && assertionExcepted(row, pageModel, approvedExceptions, approvedExceptionRecords))
    .length;
  const failedRequired = required
    .filter(row => row.status !== 'pass' && !assertionExcepted(row, pageModel, approvedExceptions, approvedExceptionRecords))
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

function splitTableCells(line) {
  const cells = [];
  let current = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '|' && line[index - 1] !== '\\') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCoverageRows(markdown) {
  const rows = [];
  let headers = [];
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) {
      headers = [];
      continue;
    }
    if (/^\|\s*-/.test(line)) continue;
    const cells = splitTableCells(line.slice(1, -1)).map(tableCell);
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
      name: cellAt(cells, headers, ['name', 'assertion', 'candidate']),
      required: /^(yes|true|required)$/i.test(required),
      status: String(status || '').toLowerCase(),
      evidence: cellAt(cells, headers, ['evidence']),
      reason: cellAt(cells, headers, ['reason']),
    });
  }
  return rows.filter(row => row.area);
}

function coveragePasses(row) {
  if (row.status === 'complete') return true;
  if (['out_of_scope', 'out of scope'].includes(row.status)) {
    return typeof row.reason === 'string' && row.reason.trim().length > 0;
  }
  return false;
}

function coverageExcepted(row, pageModel, approvedExceptionRecords) {
  const area = String(row && row.area || '').trim();
  const regionId = knownRegionIds(pageModel).includes(area)
    ? area
    : regionIdForId(row && row.name, pageModel);
  return approvedScopeMatchesRegion(regionId, approvedExceptionRecords);
}

function coverageBlockerId(row) {
  const name = String(row && row.name || '').trim();
  return /^(static-map|motion-scout)-/.test(name) ? name : row.area;
}

function coverageBlockers(markdown, source, pageModel = {}, approvedExceptionRecords = []) {
  return parseCoverageRows(markdown)
    .filter(row => row.required && !coveragePasses(row))
    .filter(row => !coverageExcepted(row, pageModel, approvedExceptionRecords))
    .map(row => ({
      id: coverageBlockerId(row),
      source,
      status: row.status || 'missing',
      message: row.reason || `${row.area} coverage is ${row.status || 'missing'}`,
      evidence: row.evidence ? [row.evidence] : [],
    }));
}

function configuredViewportIds(config = {}, pageModel = {}) {
  const configIds = Array.isArray(config.viewports)
    ? config.viewports.map(viewport => viewport && viewport.id).filter(Boolean)
    : [];
  if (configIds.length) return configIds;
  return Array.isArray(pageModel.viewports)
    ? pageModel.viewports.map(viewport => viewport && viewport.id).filter(Boolean)
    : [];
}

function evidenceList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
}

function discoveryInspectionPasses(row) {
  const status = String(row && row.status || '').toLowerCase().trim();
  if (['complete', 'completed', 'pass', 'passed'].includes(status)) return true;
  if (['out_of_scope', 'out-of-scope', 'out of scope'].includes(status)) {
    return typeof row.reason === 'string' && row.reason.trim().length > 0;
  }
  return false;
}

function motionDiscoveryBlockers(motionCandidatesArtifact, config = {}, pageModel = {}) {
  const discovery = motionCandidatesArtifact && motionCandidatesArtifact.discovery;
  const requiredSources = REQUIRED_DISCOVERY_SOURCES;
  const inspections = discovery && Array.isArray(discovery.inspections) ? discovery.inspections : [];
  const viewports = configuredViewportIds(config, pageModel);

  const bySourceViewport = new Map();
  for (const row of inspections) {
    const source = String(row && row.source || '').trim();
    const viewportId = String(row && row.viewportId || '').trim();
    if (!source || !viewportId) continue;
    bySourceViewport.set(`${source}\u0000${viewportId}`, row);
  }

  const blockers = [];
  if (!viewports.length) {
    blockers.push({
      id: 'motion-scout-discovery:viewports',
      source: 'motion-scout-discovery',
      status: 'missing',
      message: 'No configured viewports resolved for Motion Scout discovery coverage',
      evidence: [],
    });
  }
  for (const viewportId of viewports) {
    for (const source of requiredSources) {
      const row = bySourceViewport.get(`${source}\u0000${viewportId}`);
      if (row && discoveryInspectionPasses(row)) continue;
      blockers.push({
        id: `${source}:${viewportId}`,
        source: 'motion-scout-discovery',
        status: 'missing',
        message: row && row.reason ? row.reason : `${source} was not inspected for ${viewportId}`,
        evidence: row ? evidenceList(row.evidence) : [],
      });
    }
  }
  return blockers;
}

function coverageSummary(staticCoverageText, motionCoverageText, pageModel = {}, approvedExceptionRecords = [], motionDiscovery = null) {
  const staticBlockers = coverageBlockers(staticCoverageText, 'static-map-coverage', pageModel, approvedExceptionRecords);
  const motionBlockers = motionDiscovery || coverageBlockers(motionCoverageText, 'motion-scout-coverage', pageModel, approvedExceptionRecords);
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
    motionCandidates: snapshot.motionScout && snapshot.motionScout.candidates,
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
    motionCandidates: readJson(path.join(motionScoutDir(runDir), 'motion-candidates.json')),
    pageModel: loadPageModel(runDir),
  };
}

function blockedApprovalPrefix(freshness) {
  if (freshness.summary.missingInputs > 0) return 'Report v0 inputs are missing; rerun map-report';
  if (freshness.summary.staleInputs > 0) return 'Report v0 is stale; rerun map-report';
  return 'Map Gate approval blocked';
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
  const kind = match[1].trim();
  if (kind !== 'region') {
    throw new Error(`map-gate --approve-exception only supports --scope region:<region-id> in v0; received unsupported scope kind "${kind}"`);
  }
  return { kind, id: match[2].trim() };
}

function approvedExceptionIds(pageModel) {
  return approvedExceptionRecords(pageModel).map(item => item.id);
}

function approvedExceptionRecords(pageModel) {
  return (Array.isArray(pageModel.exceptions) ? pageModel.exceptions : [])
    .filter(item => item && item.stage === 'map-gate' && item.approvedBy === 'human' && item.approvedAt);
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
  if (scope.kind === 'region' && !knownRegionIds(pageModel).includes(scope.id)) {
    throw new Error(`map-gate --approve-exception scope region:${scope.id} does not match a Page model Region`);
  }
  const next = JSON.parse(JSON.stringify(pageModel));
  if (!Array.isArray(next.exceptions)) next.exceptions = [];
  const existingRecords = next.exceptions.filter(item => item && item.id === decision.exceptionId);
  const crossStageRecord = existingRecords.find(item => item.stage !== 'map-gate');
  if (crossStageRecord) {
    throw new Error(`map-gate --approve-exception id "${decision.exceptionId}" already exists for stage ${crossStageRecord.stage || 'unknown'}; choose a map-gate exception id`);
  }
  const existing = existingRecords.find(item => item.stage === 'map-gate');
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
  const config = loadRunConfig(absRunDir);
  const staticAssertions = inputs.staticAssertions || { assertions: [] };
  const motionAssertions = inputs.motionAssertions || { assertions: [] };
  let pageModel = inputs.pageModel || {};
  if (decision.action === 'approve-exception') {
    pageModel = approveException(pageModel, decision, nowIso(env));
    savePageModel(absRunDir, pageModel);
    freshness.hashes['page-model.json'] = sha256File(path.join(absRunDir, 'page-model.json'));
  }
  const exceptionIds = approvedExceptionIds(pageModel);
  const approvedExceptions = new Set(exceptionIds);
  const approvedRecords = approvedExceptionRecords(pageModel);
  const discoveryBlockers = motionDiscoveryBlockers(inputs.motionCandidates, config, pageModel);
  const coverage = coverageSummary(inputs.staticCoverageText, inputs.motionCoverageText, pageModel, approvedRecords, discoveryBlockers);
  const unknowns = unknownSummary(pageModel);
  const exceptions = exceptionBlockers(pageModel);
  const blockers = freshness.blockers
    .concat(requiredFailures(staticAssertions, 'static-map-assertions', approvedExceptions, pageModel, approvedRecords))
    .concat(requiredFailures(motionAssertions, 'motion-scout-assertions', approvedExceptions, pageModel, approvedRecords))
    .concat(coverage.blockers)
    .concat(unknowns.blockers)
    .concat(exceptions);

  const gate = {
    schemaVersion: MAP_GATE_SCHEMA_VERSION,
    stage: 'map-gate',
    updatedAt: nowIso(env),
    inputHashes: Object.keys(freshness.hashes).length ? freshness.hashes : inputHashes(absRunDir),
    freshnessSummary: freshness.summary,
    assertionSummary: assertionSummary(staticAssertions, motionAssertions, approvedExceptions, pageModel, approvedRecords),
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
  runMapGate,
};
