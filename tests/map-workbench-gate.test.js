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
  configPath,
  mapReportDir,
  motionScoutDir,
  readJson,
  reconDir,
  staticMapDir,
  writeJson,
  writeText,
} = require('../lib/map-workbench/artifacts');
const { runMapReport } = require('../lib/map-workbench/map-report');
const { runMapGate } = require('../lib/map-workbench/map-gate');
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

test('yoinkit map-gate --approve fails closed when a fresh assertion artifact has no rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('02-static-map/assertions.json:assertions');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '02-static-map/assertions.json:assertions',
      source: 'report-input',
      status: 'invalid',
    }),
  ]));
});

test('yoinkit map-gate --approve fails closed when a fresh assertion artifact is missing its assertions array', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const assertionsFile = path.join(motionScoutDir(config.runDir), 'assertions.json');
  const artifact = readJson(assertionsFile);
  delete artifact.assertions;
  writeJson(assertionsFile, artifact);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:20:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('03-motion-scout/assertions.json:assertions');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/assertions.json:assertions',
      source: 'report-input',
      status: 'invalid',
    }),
  ]));
});

test('yoinkit map-gate --approve fails closed when a fresh assertion artifact has the wrong schema version', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const assertionsFile = path.join(staticMapDir(config.runDir), 'assertions.json');
  const artifact = readJson(assertionsFile);
  artifact.schemaVersion = 999;
  writeJson(assertionsFile, artifact);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:21:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('02-static-map/assertions.json:schema-version');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '02-static-map/assertions.json:schema-version',
      source: 'report-input',
      status: 'invalid',
    }),
  ]));
});

test('yoinkit map-gate --approve fails closed when a fresh Motion Scout candidates artifact has the wrong shape', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
  const artifact = readJson(candidatesFile);
  delete artifact.schemaVersion;
  artifact.candidates = {};
  writeJson(candidatesFile, artifact);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:22:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('03-motion-scout/motion-candidates.json:schema-version');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/motion-candidates.json:schema-version',
      source: 'report-input',
      status: 'invalid',
    }),
    expect.objectContaining({
      id: '03-motion-scout/motion-candidates.json:candidates',
      source: 'report-input',
      status: 'invalid',
    }),
  ]));
});

for (const { name, text } of [
  { name: 'empty', text: '' },
  { name: 'garbage', text: 'not a markdown coverage table' },
]) {
  test(`yoinkit map-gate --approve fails closed when fresh static coverage is ${name}`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd);
    writeText(path.join(staticMapDir(config.runDir), 'coverage.md'), text);
    runMapReport(config.runDir, { now: new Date('2026-06-17T13:23:00.000Z') });

    const result = runGate(cwd, [config.runDir, '--approve']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('static-map-coverage:unparseable');
    const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
    expect(gate.coverageSummary).toMatchObject({
      staticMap: { incompleteRequired: 1 },
    });
    expect(gate.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'static-map-coverage:unparseable',
        source: 'static-map-coverage',
        status: 'invalid',
      }),
    ]));
  });
}

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

test('yoinkit map-gate --approve blocks stale Report config inputs', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const configFile = configPath(config.runDir);
  const storedConfig = readJson(configFile);
  storedConfig.targetUrl = 'https://example.com/changed-after-report';
  writeJson(configFile, storedConfig);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('00-config.json');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    staleInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '00-config.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks stale Report HTML paired with a newer snapshot', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const reportFile = path.join(mapReportDir(config.runDir), 'index.html');
  const old = new Date('2026-06-17T12:44:00.000Z');
  fs.utimesSync(reportFile, old, old);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('04-map-report/index.html');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate).toMatchObject({
    decision: 'blocked',
    freshnessSummary: {
      staleInputs: 1,
    },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '04-map-report/index.html',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks missing Report config inputs', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  fs.rmSync(configPath(config.runDir));

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('00-config.json');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.freshnessSummary).toMatchObject({
    missingInputs: 1,
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '00-config.json',
      source: 'report-freshness',
      status: 'missing',
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

test('yoinkit map-gate --approve blocks reasoned out-of-scope required coverage rows', () => {
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

test('yoinkit map-gate --approve ignores non-required out-of-scope coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero note',
      required: false,
      status: 'out_of_scope',
      reason: 'Informational note is out of scope for this run',
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

test('yoinkit map-gate keeps blank-name coverage blocker ids distinct', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  writeText(path.join(staticMapDir(config.runDir), 'coverage.md'), [
    '# Static Map Coverage',
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    '| region-hero |  | required | missing | fixture | first blank-name row |',
    '| region-hero |  | required | missing | fixture | second blank-name row |',
    '',
  ].join('\n'));
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:24:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  const ids = gate.blockers
    .filter(blocker => blocker.source === 'static-map-coverage')
    .map(blocker => blocker.id);
  expect(ids).toEqual(['region-hero:row-1', 'region-hero:row-2']);
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

for (const status of ['pass', 'passed']) {
  test(`yoinkit map-gate --approve rejects non-contract Motion Scout discovery status "${status}"`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd);
    const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
    const candidates = readJson(candidatesFile);
    candidates.discovery.inspections = candidates.discovery.inspections.map(row => (
      row.source === 'css-keyframes' && row.viewportId === 'desktop'
        ? Object.assign({}, row, { status })
        : row
    ));
    writeJson(candidatesFile, candidates);
    runMapReport(config.runDir, { now: new Date('2026-06-17T13:16:00.000Z') });

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
        status,
      }),
    ]));
  });
}

test('yoinkit map-gate --approve does not let producer out-of-scope waive a required discovery source', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const candidatesFile = path.join(motionScoutDir(config.runDir), 'motion-candidates.json');
  const candidates = readJson(candidatesFile);
  candidates.discovery.inspections = candidates.discovery.inspections.map(row => (
    row.source === 'css-keyframes' && row.viewportId === 'desktop'
      ? Object.assign({}, row, {
        status: 'out_of_scope',
        completed: false,
        reason: 'Producer marked this source out of scope without a canonical exception.',
      })
      : row
  ));
  writeJson(candidatesFile, candidates);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:18:00.000Z') });

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
      status: 'out_of_scope',
      message: 'Producer marked this source out of scope without a canonical exception.',
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
  expect(gate.coverageSummary).toMatchObject({
    motionScout: {
      incompleteRequired: 0,
      viewportsResolved: false,
    },
  });
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
    freshnessSummary: {
      staleInputs: 1,
    },
    humanDecision: {
      action: 'approve-exception',
      exceptionId: 'exception-hero-crop',
    },
  });
  expect(gate.exceptionIds).toContain('exception-hero-crop');
  expect(gate.inputHashes['page-model.json']).toBe(sha256File(path.join(config.runDir, 'page-model.json')));
  expect(gate.updatedAt).toBe(page.exceptions[0].approvedAt);
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve-exception records an optional expiry stage', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-expiring-hero-crop',
    '--reason', 'Hero crop exception expires before Capture.',
    '--scope', 'region:region-hero',
    '--expires-after-stage', 'map-gate',
  ]);

  expect(result.status).toBe(0);
  const page = readJson(path.join(config.runDir, 'page-model.json'));
  expect(page.exceptions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-expiring-hero-crop',
      stage: 'map-gate',
      expiresAfterStage: 'map-gate',
    }),
  ]));
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

test('yoinkit map-gate --approve-exception preserves live Page model edits when another Report input is missing', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.pages.home.regions[0].name = 'Hero Edited After Report';
  writeJson(pageModelFile, model);
  fs.rmSync(path.join(motionScoutDir(config.runDir), 'coverage.md'));

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Approved while another Report input is missing.',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(0);
  const page = readJson(pageModelFile);
  expect(page.pages.home.regions[0].name).toBe('Hero Edited After Report');
  expect(page.exceptions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-hero-crop',
      stage: 'map-gate',
      scope: { kind: 'region', id: 'region-hero' },
      reason: 'Approved while another Report input is missing.',
    }),
  ]));
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: '03-motion-scout/coverage.md',
      source: 'report-freshness',
      status: 'missing',
    }),
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));
});

test('yoinkit map-gate --approve blocks forged approved map-gate exceptions added after Report v0', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [{
      id: 'static-map-region-hero-desktop-crop',
      kind: 'region-crop',
      required: true,
      status: 'fail',
      evidence: ['crop missing'],
      failure: 'required hero crop is missing',
    }],
  });
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-forged-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Forged outside the gate command.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  });
  writeJson(pageModelFile, model);

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Report v0 is stale; rerun map-report');
  expect(result.stderr).toContain('page-model.json');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.decision).toBe('blocked');
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

test('yoinkit map-gate --approve blocks duplicate map-gate exception ids', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'First approved record.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  }, {
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Second approved record.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:01:00.000Z',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:16:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('exception-hero-crop');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-hero-crop',
      source: 'page-model-exceptions',
      status: 'duplicate',
    }),
  ]));
});

test('yoinkit map-gate --approve-exception rejects duplicate same-stage exception ids', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.exceptions.push({
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'First approved record.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  }, {
    id: 'exception-hero-crop',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Second approved record.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:01:00.000Z',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:17:00.000Z') });

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'This should not pick one duplicate record.',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('already exists more than once for stage map-gate');
  expect(readJson(pageModelFile).exceptions).toEqual([
    expect.objectContaining({ reason: 'First approved record.' }),
    expect.objectContaining({ reason: 'Second approved record.' }),
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

const invalidApprovedExceptionRecords = [{
  name: 'missing id',
  record: {
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: 'Missing id should not waive.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  },
}, {
  name: 'empty reason',
  record: {
    id: 'exception-empty-reason',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region-hero' },
    reason: '',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  },
}, {
  name: 'string scope',
  record: {
    id: 'exception-string-scope',
    stage: 'map-gate',
    scope: 'region:region-hero',
    reason: 'Scope must be canonical JSON.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  },
}, {
  name: 'unsupported scope kind',
  record: {
    id: 'exception-unsupported-scope',
    stage: 'map-gate',
    scope: { kind: 'capture', id: 'region-hero' },
    reason: 'Unsupported scope kind should not waive.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  },
}, {
  name: 'unknown region scope',
  record: {
    id: 'exception-unknown-region',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'does-not-exist' },
    reason: 'Unknown Region should not waive.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  },
}];

for (const fixture of invalidApprovedExceptionRecords) {
  test(`yoinkit map-gate --approve blocks invalid approved exception records: ${fixture.name}`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd, {
      staticAssertions: [{
        id: 'static-map-region-hero-desktop-crop',
        kind: 'region-crop',
        required: true,
        status: 'fail',
        evidence: ['crop missing'],
        failure: 'required hero crop is missing',
      }],
    });
    const pageModelFile = path.join(config.runDir, 'page-model.json');
    const model = readJson(pageModelFile);
    model.exceptions.push(JSON.parse(JSON.stringify(fixture.record)));
    writeJson(pageModelFile, model);
    runMapReport(config.runDir, { now: new Date('2026-06-17T13:14:00.000Z') });

    const result = runGate(cwd, [config.runDir, '--approve']);

    expect(result.status).toBe(1);
    const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
    expect(gate.exceptionIds.every(id => typeof id === 'string' && id.trim())).toBe(true);
    if (fixture.record.id) expect(gate.exceptionIds).not.toContain(fixture.record.id);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'page-model-exceptions',
        status: 'exception',
      }),
      expect.objectContaining({
        id: 'static-map-region-hero-desktop-crop',
        source: 'static-map-assertions',
        status: 'fail',
      }),
    ]));
  });
}

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

  // Recording the exception edited page-model.json, so Report v0 is now stale.
  // map-gate must not silently refresh it: final approval is blocked until
  // map-report regenerates the Report the human reviews.
  const staleApproval = runGate(cwd, [config.runDir, '--approve', '--note', 'Tried to approve before regenerating Report v0']);
  expect(staleApproval.status).toBe(1);
  expect(staleApproval.stderr).toContain('Report v0 is stale; rerun map-report');
  expect(staleApproval.stderr).toContain('page-model.json');

  runMapReport(config.runDir, { now: new Date('2026-06-17T13:30:00.000Z') });

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
  expect(gate.exceptionWaivers).toEqual([
    expect.objectContaining({
      id: 'exception-hero-crop',
      waived: expect.arrayContaining([
        'static-map-region-hero-desktop-crop',
        'region-hero',
      ]),
    }),
  ]);
  expect(gate.blockers).toEqual([]);
});

test('yoinkit map-gate --approve-exception does not fake Report freshness for a later approval', () => {
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
  });
  const reportFile = path.join(mapReportDir(config.runDir), 'index.html');
  const reportMtimeBefore = fs.statSync(reportFile).mtimeMs;

  const exceptionResult = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', 'Cookie banner is source-owned and accepted for Map v0.',
    '--scope', 'region:region-hero',
  ]);
  expect(exceptionResult.status).toBe(0);

  // The exception write must not touch the Report HTML (no silent mtime bump
  // and no regeneration). map-gate is a recorder, not a stage runner.
  expect(fs.statSync(reportFile).mtimeMs).toBe(reportMtimeBefore);

  // So a later --approve is blocked: page-model.json changed after Report v0.
  const staleApproval = runGate(cwd, [config.runDir, '--approve']);
  expect(staleApproval.status).toBe(1);
  expect(staleApproval.stderr).toContain('Report v0 is stale; rerun map-report');
  expect(staleApproval.stderr).toContain('page-model.json');
  const blockedGate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(blockedGate.decision).toBe('blocked');
  expect(blockedGate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'page-model.json',
      source: 'report-freshness',
      status: 'stale',
    }),
  ]));

  // After regenerating the Report, final approval can proceed.
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:30:00.000Z') });
  const approvalResult = runGate(cwd, [config.runDir, '--approve', '--note', 'Report v0 approved after regeneration']);
  expect(approvalResult.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.decision).toBe('approved');
  expect(gate.exceptionIds).toContain('exception-hero-crop');
  expect(gate.blockers).toEqual([]);
});

test('yoinkit map-gate records all blocker ids waived by one Region exception', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [{
      id: 'static-map-region-hero-desktop-crop',
      kind: 'region-crop',
      required: true,
      status: 'fail',
      evidence: ['crop missing'],
      failure: 'required hero crop is missing',
    }],
    motionAssertions: [{
      id: 'motion-scout-region-hero-attachment',
      kind: 'region-attachment',
      required: true,
      status: 'fail',
      evidence: ['candidate unresolved'],
      failure: 'required motion candidate is not attached',
    }],
  });

  const exceptionResult = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-region',
    '--reason', 'Human accepts all required blockers resolving to the Hero Region.',
    '--scope', 'region:region-hero',
  ]);
  expect(exceptionResult.status).toBe(0);

  // The exception write staled Report v0; regenerate before final approval.
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:30:00.000Z') });

  const approvalResult = runGate(cwd, [config.runDir, '--approve']);

  expect(approvalResult.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.assertionSummary).toMatchObject({
    failedRequired: 0,
    exceptedRequired: 2,
  });
  expect(gate.exceptionWaivers).toEqual([
    expect.objectContaining({
      id: 'exception-hero-region',
      waived: expect.arrayContaining([
        'static-map-region-hero-desktop-crop',
        'motion-scout-region-hero-attachment',
      ]),
    }),
  ]);
  expect(gate.exceptionWaivers[0].waived).toHaveLength(2);
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

test('yoinkit map-gate --approve does not let short Region ids absorb longer generated ids', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticAssertions: [{
      id: 'static-map-region-hero-crop',
      kind: 'region-crop',
      required: true,
      status: 'fail',
      evidence: ['crop missing'],
      failure: 'this id should not resolve to the shorter region id',
    }],
  });
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const model = readJson(pageModelFile);
  model.viewports = [{ id: 'desktop', width: 1280, height: 800 }];
  model.pages.home.regions[0].id = 'region';
  model.pages.home.regions[0].source.primarySelector = 'main > section.region';
  model.exceptions.push({
    id: 'exception-short-region',
    stage: 'map-gate',
    scope: { kind: 'region', id: 'region' },
    reason: 'Only the literal region id is waived.',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  });
  writeJson(pageModelFile, model);
  runMapReport(config.runDir, { now: new Date('2026-06-17T13:18:00.000Z') });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.assertionSummary).toMatchObject({
    failedRequired: 1,
    exceptedRequired: 0,
  });
  expect(gate.exceptionWaivers).toEqual([
    expect.objectContaining({
      id: 'exception-short-region',
      waived: [],
    }),
  ]);
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'static-map-region-hero-crop',
      source: 'static-map-assertions',
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

test('yoinkit map-gate accepts audit text values that begin with dashes', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve', '--note', '--legacy banner, see ticket']);

  expect(result.status).toBe(0);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.humanDecision.note).toBe('--legacy banner, see ticket');
});

test('yoinkit map-gate accepts exception reasons that begin with dashes', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [
    config.runDir,
    '--approve-exception', 'exception-hero-crop',
    '--reason', '--source-owned banner accepted',
    '--scope', 'region:region-hero',
  ]);

  expect(result.status).toBe(0);
  const page = readJson(path.join(config.runDir, 'page-model.json'));
  expect(page.exceptions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'exception-hero-crop',
      reason: '--source-owned banner accepted',
    }),
  ]));
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

test('yoinkit map-gate --approve rejects --reason and points to --note', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve', '--reason', 'should have used a note']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-gate --approve does not accept --reason');
  expect(result.stderr).toContain('--note');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

for (const { name, args, message } of [
  { name: 'reject with scope', args: ['--reject', '--reason', 'no', '--scope', 'region:region-hero'], message: 'map-gate --reject does not accept --scope' },
  { name: 'reject with note', args: ['--reject', '--reason', 'no', '--note', 'audit'], message: 'map-gate --reject does not accept --note' },
  { name: 'approve-exception with note', args: ['--approve-exception', 'exception-hero-crop', '--reason', 'r', '--scope', 'region:region-hero', '--note', 'audit'], message: 'map-gate --approve-exception does not accept --note' },
]) {
  test(`yoinkit map-gate rejects cross-action flags: ${name}`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd);

    const result = runGate(cwd, [config.runDir, ...args]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
  });
}

test('runMapGate rejects direct rejection calls without a human-readable reason', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  expect(() => runMapGate(config.runDir, { action: 'reject' })).toThrow('map-gate --reject requires --reason');
  expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
});

for (const decision of [{}, { action: 'aprove' }]) {
  test(`runMapGate rejects direct calls with invalid action ${JSON.stringify(decision)}`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd);

    expect(() => runMapGate(config.runDir, decision)).toThrow('requires one of approve, reject, or approve-exception');
    expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
  });
}

for (const decision of [
  { action: 'approve-exception', reason: 'Needs exception.', scope: 'region:region-hero' },
  { action: 'approve-exception', exceptionId: 'exception-direct', scope: 'region:region-hero' },
  { action: 'approve-exception', exceptionId: 'exception-direct', reason: 'Needs exception.' },
]) {
  test(`runMapGate rejects incomplete direct approve-exception call ${JSON.stringify(decision)}`, () => {
    const cwd = tempDir();
    const config = prepareGateRun(cwd);

    expect(() => runMapGate(config.runDir, decision)).toThrow('map-gate --approve-exception requires');
    expect(fs.existsSync(path.join(mapReportDir(config.runDir), 'gate.json'))).toBe(false);
  });
}
