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

function createRun(cwd) {
  return initRun({
    url: 'https://example.com/source',
    runDir: path.join(cwd, 'run'),
  }, { cwd, now: new Date('2026-06-17T12:00:00.000Z') });
}

function pageModel() {
  return {
    schemaVersion: 1,
    source: { url: 'https://example.com/source' },
    viewports: [{ id: 'desktop', width: 1280, height: 800 }],
    pages: {
      home: {
        path: '/',
        dimensions: {
          desktop: { scrollWidth: 1280, scrollHeight: 1200 },
        },
        regions: [{
          id: 'region-hero',
          name: 'Hero',
          kind: 'hero',
          parentId: null,
          order: 0,
          viewports: {
            desktop: {
              presence: 'present',
              rect: { x: 0, y: 0, width: 1280, height: 620 },
              stacking: { zIndex: 'auto' },
              scrollY: 0,
              placeholder: { width: 1280, height: 620 },
              crop: {
                path: '02-static-map/crops/desktop/region-hero.png',
                width: 1280,
                height: 620,
                bytes: 68,
                selector: 'main > section.hero',
                method: 'fixture',
              },
            },
          },
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
  const config = createRun(cwd);
  writeJson(path.join(config.runDir, 'page-model.json'), pageModel());

  writeJson(path.join(reconDir(config.runDir), 'page-state.json'), {
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:10:00.000Z',
    status: 'ready',
    finalUrl: 'https://example.com/source',
  });
  writeJson(path.join(staticMapDir(config.runDir), 'measurements.json'), {
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:20:00.000Z',
    viewports: [{ id: 'desktop', regionIds: ['region-hero'] }],
  });
  writeJson(path.join(staticMapDir(config.runDir), 'assertions.json'), assertions(options.staticAssertions || [{
    id: 'static-map-region-hero-crop',
    kind: 'region-crop',
    required: true,
    status: 'pass',
    evidence: ['crop exists'],
    failure: null,
  }]));
  writeText(path.join(staticMapDir(config.runDir), 'coverage.md'), coverageMarkdown('Static Map Coverage', options.staticCoverage || [{
    area: 'region-hero crop',
    required: true,
    status: 'complete',
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
  } else {
    writeJson(path.join(motionScoutDir(config.runDir), 'motion-candidates.json'), {
      schemaVersion: 1,
      generatedAt: '2026-06-17T12:25:00.000Z',
      candidates: [],
      discovery: {
        sources: {},
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

test('yoinkit map-gate --approve blocks incomplete required coverage rows', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd, {
    staticCoverage: [{
      area: 'region-hero crop',
      required: true,
      status: 'missing',
      reason: 'crop evidence is absent',
    }],
    motionCoverage: [{
      area: 'css transitions',
      required: true,
      status: 'incomplete',
      reason: 'CSS transition scan did not finish',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Map Gate approval blocked');
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
    motionScout: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: 'region-hero crop',
      source: 'static-map-coverage',
      status: 'missing',
    }),
    expect.objectContaining({
      id: 'css transitions',
      source: 'motion-scout-coverage',
      status: 'incomplete',
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
    motionCoverage: [{
      area: 'css transitions',
      required: true,
      status: 'exception',
      reason: 'markdown exception is not canonical',
    }],
  });

  const result = runGate(cwd, [config.runDir, '--approve']);

  expect(result.status).toBe(1);
  const gate = readJson(path.join(mapReportDir(config.runDir), 'gate.json'));
  expect(gate.coverageSummary).toMatchObject({
    staticMap: { incompleteRequired: 1 },
    motionScout: { incompleteRequired: 1 },
  });
  expect(gate.blockers).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'region-hero crop', status: 'approved' }),
    expect.objectContaining({ id: 'css transitions', status: 'exception' }),
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
      id: 'scroll-trigger-registry',
      source: 'motion-scout-coverage',
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
      id: 'css-transition-hover',
      source: 'motion-scout-coverage',
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
      id: 'css-keyframes',
      source: 'motion-scout-coverage',
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
      id: 'static-map-region-hero-crop',
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
    }],
  });

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

test('yoinkit map-gate --approve records final approval when Report inputs are fresh and blockers are clear', () => {
  const cwd = tempDir();
  const config = prepareGateRun(cwd);

  const result = runGate(cwd, [config.runDir, '--approve', '--note', 'Human approved Report v0 for Capture']);

  const gateFile = path.join(mapReportDir(config.runDir), 'gate.json');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(gateFile);
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
