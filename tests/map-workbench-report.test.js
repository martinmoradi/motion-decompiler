#!/usr/bin/env bun
'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { initRun } = require('../lib/map-workbench/init');
const { readJson, writeJson } = require('../lib/map-workbench/artifacts');
const { runRecon } = require('../lib/map-workbench/recon');
const { runStaticMap } = require('../lib/map-workbench/static-map');
const { runMotionScout } = require('../lib/map-workbench/motion-scout');

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const CLI_TIMEOUT_MS = 10000;
const tempDirs = new Set();
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

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-map-report-test-'));
  tempDirs.add(dir);
  return dir;
}

function createRun(cwd, options = {}) {
  return initRun(Object.assign({
    url: 'https://example.com/source',
    runDir: path.join(cwd, 'run'),
  }, options), { cwd, now: new Date('2026-06-17T12:00:00.000Z') });
}

function readyReconSnapshot(overrides = {}) {
  return Object.assign({
    finalUrl: 'https://example.com/source',
    effectiveUrl: 'https://example.com/source',
    title: 'Ready page',
    readiness: { status: 'ready', readyState: 'complete', textLength: 320 },
    blockers: [],
    dimensions: {
      scrollWidth: 1280,
      scrollHeight: 1800,
      clientWidth: 1280,
      clientHeight: 800,
    },
    viewport: { width: 1280, height: 800, devicePixelRatio: 1 },
    sourceMetadata: {},
    frameworkHints: [],
    libraryHints: [],
    iframes: [],
  }, overrides);
}

function fakeReconDriver(snapshots) {
  return {
    probe(targetUrl, viewport) {
      const snapshot = Object.prototype.hasOwnProperty.call(snapshots, viewport.id)
        ? snapshots[viewport.id]
        : snapshots.default;
      if (!snapshot) throw new Error(`Missing Recon snapshot for ${viewport.id}`);
      return JSON.parse(JSON.stringify(snapshot));
    },
  };
}

function measuredCandidate(overrides = {}) {
  return Object.assign({
    selector: 'section',
    selectors: ['section'],
    semantic: {},
    rect: { x: 0, y: 0, width: 1280, height: 400 },
    scrollY: 0,
    stacking: { zIndex: 'auto' },
    colors: [{ property: 'background-color', value: 'rgb(250, 250, 250)' }],
    typography: [{
      selector: 'section h2',
      sampleText: 'Sample',
      fontFamily: 'Inter',
      fontSize: '32px',
      fontWeight: '700',
      lineHeight: '38px',
      letterSpacing: '0px',
      sourceHints: { stylesheetHrefs: [], fontUrls: [] },
    }],
    assets: [],
  }, overrides);
}

function writeTinyPng(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lTO+8QAAAABJRU5ErkJggg==',
    'base64'
  ));
}

function completeMotionInspections() {
  return REQUIRED_MOTION_DISCOVERY_SOURCES.map(source => ({
    source,
    status: 'complete',
    evidence: `${source} inspected`,
  }));
}

function prepareReportRun(cwd, options = {}) {
  const captureCrops = options.captureCrops !== false;
  const motionMeasurement = options.motionMeasurement || {
    cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'transform' }],
    loops: [{ sel: 'main > section.hero .orbital' }],
    sourceInspections: completeMotionInspections(),
  };
  const config = createRun(cwd, {
    viewports: ['desktop=1280x800', 'mobile=390x844'],
  });
  runRecon(config.runDir, {
    driver: fakeReconDriver({
      desktop: readyReconSnapshot(),
      mobile: readyReconSnapshot({
        dimensions: {
          scrollWidth: 390,
          scrollHeight: 1800,
          clientWidth: 390,
          clientHeight: 844,
        },
        viewport: { width: 390, height: 844, devicePixelRatio: 2 },
      }),
    }),
    now: new Date('2026-06-17T12:15:00.000Z'),
  });
  runStaticMap(config.runDir, {
    driver: {
      measure(targetUrl, viewport) {
        const mobile = viewport.id === 'mobile';
        const width = viewport.width;
        return {
          candidates: [
            measuredCandidate({
              selector: 'header.site-header',
              selectors: ['header.site-header'],
              semantic: { tagName: 'header', role: 'banner', text: 'Acme' },
              rect: { x: 0, y: 0, width, height: mobile ? 64 : 72 },
              stacking: { zIndex: '10', position: 'sticky' },
            }),
            measuredCandidate({
              selector: 'main > section.hero',
              selectors: ['main > section.hero', '[data-section="hero"]'],
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: mobile ? 64 : 72, width, height: mobile ? 560 : 620 },
            }),
          ],
        };
      },
      captureRegionCrop({ outputFile, viewport }) {
        if (captureCrops) writeTinyPng(outputFile);
        return {
          method: 'agent-browser-viewport-screenshot',
          width: viewport.width,
          height: viewport.height,
        };
      },
    },
    now: new Date('2026-06-17T12:30:00.000Z'),
  });
  runMotionScout(config.runDir, {
    driver: {
      measure(targetUrl, viewport) {
        const measurement = typeof motionMeasurement === 'function'
          ? motionMeasurement(viewport)
          : motionMeasurement;
        return JSON.parse(JSON.stringify(measurement));
      },
    },
    now: new Date('2026-06-17T12:45:00.000Z'),
  });
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const pageModel = readJson(pageModelFile);
  const hero = pageModel.pages.home.regions.find(region => region.id === 'region-launch-faster');
  fs.mkdirSync(path.join(config.runDir, '02-static-map', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(config.runDir, '02-static-map', 'assets', 'hero-logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
  hero.static.assets = [{
    selector: 'main > section.hero img.logo',
    kind: 'img',
    path: '02-static-map/assets/hero-logo.svg',
    status: 'copied',
    required: true,
  }];
  writeJson(pageModelFile, pageModel);
  return config;
}

function extractSnapshot(html) {
  const match = html.match(/<script type="application\/json" id="yoinkit-report-snapshot">([\s\S]*?)<\/script>/);
  expect(match).not.toBeNull();
  return JSON.parse(match[1]);
}

test('yoinkit map-report writes a portable static HTML projection with embedded snapshots and hashes', () => {
  const cwd = tempDir();
  const config = prepareReportRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const pageModel = readJson(pageModelFile);
  const hero = pageModel.pages.home.regions.find(region => region.id === 'region-launch-faster');
  hero.static.assets.push({
    selector: 'main > section.hero img.escape',
    kind: 'img',
    path: '../../../etc/passwd',
    status: 'copied',
    required: false,
  });
  writeJson(pageModelFile, pageModel);

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  const reportFile = path.join(config.runDir, '04-map-report', 'index.html');
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(reportFile);
  expect(path.isAbsolute(result.stdout.trim())).toBe(true);
  expect(fs.existsSync(reportFile)).toBe(true);
  expect(fs.existsSync(path.join(config.runDir, '04-map-report', 'report-snapshot.json'))).toBe(true);

  const html = fs.readFileSync(reportFile, 'utf8');
  expect(html).toContain('<!doctype html>');
  expect(html).not.toContain('src="http');
  expect(html).not.toContain('href="http');
  expect(html).toContain('data-mode="source"');
  expect(html).toContain('data-mode="region"');
  expect(html).toContain('data-mode="gate"');
  expect(html).toContain('data-report-mode-toggle="source"');
  expect(html).toContain('window.__yoinkitReportSetMode');
  expect(html).toContain('src="../02-static-map/crops/desktop/region-launch-faster.png"');
  expect(html).toContain('href="../02-static-map/assets/hero-logo.svg"');
  expect(html).toContain('../../../etc/passwd');
  expect(html).not.toMatch(/href="[^"]*etc\/passwd/);
  expect(html).not.toContain('.report-mode { overflow: auto;');
  expect(html).toContain('<div class="source-stack">');
  expect(html).toContain('<article class="source-card" data-region-id="region-launch-faster">');
  expect(html).toContain('<div class="crop-frame" style="aspect-ratio:1280/620;">');
  expect(html).toContain('.region-crop { display: block; width: 100%; height: auto;');
  expect(html).toContain('object-fit: contain; object-position: left top;');
  expect(html).toContain('<strong>hash</strong>');
  expect(html).toContain('style="left:0px;top:72px;width:1280px;height:620px;"');

  const snapshot = extractSnapshot(html);
  expect(snapshot).toMatchObject({
    schemaVersion: 1,
    pageModel: {
      pages: {
        home: {
          regions: [
            { id: 'region-header' },
            { id: 'region-launch-faster' },
          ],
        },
      },
    },
    staticMap: {
      assertions: { schemaVersion: 1 },
      coverageText: expect.stringContaining('# Static Map Coverage'),
    },
    motionScout: {
      candidates: { schemaVersion: 1 },
      coverageText: expect.stringContaining('# Motion Scout Coverage'),
    },
  });
  expect(snapshot.inputHashes['page-model.json']).toMatch(/^[a-f0-9]{64}$/);
  expect(snapshot.inputHashes['02-static-map/assertions.json']).toMatch(/^[a-f0-9]{64}$/);
  expect(snapshot.inputHashes['03-motion-scout/motion-candidates.json']).toMatch(/^[a-f0-9]{64}$/);

  const diskSnapshot = readJson(path.join(config.runDir, '04-map-report', 'report-snapshot.json'));
  expect(diskSnapshot.inputHashes).toEqual(snapshot.inputHashes);
});

test('yoinkit map-report requires completed Recon, Static Map, and Motion Scout inputs', () => {
  const cwd = tempDir();
  const config = createRun(cwd);

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-report requires completed Recon, Static Map, and Motion Scout artifacts');
  expect(result.stderr).toContain('01-recon/page-state.json');
  expect(result.stderr).toContain('02-static-map/measurements.json');
  expect(result.stderr).toContain('03-motion-scout/motion-candidates.json');
  expect(fs.existsSync(path.join(config.runDir, '04-map-report'))).toBe(false);
});

test('yoinkit map-report reports a friendly prerequisite error for a missing page model', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  fs.rmSync(path.join(config.runDir, 'page-model.json'));

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-report requires completed Recon, Static Map, and Motion Scout artifacts');
  expect(result.stderr).toContain('page-model.json');
  expect(result.stderr).not.toContain('ENOENT');
  expect(fs.existsSync(path.join(config.runDir, '04-map-report'))).toBe(false);
});

test('Gate mode surfaces failed, unknown, unapproved exception, stale, and candidate findings', () => {
  const cwd = tempDir();
  const config = prepareReportRun(cwd);

  const pageStateFile = path.join(config.runDir, '01-recon', 'page-state.json');
  const pageState = readJson(pageStateFile);
  pageState.generatedAt = '2026-06-17T13:30:00.000Z';
  writeJson(pageStateFile, pageState);

  const staticAssertionsFile = path.join(config.runDir, '02-static-map', 'assertions.json');
  const staticAssertions = readJson(staticAssertionsFile);
  staticAssertions.assertions.push({
    id: 'static-map-region-launch-faster-asset-blocker',
    kind: 'region-assets',
    required: true,
    status: 'fail',
    evidence: ['hero image missing'],
    failure: 'required hero image evidence is missing',
  });
  writeJson(staticAssertionsFile, staticAssertions);

  const motionAssertionsFile = path.join(config.runDir, '03-motion-scout', 'assertions.json');
  const motionAssertions = readJson(motionAssertionsFile);
  motionAssertions.generatedAt = '2026-06-17T12:00:00.000Z';
  writeJson(motionAssertionsFile, motionAssertions);

  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const pageModel = readJson(pageModelFile);
  const hero = pageModel.pages.home.regions.find(region => region.id === 'region-launch-faster');
  hero.unknowns.push({
    field: 'source.primarySelector',
    reason: 'primary selector needs human confirmation',
  });
  pageModel.exceptions.push({
    id: 'exception-approved-hero-asset',
    stage: 'map-gate',
    scope: 'region-launch-faster',
    reason: 'approved hero asset exception should stay hidden',
    approvedBy: 'human',
    approvedAt: '2026-06-17T13:00:00.000Z',
  });
  pageModel.exceptions.push({
    id: 'exception-hero-asset',
    stage: 'map-gate',
    scope: 'region-launch-faster',
    reason: 'hero asset needs human approval',
  });
  writeJson(pageModelFile, pageModel);

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(0);
  const html = fs.readFileSync(path.join(config.runDir, '04-map-report', 'index.html'), 'utf8');
  expect(html).toContain('required hero image evidence is missing');
  expect(html).toContain('primary selector needs human confirmation');
  expect(html).toContain('hero asset needs human approval');
  expect(html).toContain('hover lead for main &gt; section.hero a.cta');
  expect(html).toContain('stale');
  expect(html).toContain('02-static-map/assertions.json is older than 01-recon/page-state.json');

  const snapshot = extractSnapshot(html);
  expect(snapshot.gateFindings.map(finding => finding.message)).not.toContain('approved hero asset exception should stay hidden');
  expect(snapshot.gateFindings).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'motion-scout',
      id: '03-motion-scout/assertions.json',
      status: 'stale',
    }),
  ]));
  expect(snapshot.gateFindings.map(finding => finding.status)).toEqual(expect.arrayContaining([
    'fail',
    'unknown',
    'exception',
    'candidate',
    'stale',
  ]));
});

test('Gate mode surfaces required coverage rows that are not complete', () => {
  const cwd = tempDir();
  const config = prepareReportRun(cwd, {
    motionMeasurement: { cssHovers: [], loops: [], sourceInspections: completeMotionInspections() },
  });
  fs.writeFileSync(path.join(config.runDir, '02-static-map', 'coverage.md'), [
    '# Static Map Coverage',
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    '| region-launch-faster | Launch Faster | required | out_of_scope | fixture | Human-visible source banner blocks the crop |',
    '| region-header | Header | info | missing | fixture | Optional header evidence is deferred |',
    '',
  ].join('\n'));

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(0);
  const html = fs.readFileSync(path.join(config.runDir, '04-map-report', 'index.html'), 'utf8');
  expect(html).toContain('Human-visible source banner blocks the crop');
  const snapshot = extractSnapshot(html);
  expect(snapshot.gateFindings).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'static-map-coverage',
      id: 'Launch Faster',
      status: 'out_of_scope',
      message: expect.stringContaining('Human-visible source banner blocks the crop'),
    }),
    expect.objectContaining({
      source: 'static-map-coverage',
      id: 'Header',
      status: 'missing',
      message: expect.stringContaining('Optional header evidence is deferred'),
    }),
  ]));
});

test('Gate mode ignores the Motion Scout no-candidates placeholder row', () => {
  const cwd = tempDir();
  const config = prepareReportRun(cwd, {
    motionMeasurement: { cssHovers: [], loops: [], sourceInspections: completeMotionInspections() },
  });

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(0);
  const html = fs.readFileSync(path.join(config.runDir, '04-map-report', 'index.html'), 'utf8');
  const snapshot = extractSnapshot(html);
  expect(snapshot.gateFindings).toEqual([]);
  expect(html).toContain('No Map Gate blockers found in current Report inputs.');
});

test('Gate mode surfaces real Static Map missing coverage without duplicating assertion-backed rows', () => {
  const cwd = tempDir();
  const config = prepareReportRun(cwd, {
    captureCrops: false,
    motionMeasurement: { cssHovers: [], loops: [], sourceInspections: completeMotionInspections() },
  });

  const result = spawnSync(process.execPath, [BIN, 'map-report', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(0);
  const html = fs.readFileSync(path.join(config.runDir, '04-map-report', 'index.html'), 'utf8');
  const snapshot = extractSnapshot(html);
  expect(snapshot.gateFindings).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'static-map-coverage',
      status: 'missing',
    }),
  ]));
  expect(snapshot.gateFindings.filter(finding => finding.id === 'static-map-region-launch-faster-desktop-crop')).toHaveLength(1);
});
