'use strict';

const fs = require('fs');
const path = require('path');

const {
  ReconBlockedError,
  ReconNotReadyError,
  runRecon,
} = require('./recon');
const { runStaticMap } = require('./static-map');
const { runMotionScout } = require('./motion-scout');
const { runMapReport } = require('./map-report');
const {
  mapReportDir,
  motionScoutDir,
  reconDir,
  staticMapDir,
  writeJson,
} = require('./artifacts');

const STAGE_STATUS_SCHEMA_VERSION = 1;

class StaticMapStageFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StaticMapStageFailedError';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function writeStageStatus(runDir, stage, status, error) {
  const artifact = stageStatusPath(runDir, stage);
  writeJson(artifact, {
    schemaVersion: STAGE_STATUS_SCHEMA_VERSION,
    generatedAt: nowIso(),
    runDir,
    stage,
    status,
    error: error ? errorMessage(error) : null,
    errorName: error && error.name ? error.name : null,
  });
  return artifact;
}

function stageStatusPath(runDir, stage) {
  const dirs = {
    recon: reconDir,
    'static-map': staticMapDir,
    'motion-scout': motionScoutDir,
    'map-report': mapReportDir,
  };
  return path.join(dirs[stage](runDir), 'stage-status.json');
}

function clearStageStatus(runDir, stage) {
  fs.rmSync(stageStatusPath(runDir, stage), { force: true });
}

function runStage(runDir, stage, fn) {
  try {
    const result = fn();
    clearStageStatus(runDir, stage);
    return result;
  } catch (error) {
    writeStageStatus(runDir, stage, 'failed', error);
    throw error;
  }
}

function staticMapRegionFailure(staticMap) {
  if (Array.isArray(staticMap && staticMap.regions) && staticMap.regions.length > 0) {
    return null;
  }
  const rows = Array.isArray(staticMap && staticMap.assertions && staticMap.assertions.assertions)
    ? staticMap.assertions.assertions
    : [];
  const scaffold = rows.find(row => row && row.id === 'static-map-regions-present');
  return new StaticMapStageFailedError(
    (scaffold && scaffold.failure) || 'Static Map produced no Regions'
  );
}

function runPreGateMap(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const recon = runStage(absRunDir, 'recon', () => (
    runRecon(absRunDir, { driver: env.reconDriver })
  ));
  if (recon.status !== 'ready') {
    const error = recon.status === 'blocked'
      ? new ReconBlockedError(recon)
      : new ReconNotReadyError(recon);
    writeStageStatus(absRunDir, 'recon', recon.status || 'not-ready', error);
    throw error;
  }

  const staticMap = runStage(absRunDir, 'static-map', () => (
    runStaticMap(absRunDir, { driver: env.staticMapDriver })
  ));
  const staticMapError = staticMapRegionFailure(staticMap);
  if (staticMapError) {
    writeStageStatus(absRunDir, 'static-map', 'failed', staticMapError);
    throw staticMapError;
  }
  const motionScout = runStage(absRunDir, 'motion-scout', () => (
    runMotionScout(absRunDir, { driver: env.motionScoutDriver })
  ));
  const mapReport = runStage(absRunDir, 'map-report', () => (
    runMapReport(absRunDir)
  ));

  return {
    status: 'ready',
    runDir: absRunDir,
    stages: {
      recon,
      staticMap,
      motionScout,
      mapReport,
    },
    artifacts: {
      report: mapReport.artifacts.report,
      snapshot: mapReport.artifacts.snapshot,
    },
  };
}

module.exports = {
  runPreGateMap,
};
