'use strict';

const fs = require('fs');
const path = require('path');

const { resolveRunConfig } = require('./config');
const { writeJson } = require('./artifacts');

const PAGE_MODEL_SCHEMA_VERSION = 1;

function pagePathForUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  return parsed.pathname || '/';
}

function createPageModel(config) {
  return {
    schemaVersion: PAGE_MODEL_SCHEMA_VERSION,
    source: {
      url: config.targetUrl,
    },
    viewports: config.viewports,
    pages: {
      home: {
        path: pagePathForUrl(config.targetUrl),
        dimensions: {},
        regions: [],
      },
    },
    captures: [],
    notes: [],
    exceptions: [],
  };
}

function ensureNewRunDir(runDir) {
  if (fs.existsSync(runDir)) {
    throw new Error(`Run already exists: ${runDir}`);
  }
  fs.mkdirSync(runDir, { recursive: true });
}

function materializeRun(config) {
  ensureNewRunDir(config.runDir);
  writeJson(path.join(config.runDir, '00-config.json'), config);
  writeJson(path.join(config.runDir, 'page-model.json'), createPageModel(config));
  return config;
}

function initRun(options, env = {}) {
  const config = resolveRunConfig(options, env);
  return materializeRun(config);
}

module.exports = {
  PAGE_MODEL_SCHEMA_VERSION,
  createPageModel,
  materializeRun,
  initRun,
};
