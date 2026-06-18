'use strict';

const path = require('path');

const {
  ReconBlockedError,
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

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function writeStageStatus(runDir, stage, status, error, env = {}) {
  const dirs = {
    recon: reconDir,
    'static-map': staticMapDir,
    'motion-scout': motionScoutDir,
    'map-report': mapReportDir,
  };
  const dir = dirs[stage](runDir);
  const artifact = path.join(dir, 'stage-status.json');
  writeJson(artifact, {
    schemaVersion: STAGE_STATUS_SCHEMA_VERSION,
    generatedAt: nowIso(env),
    runDir,
    stage,
    status,
    error: error ? errorMessage(error) : null,
    errorName: error && error.name ? error.name : null,
  });
  return artifact;
}

function runStage(runDir, stage, fn, env = {}) {
  try {
    return fn();
  } catch (error) {
    writeStageStatus(runDir, stage, 'failed', error, env);
    throw error;
  }
}

function runPreGateMap(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const stages = env.stages || {};
  const recon = runStage(absRunDir, 'recon', () => (
    (stages.recon || runRecon)(absRunDir, { driver: env.reconDriver })
  ), env);
  if (recon.status === 'blocked') {
    const error = new ReconBlockedError(recon);
    writeStageStatus(absRunDir, 'recon', 'blocked', error, env);
    throw error;
  }

  const staticMap = runStage(absRunDir, 'static-map', () => (
    (stages.staticMap || runStaticMap)(absRunDir, { driver: env.staticMapDriver })
  ), env);
  const motionScout = runStage(absRunDir, 'motion-scout', () => (
    (stages.motionScout || runMotionScout)(absRunDir, { driver: env.motionScoutDriver })
  ), env);
  const mapReport = runStage(absRunDir, 'map-report', () => (
    (stages.mapReport || runMapReport)(absRunDir)
  ), env);

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
