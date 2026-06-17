#!/usr/bin/env bun
'use strict';

const { afterEach, expect, test } = require('bun:test');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { initRun } = require('../lib/map-workbench/init');
const {
  mapReportDir,
  motionScoutDir,
  readJson,
  reconDir,
  staticMapDir,
  writeJson,
  writeText,
} = require('../lib/map-workbench/artifacts');
const { runMapReport } = require('../lib/map-workbench/map-report');
const { runMotionScout } = require('../lib/map-workbench/motion-scout');

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const CLI_TIMEOUT_MS = 10000;
const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-map-gate-test-'));
  tempDirs.add(dir);
  return dir;
}

function createRun(cwd, options = {}) {
  return initRun(Object.assign({
    url: 'https://example.com/source',
    runDir: path.join(cwd, 'run'),
  }, options), { cwd, now: new Date('2026-06-17T12:00:00.000Z') });
}

function pageModel(options = {}) {
  const viewports = Array.isArray(options.viewports) && options.viewports.length
    ? options.viewports
    : [{ id: 'desktop', width: 1280, height: 800 }];
  const dimensions = {};
  const regionViewports = {};
  for (const viewport of viewports) {
    const width = viewport.width || 1280;
    const height = viewport.id === 'mobile' ? 520 : 620;
    dimensions[viewport.id] = { scrollWidth: width, scrollHeight: 1200 };
    regionViewports[viewport.id] = {
      presence: 'present',
      rect: { x: 0, y: 0, width, height },
      stacking: { zIndex: 'auto' },
      scrollY: 0,
      placeholder: { width, height },
      crop: {
        path: `02-static-map/crops/${viewport.id}/region-hero.png`,
        width,
        height,
        bytes: 68,
        selector: 'main > section.hero',
        method: 'fixture',
      },
    };
  }
  return {
    schemaVersion: 1,
    source: { url: 'https://example.com/source' },
    viewports,
    pages: {
      home: {
        path: '/',
        dimensions,
        regions: [{
          id: 'region-hero',
          name: 'Hero',
          kind: 'hero',
          parentId: null,
          order: 0,
          viewports: regionViewports,
          static: {
            colors: [],
            typography: [],
            assets: [],
            layout: {},
          },
          source: {
            primarySelector: 'main > section.hero',
            selectors: ['main > section.hero'],
            evidence: [],
          },
          motionCandidates: [],
          unknowns: [],
        }],
      },
    },
    captures: [],
    notes: [],
    exceptions: [],
  };
}

function coverageMarkdown(title, rows) {
  return [
    `# ${title}`,
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.area} | ${row.name || row.area} | ${row.required ? 'required' : 'info'} | ${row.status} | ${row.evidence || 'fixture'} | ${row.reason || ''} |`),
    '',
  ].join('\n');
}

function assertions(rows) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:30:00.000Z',
    assertions: rows,
  };
}

const REQUIRED_MOTION_DISCOVERY_SOURCES = [
  'css-transition-hover',
  'hover-affordance',
  'css-keyframes',
  'css-keyframes-loop',
  'split-reveal-dom',
  'scroll-trigger-registry',
  'sticky-pinned-clue',
  'click-affordance',
  'cursor-affordance',
];

function completeMotionInspections(viewportId = 'desktop') {
  return REQUIRED_MOTION_DISCOVERY_SOURCES.map(source => ({
    source,
    viewportId,
    status: 'complete',
    evidence: `${source} inspected`,
  }));
}

function prepareGateRun(cwd, options = {}) {
  const config = createRun(cwd, options);
  writeJson(path.join(config.runDir, 'page-model.json'), pageModel({ viewports: config.viewports }));

  writeJson(path.join(reconDir(config.runDir), 'page-state.json'), {
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:10:00.000Z',
    status: 'ready',
    finalUrl: 'https://example.com/source',
  });
  writeJson(path.join(staticMapDir(config.runDir), 'measurements.json'), {
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:20:00.000Z',
    viewports: config.viewports.map(viewport => ({ id: viewport.id, regionIds: ['region-hero'] })),
  });
  const staticAssertionRows = options.staticAssertions || [{
    id: 'static-map-region-hero-desktop-crop',
    kind: 'region-crop',
    required: true,
    status: 'pass',
    evidence: ['crop exists'],
    failure: null,
  }];
  writeJson(path.join(staticMapDir(config.runDir), 'assertions.json'), assertions(staticAssertionRows));
  writeText(path.join(staticMapDir(config.runDir), 'coverage.md'), coverageMarkdown('Static Map Coverage', options.staticCoverage || [{
    area: 'region-hero',
    name: 'Hero',
    required: true,
    status: 'complete',
    evidence: 'desktop',
  }, {
    area: 'region-crop',
    name: 'static-map-region-hero-desktop-crop',
    required: true,
    status: 'complete',
    evidence: 'crop exists',
  }]));

  if (options.motionScoutMeasurement) {
    runMotionScout(config.runDir, {
      driver: {
        measure() {
          return JSON.parse(JSON.stringify(options.motionScoutMeasurement));
        },
      },
      now: new Date('2026-06-17T12:25:00.000Z'),
    });
  } else if (!options.motionAssertions && !options.motionCoverage && !options.staticAssertions && !options.staticCoverage) {
    runMotionScout(config.runDir, {
      driver: {
        measure() {
          return {
            sourceInspections: completeMotionInspections('desktop'),
          };
        },
      },
      now: new Date('2026-06-17T12:25:00.000Z'),
    });
  } else {
    writeJson(path.join(motionScoutDir(config.runDir), 'motion-candidates.json'), {
      schemaVersion: 1,
      generatedAt: '2026-06-17T12:25:00.000Z',
      candidates: [],
      discovery: {
        sources: {},
        requiredSources: REQUIRED_MOTION_DISCOVERY_SOURCES.slice(),
        inspections: completeMotionInspections('desktop'),
        motionFidelity: { status: 'not-measured', reason: 'fixture' },
      },
    });
    writeJson(path.join(motionScoutDir(config.runDir), 'assertions.json'), assertions(options.motionAssertions || [{
      id: 'motion-scout-region-attachment',
      kind: 'region-attachment',
      required: true,
      status: 'pass',
      evidence: ['all candidates attached or explained'],
      failure: null,
    }]));
    writeText(path.join(motionScoutDir(config.runDir), 'coverage.md'), coverageMarkdown('Motion Scout Coverage', options.motionCoverage || [{
      area: 'css transitions',
      required: true,
      status: 'complete',
    }]));
  }

  runMapReport(config.runDir, { now: new Date('2026-06-17T12:45:00.000Z') });
  return config;
}

function runGate(cwd, args) {
  return spawnSync(process.execPath, [BIN, 'map-gate', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('yoinkit map-gate --approve records a blocked decision when required assertions fail', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [{
      id: 'static-map-region-hero-crop',
      kind: 'region-crop',
      required: true,
      status: 'fail',
      evidence: ['crop missing'],
      failure: 'required hero crop is missing',
    }],
  });
  const pageModelBefore = readJson(path.join(config.runDir, 'page-model.json'));

  const result = runGate(cwd, [config.runDir, '--approve', '--note', 'Human reviewed Report v0']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Map Gate approval blocked');
  expect(result.stderr).toContain('static-map-region-hero-crop');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    schemaVersion: 1,
    stage: 'map-gate',
    decision: 'blocked',
    humanDecision: {
      action: 'approve',
      note: 'Human reviewed Report v0',
    },
    assertionSummary: {
      failedRequired: 1,
    },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'static-map-region-hero-crop',
      source: 'static-map-assertions',
      status: 'fail',
    }),
  ]));
  expect(gate.inputHashes['page-model.json']).toMatch(/^[a-f0-9]{64}$/);
  expect(readJson(path.join(config.runDir, 'page-model.json'))).toEqual(pageModelBefore);
});

test('yoinkit map-gate --approve blocks required assertions that are not pass', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    motionAssertions: [{
      id: 'motion-scout-required-discovery-matrix',
      kind: 'discovery-coverage',
      required: true,
      status: 'missing',
      evidence: ['motion-candidates.json omitted a required source'],
      failure: 'required discovery matrix is incomplete',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('motion-scout-required-discovery-matrix');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.assertionSummary).toMatchObject({
    failedRequired: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'motion-scout-required-discovery-matrix',
      source: 'motion-scout-assertions',
      status: 'missing',
      message: 'required discovery matrix is incomplete',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks stale Report v0 inputs', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.notes.push({ id: 'note-after-report', text: 'This changed after Report v0.' });
  writeJson(pageModelFile, model);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Report v0 is stale; rerun map-report');
  expect(result.stderr).toContain('page-model.json');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    decision: 'blocked',
    freshnessSummary: {
      staleInputs: 1,
      missingInputs: 0,
    },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve records a blocked decision when a Report input is missing', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  fs.rmSync(path.join(motionScoutDir(config.runDir), 'coverage.md'));

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Report v0 inputs are missing; rerun map-report');
  expect(result.stderr).toContain('03-motion-scout/coverage.md');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    decision: 'blocked',
    freshnessSummary: {
      staleInputs: 0,
      missingInputs: 1,
    },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/coverage.md',
      source: 'report-freshness',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve records a blocked decision when all Report inputs are missing', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  fs.rmSync(reconDir(config.runDir), { recursive: true, force: true });
  fs.rmSync(staticMapDir(config.runDir), { recursive: true, force: true });
  fs.rmSync(motionScoutDir(config.runDir), { recursive: true, force: true });
  fs.rmSync(path.join(config.runDir, 'page-model.json'), { force: true });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Report v0 inputs are missing; rerun map-report');
  expect(result.stderr).not.toContain('ENOENT');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    decision: 'blocked',
    freshnessSummary: {
      staleInputs: 0,
      missingInputs: 8,
    },
    inputHashes: {},
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '01-recon/page-state.json',
      source: 'report-freshness',
      status: 'missing',
    }),
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks Report snapshots without input hashes', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const snapshotFile = path.join(mapReportDir(config.runDir), 'report-snapshot.json');
  const snapshot = readJson(snapshotFile);
  snapshot.inputHashes = {};
  writeJson(snapshotFile, snapshot);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Report v0 inputs are missing; rerun map-report');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    staleInputs: 0,
    missingInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'report-snapshot-input-hashes',
      source: 'report-freshness',
      status: 'missing',
      message: 'Report v0 input hashes are missing; rerun map-report',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks Report snapshots missing a required input hash', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const snapshotFile = path.join(mapReportDir(config.runDir), 'report-snapshot.json');
  const snapshot = readJson(snapshotFile);
  delete snapshot.inputHashes['03-motion-scout/coverage.md'];
  writeJson(snapshotFile, snapshot);
  writeText(path.join(motionScoutDir(config.runDir), 'coverage.md'), '# changed after snapshot\n');

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('03-motion-scout/coverage.md');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    missingInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/coverage.md',
      source: 'report-freshness',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks Report snapshot input hashes that escape the run directory', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const outsideFile = path.join(cwd, 'outside.txt');
  fs.writeFileSync(outsideFile, 'outside the run\n');
  const snapshotFile = path.join(mapReportDir(config.runDir), 'report-snapshot.json');
  const snapshot = readJson(snapshotFile);
  snapshot.inputHashes['../outside.txt'] = sha256File(outsideFile);
  writeJson(snapshotFile, snapshot);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('../outside.txt');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    unexpectedInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '../outside.txt',
      source: 'report-freshness',
      status: 'invalid',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks contained Report snapshot input hashes outside the canonical input set', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const extraFile = path.join(motionScoutDir(config.runDir), 'extra.json');
  writeJson(extraFile, { generatedAt: '2026-06-17T12:46:00.000Z' });
  const snapshotFile = path.join(mapReportDir(config.runDir), 'report-snapshot.json');
  const snapshot = readJson(snapshotFile);
  snapshot.inputHashes['03-motion-scout/extra.json'] = sha256File(extraFile);
  writeJson(snapshotFile, snapshot);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('03-motion-scout/extra.json');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    unexpectedInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/extra.json',
      source: 'report-freshness',
      status: 'unexpected',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks incomplete required coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'missing',
      reason: 'crop evidence is absent',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Map Gate approval blocked');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
    motionScout: { incompleteRequired: 0 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero crop',
      source: 'static-map-coverage',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve does not accept markdown-approved required coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'approved',
      reason: 'markdown approval is not canonical',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
    motionScout: { incompleteRequired: 0 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'region-hero crop', status: 'approved' }),
  ]));
});

test('yoinkit map-gate --approve blocks reasonless out-of-scope required coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'out_of_scope',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero crop',
      source: 'static-map-coverage',
      status: 'out_of_scope',
    }),
  ]));
});

test('yoinkit map-gate --approve accepts out-of-scope required coverage rows with reasons', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'out_of_scope',
      reason: 'Region is hidden behind a source-owned cookie banner for this run',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 0 },
  });
  expect(gate.blockers).toEqual([]);
});

test('yoinkit map-gate --approve blocks required info coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'info',
      reason: 'Informational notes do not satisfy required coverage',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero crop',
      source: 'static-map-coverage',
      status: 'info',
    }),
  ]));
});

test('yoinkit map-gate parses escaped pipes in coverage table cells', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero\\|crop',
      name: 'Hero crop',
      required: true,
      status: 'missing',
      evidence: 'transform\\|opacity',
      reason: 'crop evidence is absent',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero|crop',
      status: 'missing',
      evidence: ['transform|opacity'],
    }),
  ]));
});

test('yoinkit map-gate scopes coverage parser headers to each markdown table section', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  writeText(path.join(staticMapDir(config.runDir), 'coverage.md'), [
    '# Static Map Coverage',
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    '| region-hero | Hero | required | complete | fixture | |',
    '',
    '## Skipped Assets',
    '',
    '| Region | Asset | Gate Impact | Reason | Recovery |',
    '| --- | --- | --- | --- | --- |',
    '| region-hero | hero.png | required | missing | retry asset fetch |',
    '',
  ].join('\n'));
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:12:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 0 },
  });
  expect(gate.blockers).toEqual([]);
});

test('yoinkit map-gate --approve blocks uninspected required Motion Scout discovery sources', () => {
  const cwd = tempDir();
  const inspections = completeMotionInspections('desktop').map(row => (
    row.source === 'scroll-trigger-registry'
      ? Object.assign({}, row, {
        status: 'missing',
        completed: false,
        reason: 'ScrollTrigger registry inspection threw: registry unavailable',
      })
      : row
  ));
  const config = prepareGateRun(cwd, {
    motionScoutMeasurement: {
      sourceInspections: inspections,
    },
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('scroll-trigger-registry');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'scroll-trigger-registry:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
      message: 'ScrollTrigger registry inspection threw: registry unavailable',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks when Motion Scout emits no discovery inspections', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    motionScoutMeasurement: {},
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('css-transition-hover');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: REQUIRED_MOTION_DISCOVERY_SOURCES.length },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'css-transition-hover:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
      message: 'css-transition-hover was not inspected',
    }),
  ]));
});

test('yoinkit map-gate --approve treats unrecognized Motion Scout inspection statuses as missing', () => {
  const cwd = tempDir();
  const inspections = completeMotionInspections('desktop').map(row => (
    row.source === 'css-keyframes'
      ? Object.assign({}, row, { status: 'skipped' })
      : row
  ));
  const config = prepareGateRun(cwd, {
    motionScoutMeasurement: {
      sourceInspections: inspections,
    },
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('css-keyframes');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'css-keyframes:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks a missing structured Motion Scout discovery matrix row', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
  const candidates = readJson(candidatesFile);
  candidates.discovery.inspections = candidates.discovery.inspections
    .filter(row => !(row.source === 'cursor-affordance' && row.viewportId === 'desktop'));
  writeJson(candidatesFile, candidates);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:10:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('cursor-affordance:desktop');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'cursor-affordance:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
      message: 'cursor-affordance was not inspected for desktop',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks under-declared Motion Scout discovery sources', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
  const candidates = readJson(candidatesFile);
  candidates.discovery.requiredSources = candidates.discovery.requiredSources
    .filter(source => source !== 'scroll-trigger-registry');
  candidates.discovery.inspections = candidates.discovery.inspections
    .filter(row => !(row.source === 'scroll-trigger-registry' && row.viewportId === 'desktop'));
  writeJson(candidatesFile, candidates);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:11:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('scroll-trigger-registry:desktop');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'scroll-trigger-registry:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks a missing Motion Scout discovery matrix', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
  const candidates = readJson(candidatesFile);
  delete candidates.discovery.inspections;
  writeJson(candidatesFile, candidates);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:12:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: REQUIRED_MOTION_DISCOVERY_SOURCES.length },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'css-transition-hover:desktop',
      source: 'motion-scout-discovery',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve requires Motion Scout discovery inspections for each viewport', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    viewports: ['desktop=1280x800', 'mobile=390x844'],
    motionScoutMeasurement: {
      sourceInspections: completeMotionInspections('desktop'),
    },
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('css-transition-hover:mobile');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    motionScout: { incompleteRequired: REQUIRED_MOTION_DISCOVERY_SOURCES.length },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'css-transition-hover:mobile',
      source: 'motion-scout-discovery',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks when no viewport can be resolved for discovery coverage', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const configFile = path.join(config.runDir, '00-config.json');
  const modelFile = path.join(config.runDir, 'page-model.json');
  const runConfig = readJson(configFile);
  const model = readJson(modelFile);
  runConfig.viewports = [];
  model.viewports = [];
  writeJson(configFile, runConfig);
  writeJson(modelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:13:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('motion-scout-discovery:viewports');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'motion-scout-discovery:viewports',
      source: 'motion-scout-discovery',
      status: 'missing',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks unknowns without reasons', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  const hero = model.pages.home.regions[0];
  hero.unknowns = [
    { field: 'source.primarySelector', reason: '' },
    { field: 'static.assets.hero', reason: 'asset is generated at runtime' },
  ];
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:00:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Map Gate approval blocked');
  expect(result.stderr).toContain('region-hero:source.primarySelector');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.unknownSummary).toEqual({
    total: 2,
    withoutReason: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero:source.primarySelector',
      source: 'page-model-unknowns',
      status: 'unknown',
    }),
  ]));
});

test('yoinkit map-gate --reject records a human rejection without modifying the Page model', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelBefore = readJson(path.join(config.runDir, 'page-model.json'));

  const result = runGate(cwd, [config.runDir, '--reject', '--reason', 'Hero crop needs another human pass']);

  const gateFile = path.join(mapReportDir(config.runDir), 'gate.json');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(gateFile);
  const gate = readJson(gateFile);
  expect(gate).toMatchObject({
    decision: 'rejected',
    humanDecision: {
      action: 'reject',
      reason: 'Hero crop needs another human pass',
    },
  });
  expect(readJson(path.join(config.runDir, 'page-model.json'))).toEqual(pageModelBefore);
});

test('yoinkit map-gate --approve-exception creates a canonical Page model exception without final approval', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Hero crop is hidden by a required cookie banner in this source.',
    '--scope', 'region:region-hero',
  ]);

  const gateFile = path.join(mapReportDir(config.runDir), 'gate.json');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(gateFile);
  const page = readJson(path.join(config.runDir, 'page-model.json'));
  expect(page.exceptions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-hero-crop',
      stage: 'map-gate',
      scope: { kind: 'region', id: 'region-hero' },
      reason: 'Hero crop is hidden by a required cookie banner in this source.',
      approvedBy: 'human',
    }),
  ]));
  expect(page.exceptions[0].approvedAt).toMatch(/^20\d\d-/);

  const gate = readJson(gateFile);
  expect(gate).toMatchObject({
    decision: 'exception-approved',
    humanDecision: {
      action: 'approve-exception',
      exceptionId: 'exception-hero-crop',
    },
  });
  expect(gate.exceptionIds).toContain('exception-hero-crop');
  expect(gate.inputHashes['page-model.json']).toBe(sha256File(path.join(config.runDir, 'page-model.json')));
});

test('yoinkit map-gate --approve-exception records freshness blockers when Report inputs are stale', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.notes.push({ id: 'note-after-report', text: 'This changed after Report v0.' });
  writeJson(pageModelFile, model);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Approved while noting stale Report inputs.',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.decision).toBe('exception-approved');
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve-exception rejects an unknown Region scope', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-missing-region',
    '--reason', 'This should not be recorded for an unknown Region.',
    '--scope', 'region:does-not-exist',
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('scope region:does-not-exist does not match a Page model Region');
  const page = readJson(path.join(config.runDir, 'page-model.json'));
  expect(page.exceptions).toEqual([]);
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --approve-exception rejects cross-stage exception id collisions', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'capture',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Capture owns this exception id.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:14:00.000Z') });

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Map Gate must not take over Capture exception ids.',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('already exists for stage capture');
  expect(readJson(pageModelFile).exceptions).toEqual([
    expect.objectContaining({
      id: 'exception-hero-crop',
      stage: 'capture',
      reason: 'Capture owns this exception id.',
    }),
  ]);
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --approve-exception rejects cross-stage exception id collisions after same-stage duplicates', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Map Gate owns this exception id.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  }, {
    id: 'exception-hero-crop',
    stage: 'capture',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Capture also owns this exception id.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:01:00.000Z',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:14:00.000Z') });

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Map Gate must reject duplicate cross-stage ids regardless of order.',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('already exists for stage capture');
  expect(readJson(pageModelFile).exceptions).toEqual([
    expect.objectContaining({
      id: 'exception-hero-crop',
      stage: 'map-gate',
      reason: 'Map Gate owns this exception id.',
    }),
    expect.objectContaining({
      id: 'exception-hero-crop',
      stage: 'capture',
      reason: 'Capture also owns this exception id.',
    }),
  ]);
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --approve-exception rejects unsupported scope kinds', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-capture-scope',
    '--reason', 'This unsupported scope should not be recorded.',
    '--scope', 'capture:capture-hero-hover',
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('only supports --scope region:<region-id> in v0');
  expect(result.stderr).toContain('capture');
  const page = readJson(path.join(config.runDir, 'page-model.json'));
  expect(page.exceptions).toEqual([]);
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --approve blocks unapproved Page model exceptions', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Hero crop requires human approval before Capture.',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:05:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('exception-hero-crop');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.exceptionIds).not.toContain('exception-hero-crop');
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-hero-crop',
      source: 'page-model-exceptions',
      status: 'exception',
    }),
  ]));
});

test('yoinkit map-gate requires final approval after approving a scoped Region exception', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [{
      id: 'static-map-region-hero-desktop-crop',
      kind: 'region-crop',
      required: true,
      status: 'fail',
      evidence: ['cookie banner covers the crop'],
      failure: 'required hero crop is blocked by the source cookie banner',
    }],
    staticCoverage: [{
      area: 'region-hero',
      required: true,
      status: 'missing',
      reason: 'region-level crop coverage is blocked by the same source cookie banner',
    }, {
      area: 'region-crop',
      name: 'static-map-region-hero-desktop-crop',
      required: true,
      status: 'missing',
      reason: 'crop assertion coverage is blocked by the same source cookie banner',
    }],
  });

  const blockedResult = runGate(cwd, [config.runDir, '--approve', '--note', 'Report v0 reviewed before exception']);

  expect(blockedResult.status).toBe(1);
  expect(blockedResult.stderr).toContain('static-map-region-hero-desktop-crop');
  const blockedGate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(blockedGate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'static-map-region-hero-desktop-crop',
      source: 'static-map-assertions',
    }),
    expect.objectContaining({
      id: 'region-hero',
      source: 'static-map-coverage',
    }),
    expect.objectContaining({
      id: 'static-map-region-hero-desktop-crop',
      source: 'static-map-coverage',
    }),
  ]));

  const exceptionResult = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Cookie banner is source-owned and accepted for Map v0.',
    '--scope', 'region:region-hero',
  ]);

  expect(exceptionResult.status).toBe(0);
  const exceptionGate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(exceptionGate.decision).toBe('exception-approved');

  const approvalResult = runGate(cwd, [config.runDir, '--approve', '--note', 'Report v0 approved after exception review']);

  expect(approvalResult.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    decision: 'approved',
    humanDecision: {
      action: 'approve',
      note: 'Report v0 approved after exception review',
    },
    assertionSummary: {
      failedRequired: 0,
      exceptedRequired: 1,
    },
    coverageSummary: {
      staticMap: { incompleteRequired: 0 },
    },
  });
  expect(gate.exceptionIds).toContain('exception-hero-crop');
  expect(gate.blockers).toEqual([]);
});

test('yoinkit map-gate --approve keeps assertion exception ids scoped to their resolved Region', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Only the hero Region is waived.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  });
  writeJson(pageModelFile, model);
  const motionAssertionsFile = path.join(motionScoutDir(config.runDir), 'assertions.json');
  const motionAssertions = readJson(motionAssertionsFile);
  motionAssertions.assertions.push({
    id: 'motion-scout-unresolved-target',
    kind: 'discovery-coverage',
    required: true,
    status: 'fail',
    evidence: ['target did not resolve to a Page model Region'],
    failure: 'unresolved target should stay blocking',
    exceptionId: 'exception-hero-crop',
  });
  writeJson(motionAssertionsFile, motionAssertions);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:15:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('motion-scout-unresolved-target');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.assertionSummary).toMatchObject({
    failedRequired: 1,
    exceptedRequired: 0,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'motion-scout-unresolved-target',
      source: 'motion-scout-assertions',
      status: 'fail',
    }),
  ]));
});

test('yoinkit map-gate --approve records final approval when Report inputs are fresh and blockers are clear', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve', '--note', 'Human approved Report v0 for Capture']);

  const gateFile = path.join(mapReportDir(config.runDir), 'gate.json');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(gateFile);
  const staticCoverage = fs.readFileSync(path.join(staticMapDir(config.runDir), 'coverage.md'), 'utf8');
  expect(staticCoverage).toContain('| region-crop | static-map-region-hero-desktop-crop | required | complete |');
  const motionCandidates = readJson(path.join(motionScoutDir(config.runDir), 'motion-candidates.json'));
  expect(motionCandidates.discovery.inspections).toHaveLength(REQUIRED_MOTION_DISCOVERY_SOURCES.length);
  expect(motionCandidates.discovery.inspections.every(row => row.status === 'complete')).toBe(true);
  const gate = readJson(gateFile);
  expect(gate).toMatchObject({
    schemaVersion: 1,
    stage: 'map-gate',
    decision: 'approved',
    freshnessSummary: {
      staleInputs: 0,
      missingInputs: 0,
    },
    assertionSummary: {
      failedRequired: 0,
      exceptedRequired: 0,
    },
    coverageSummary: {
      staticMap: { incompleteRequired: 0 },
      motionScout: { incompleteRequired: 0 },
    },
    unknownSummary: {
      total: 0,
      withoutReason: 0,
    },
    humanDecision: {
      action: 'approve',
      note: 'Human approved Report v0 for Capture',
    },
    blockers: [],
  });
  expect(gate.updatedAt).toMatch(/^20\d\d-/);
  expect(gate.inputHashes['page-model.json']).toMatch(/^[a-f0-9]{64}$/);
  expect(gate.inputHashes['02-static-map/coverage.md']).toMatch(/^[a-f0-9]{64}$/);
  expect(gate.inputHashes['03-motion-scout/coverage.md']).toMatch(/^[a-f0-9]{64}$/);
  expect(gate.warnings).toBeUndefined();
});

test('yoinkit map-gate requires an explicit human decision', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir]);

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('yoinkit map-gate <run-dir>');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate reports a precise error for missing value flags', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve', '--note']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-gate --note requires a value');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --approve requires Report v0 to exist', () => {
  const cwd = tempDir();
  const config = createRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-gate requires current Report v0; rerun map-report');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

test('yoinkit map-gate --reject requires a human-readable reason', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--reject']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-gate --reject requires --reason');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});
