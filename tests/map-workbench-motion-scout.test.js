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
const {
  createFixtureMotionScoutDriver,
  runMotionScout,
} = require('../lib/map-workbench/motion-scout');

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const CLI_TIMEOUT_MS = 10000;
const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-motion-scout-test-'));
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
    colors: [],
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

function prepareStaticMapRun(cwd, options = {}) {
  const config = createRun(cwd, options);
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
            measuredCandidate({
              selector: 'section.logo-strip',
              selectors: ['section.logo-strip'],
              semantic: { tagName: 'section', heading: 'Trusted teams', repeatedItemCount: 4 },
              rect: { x: 0, y: mobile ? 624 : 692, width, height: mobile ? 380 : 420 },
            }),
          ],
        };
      },
      captureRegionCrop({ outputFile }) {
        writeTinyPng(outputFile);
      },
    },
    now: new Date('2026-06-17T12:30:00.000Z'),
  });
  return config;
}

function hasForbiddenKey(value, keys) {
  if (Array.isArray(value)) return value.some(item => hasForbiddenKey(item, keys));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => keys.includes(key) || hasForbiddenKey(child, keys));
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

test('motion-scout requires a completed Static Map Region scaffold before writing artifacts', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:15:00.000Z'),
  });

  expect(() => runMotionScout(config.runDir, {
    driver: { measure() { return {}; } },
    now: new Date('2026-06-17T13:00:00.000Z'),
  })).toThrow(/requires completed Static Map/);
  expect(fs.existsSync(path.join(config.runDir, '03-motion-scout'))).toBe(false);

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.pages.home.regions).toEqual([]);
});

test('motion-scout writes deduplicated candidate records and Region-local references without measured motion facts', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);

  const result = runMotionScout(config.runDir, {
    driver: {
      measure() {
        return {
          libs: ['gsap', 'ScrollTrigger'],
          hoverCandidates: ['main > section.hero a.cta'],
          cssHovers: [{
            sel: 'main > section.hero a.cta',
            prop: 'transform, opacity',
            dur: '0.45s',
            ease: 'cubic-bezier(0.31, 0.75, 0.22, 1)',
          }],
          loops: [{
            sel: 'section.logo-strip .logo-orbit',
            name: 'spinForever',
            dur: '2s',
            timing: 'linear',
          }],
          cssKeyframes: [{
            sel: 'main > section.hero .badge',
            name: 'badgeIntro',
            duration: '0.6s',
            easing: 'ease-out',
          }],
          splitReveals: [{
            host: 'main > section.hero h1',
            section: 'main > section.hero',
            count: 3,
            kinds: ['line-mask'],
            from: { transform: 'translateY(100%)' },
            to: { transform: 'none' },
          }],
          scrollTriggers: [{
            trigger: 'section.logo-strip',
            pin: true,
            scrub: false,
            start: 'top bottom',
            end: 'bottom top',
            anims: [{
              targets: ['section.logo-strip .card'],
              duration: 0.8,
              ease: 'power2.out',
              props: { y: 80 },
            }],
          }],
          clickCandidates: ['main > section.hero a.cta'],
          cursorCandidates: ['main > section.hero .cursor-zone'],
          stickyCandidates: ['header.site-header'],
        };
      },
    },
    now: new Date('2026-06-17T13:00:00.000Z'),
  });

  expect(result.status).toBe('ready');
  expect(result.candidates.every(candidate => candidate.recipe.confidence === 'candidate')).toBe(true);
  expect(result.candidates.map(candidate => candidate.trigger).sort()).toEqual([
    'click',
    'cursor',
    'hover',
    'load',
    'load',
    'loop',
    'scroll',
    'scroll',
  ]);

  const hoverCandidates = result.candidates.filter(candidate => candidate.trigger === 'hover');
  expect(hoverCandidates).toHaveLength(1);
  expect(hoverCandidates[0]).toMatchObject({
    targetSelector: 'main > section.hero a.cta',
    regionId: 'region-launch-faster',
    regionReason: null,
    viewportApplicability: { mode: 'pointer-only', viewportIds: ['desktop'] },
    priorityHint: 'high',
    recipe: { trigger: 'hover', targetSelector: 'main > section.hero a.cta' },
  });
  expect(hoverCandidates[0].evidence.map(item => item.source).sort()).toEqual([
    'css-transition-hover',
    'hover-affordance',
  ]);
  const sameTargetCandidates = result.candidates.filter(candidate => candidate.targetSelector === 'main > section.hero a.cta');
  expect(sameTargetCandidates.map(candidate => candidate.trigger).sort()).toEqual(['click', 'hover']);

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.motionCandidates).toBeUndefined();
  expect(pageModel.pages.home.regions.find(region => region.id === 'region-launch-faster').motionCandidates).toContain(hoverCandidates[0].id);
  expect(pageModel.pages.home.regions.find(region => region.id === 'region-trusted-teams').motionCandidates.length).toBeGreaterThan(0);

  const artifact = readJson(path.join(config.runDir, '03-motion-scout', 'motion-candidates.json'));
  expect(artifact.candidates).toHaveLength(result.candidates.length);
  expect(hasForbiddenKey(artifact, ['dur', 'duration', 'ease', 'easing', 'from', 'to', 'frames', 'timelineRef', 'captureId', 'importance', 'componentName', 'implementationTokens'])).toBe(false);

  const assertions = readJson(path.join(config.runDir, '03-motion-scout', 'assertions.json'));
  expect(assertions.assertions.find(assertion => assertion.id === 'motion-scout-no-measured-motion-facts').status).toBe('pass');
  expect(assertions.assertions.find(assertion => assertion.id === 'motion-scout-source-css-keyframes').status).toBe('pass');
  expect(assertions.assertions.find(assertion => assertion.id === 'motion-scout-source-css-transition-hover').status).toBe('pass');

  const coverage = fs.readFileSync(path.join(config.runDir, '03-motion-scout', 'coverage.md'), 'utf8');
  expect(coverage).toContain('# Motion Scout Coverage');
  expect(coverage).toContain('| css-keyframes | 1 | complete |');
  expect(coverage).toContain('| css-transition-hover | 1 | complete |');
  expect(coverage).toContain('CSS hover transition clue on transform, opacity');
  expect(coverage).toContain('| region-launch-faster |');
});

test('motion-scout records required discovery inspections even when a source has zero candidates', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);

  runMotionScout(config.runDir, {
    driver: {
      measure() {
        return {
          sourceInspections: completeMotionInspections('desktop'),
        };
      },
    },
    now: new Date('2026-06-17T13:05:00.000Z'),
  });

  const artifact = readJson(path.join(config.runDir, '03-motion-scout', 'motion-candidates.json'));
  expect(artifact.discovery.requiredSources).toEqual(REQUIRED_MOTION_DISCOVERY_SOURCES);
  expect(artifact.discovery.inspections).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'scroll-trigger-registry',
      viewportId: 'desktop',
      required: true,
      status: 'complete',
      candidates: 0,
    }),
  ]));

  const coverage = fs.readFileSync(path.join(config.runDir, '03-motion-scout', 'coverage.md'), 'utf8');
  expect(coverage).toContain('| scroll-trigger-registry | desktop | yes | 0 | complete |');
  expect(coverage).not.toContain('| unknown-motion-clue | desktop | yes |');
});

test('motion-scout records source-level inspection failures while preserving sibling evidence', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);
  const inspections = completeMotionInspections('desktop').map(row => (
    row.source === 'scroll-trigger-registry'
      ? Object.assign({}, row, {
        status: 'missing',
        completed: false,
        reason: 'ScrollTrigger registry inspection threw: registry unavailable',
      })
      : row
  ));

  const result = runMotionScout(config.runDir, {
    driver: {
      measure() {
        return {
          sourceInspections: inspections,
          cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'transform' }],
        };
      },
    },
    now: new Date('2026-06-17T13:07:00.000Z'),
  });

  expect(result.candidates.map(candidate => candidate.trigger)).toEqual(['hover']);
  const artifact = readJson(path.join(config.runDir, '03-motion-scout', 'motion-candidates.json'));
  expect(artifact.discovery.inspections).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: 'css-transition-hover',
      status: 'complete',
      candidates: 1,
    }),
    expect.objectContaining({
      source: 'scroll-trigger-registry',
      status: 'missing',
      candidates: 0,
      reason: 'ScrollTrigger registry inspection threw: registry unavailable',
    }),
  ]));

  const coverage = fs.readFileSync(path.join(config.runDir, '03-motion-scout', 'coverage.md'), 'utf8');
  expect(coverage).toContain('| css-transition-hover | desktop | yes | 1 | complete |');
  expect(coverage).toContain('| scroll-trigger-registry | desktop | yes | 0 | missing |');
});

test('motion-scout preserves occurrences, viewport applicability, and null reasons for uncertain placement', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd, {
    viewports: ['desktop=1280x800', 'mobile=390x844'],
  });

  const result = runMotionScout(config.runDir, {
    driver: {
      measure(targetUrl, viewport) {
        if (viewport.id === 'mobile') {
          return {
            cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'opacity' }],
          };
        }
        return {
          cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'opacity' }],
          loops: [{ sel: 'section.logo-strip .marquee' }],
          unknownCandidates: [{
            selector: 'body > .floating-loader',
            reason: 'runtime registry clue did not expose a trigger',
          }],
        };
      },
    },
    now: new Date('2026-06-17T13:10:00.000Z'),
  });

  const hover = result.candidates.find(candidate => candidate.trigger === 'hover');
  expect(hover.occurrences.map(occurrence => occurrence.viewportId).sort()).toEqual(['desktop', 'mobile']);
  expect(hover.viewportApplicability).toMatchObject({
    mode: 'pointer-only',
    viewportIds: ['desktop', 'mobile'],
  });

  const loop = result.candidates.find(candidate => candidate.trigger === 'loop');
  expect(loop.viewportApplicability).toMatchObject({
    mode: 'viewport-specific',
    viewportIds: ['desktop'],
  });

  const unknown = result.candidates.find(candidate => candidate.trigger === 'unknown');
  expect(unknown.triggerReason).toBe('runtime registry clue did not expose a trigger');
  expect(unknown.regionId).toBe(null);
  expect(unknown.regionReason).toBe('motion clue did not match any Static Map Region selector');

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  const regionRefs = pageModel.pages.home.regions.flatMap(region => region.motionCandidates);
  expect(regionRefs).toContain(hover.id);
  expect(regionRefs).toContain(loop.id);
  expect(regionRefs).not.toContain(unknown.id);
});

test('motion-scout mints candidate ids from the resolved Region across merged observations', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);

  const result = runMotionScout(config.runDir, {
    driver: {
      measure() {
        return {
          cssKeyframes: [{ sel: '.hero-title' }],
          splitReveals: [{
            host: '.hero-title',
            section: 'main > section.hero',
            count: 2,
            kinds: ['line-mask'],
          }],
        };
      },
    },
    now: new Date('2026-06-17T13:12:00.000Z'),
  });

  const candidate = result.candidates.find(item => item.trigger === 'load' && item.targetSelector === '.hero-title');
  expect(candidate.regionId).toBe('region-launch-faster');
  expect(candidate.id).toContain('region-launch-faster');
  expect(candidate.id).not.toContain('out-of-region');
});

test('yoinkit motion-scout runs the Motion Scout stage from completed Static Map inputs', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);
  const fixtureFile = path.join(cwd, 'motion-scout-fixture.json');
  fs.writeFileSync(fixtureFile, `${JSON.stringify({
    desktop: {
      cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'transform' }],
    },
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, [BIN, 'motion-scout', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: Object.assign({}, process.env, {
      YOINKIT_MOTION_SCOUT_FIXTURE: fixtureFile,
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Motion Scout: ready');
  expect(result.stdout).toContain('motion-candidates.json');
  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.pages.home.regions.find(region => region.id === 'region-launch-faster').motionCandidates).toHaveLength(1);
});

test('yoinkit motion-scout exits clearly before Static Map has produced Regions', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:15:00.000Z'),
  });

  const result = spawnSync(process.execPath, [BIN, 'motion-scout', config.runDir], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: process.env,
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('requires completed Static Map');
  expect(fs.existsSync(path.join(config.runDir, '03-motion-scout'))).toBe(false);
});

test('motion-scout fixture driver requires per-viewport or default fixture measurements', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd, {
    viewports: ['desktop=1280x800', 'mobile=390x844'],
  });
  const fixtureFile = path.join(cwd, 'motion-scout-fixture.json');
  fs.writeFileSync(fixtureFile, `${JSON.stringify({
    desktop: {
      cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'opacity' }],
    },
  }, null, 2)}\n`);

  expect(() => runMotionScout(config.runDir, {
    driver: createFixtureMotionScoutDriver(fixtureFile),
    now: new Date('2026-06-17T13:18:00.000Z'),
  })).toThrow(/No Motion Scout fixture measurement for viewport "mobile"/);
});

test('motion-scout updates only Motion Scout-owned Page model references', () => {
  const cwd = tempDir();
  const config = prepareStaticMapRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const before = readJson(pageModelFile);
  const beforeRegion = before.pages.home.regions.find(region => region.id === 'region-launch-faster');
  expect(beforeRegion).toBeDefined();
  beforeRegion.motionCandidates = ['candidate-stale'];
  before.captures = [{ id: 'capture-existing' }];
  before.notes = [{ id: 'note-existing', text: 'keep' }];
  before.exceptions = [{ id: 'exception-existing', reason: 'keep' }];
  writeJson(pageModelFile, before);

  runMotionScout(config.runDir, {
    driver: {
      measure() {
        return {
          cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'opacity' }],
        };
      },
    },
    now: new Date('2026-06-17T13:20:00.000Z'),
  });

  const after = readJson(pageModelFile);
  expect(after.source).toEqual(before.source);
  expect(after.captures).toEqual(before.captures);
  expect(after.notes).toEqual(before.notes);
  expect(after.exceptions).toEqual(before.exceptions);
  const afterRegion = after.pages.home.regions.find(region => region.id === 'region-launch-faster');
  expect(afterRegion).toBeDefined();
  expect(afterRegion.motionCandidates).not.toContain('candidate-stale');
  expect(afterRegion.motionCandidates).toHaveLength(1);
  expect(fs.existsSync(path.join(config.runDir, '04-map-report'))).toBe(false);
});
