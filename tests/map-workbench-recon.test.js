'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { initRun } = require('../lib/map-workbench/init');
const { readJson, writeJson } = require('../lib/map-workbench/artifacts');
const { runRecon } = require('../lib/map-workbench/recon');

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-recon-test-'));
  tempDirs.add(dir);
  return dir;
}

function createRun(cwd, options = {}) {
  return initRun(Object.assign({
    url: 'https://example.com/source',
    runDir: path.join(cwd, 'run'),
  }, options), { cwd, now: new Date('2026-06-17T12:00:00.000Z') });
}

function readySnapshot(overrides = {}) {
  return Object.assign({
    finalUrl: 'https://example.com/source',
    effectiveUrl: 'https://example.com/source',
    title: 'Ready page',
    readiness: {
      status: 'ready',
      readyState: 'complete',
      textLength: 280,
      elementCount: 42,
    },
    blockers: [],
    dimensions: {
      scrollWidth: 1280,
      scrollHeight: 2400,
      clientWidth: 1280,
      clientHeight: 800,
    },
    viewport: { width: 1280, height: 800, devicePixelRatio: 1 },
    sourceMetadata: {
      description: 'fixture description',
      canonicalUrl: 'https://example.com/source',
      ogImage: 'https://example.com/og.png',
      robots: 'index,follow',
    },
    frameworkHints: ['react'],
    libraryHints: ['gsap'],
    iframes: [],
    scrollReadiness: {
      canScroll: true,
      scrollHeight: 2400,
      viewportHeight: 800,
      currentScrollY: 0,
      note: 'scrollable page; Recon did not perform lazy-load settling',
    },
    lazyLoadReadiness: {
      lazyCandidateCount: 1,
      incompleteImageCount: 0,
      note: 'lazy or incomplete assets detected; later stages should settle before measurement',
    },
  }, overrides);
}

function fakeDriver(snapshots) {
  return {
    calls: [],
    probe(targetUrl, viewport) {
      this.calls.push({ targetUrl, viewport });
      const snapshot = snapshots[viewport.id] || snapshots.default;
      if (!snapshot) throw new Error(`Missing snapshot for ${viewport.id}`);
      return JSON.parse(JSON.stringify(snapshot));
    },
  };
}

test('recon measures the configured viewport set primary first and writes only Recon artifacts', () => {
  const cwd = tempDir();
  const config = createRun(cwd, {
    viewports: ['mobile=390x844', 'desktop=1280x800'],
    primaryViewport: 'desktop',
  });
  const driver = fakeDriver({
    desktop: readySnapshot(),
    mobile: readySnapshot({
      dimensions: {
        scrollWidth: 390,
        scrollHeight: 3200,
        clientWidth: 390,
        clientHeight: 844,
      },
      viewport: { width: 390, height: 844, devicePixelRatio: 2 },
    }),
  });

  const result = runRecon(config.runDir, {
    driver,
    now: new Date('2026-06-17T12:34:56.000Z'),
  });

  expect(result.status).toBe('ready');
  expect(driver.calls.map(call => call.viewport.id)).toEqual(['desktop', 'mobile']);
  expect(driver.calls.map(call => call.targetUrl)).toEqual([
    'https://example.com/source',
    'https://example.com/source',
  ]);

  expect(fs.readdirSync(config.runDir).sort()).toEqual(['00-config.json', '01-recon', 'page-model.json']);
  expect(fs.readdirSync(path.join(config.runDir, '01-recon')).sort()).toEqual([
    'page-state.json',
    'source-metadata.json',
    'viewport-manifest.json',
  ]);

  const pageState = readJson(path.join(config.runDir, '01-recon', 'page-state.json'));
  expect(pageState).toMatchObject({
    schemaVersion: 1,
    generatedAt: '2026-06-17T12:34:56.000Z',
    status: 'ready',
    measuredViewportOrder: ['desktop', 'mobile'],
  });

  const viewportManifest = readJson(path.join(config.runDir, '01-recon', 'viewport-manifest.json'));
  expect(viewportManifest.viewports.map(viewport => viewport.id)).toEqual(['desktop', 'mobile']);
  expect(viewportManifest.viewports[1].dimensions.scrollHeight).toBe(3200);

  const sourceMetadata = readJson(path.join(config.runDir, '01-recon', 'source-metadata.json'));
  expect(sourceMetadata).toMatchObject({
    schemaVersion: 1,
    title: 'Ready page',
    metadata: {
      description: 'fixture description',
      canonicalUrl: 'https://example.com/source',
    },
    frameworkHints: ['react'],
    libraryHints: ['gsap'],
  });

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.source).toMatchObject({
    url: 'https://example.com/source',
    finalUrl: 'https://example.com/source',
    title: 'Ready page',
    metadata: { description: 'fixture description' },
    frameworkHints: ['react'],
    libraryHints: ['gsap'],
    recon: {
      generatedAt: '2026-06-17T12:34:56.000Z',
      status: 'ready',
      artifactDir: '01-recon',
    },
  });
  expect(pageModel.pages.home.dimensions).toMatchObject({
    desktop: { scrollHeight: 2400 },
    mobile: { scrollHeight: 3200 },
  });
  expect(pageModel.pages.home.regions).toEqual([]);
  expect(pageModel.captures).toEqual([]);
  expect(pageModel.notes).toEqual([]);
  expect(pageModel.exceptions).toEqual([]);
});

test('recon records blockers while preserving collected evidence', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const driver = fakeDriver({
    desktop: readySnapshot({
      title: 'Access challenge',
      readiness: {
        status: 'blocked',
        readyState: 'complete',
        textLength: 120,
      },
      blockers: [{ type: 'challenge', evidence: 'verify you are human' }],
    }),
  });

  const result = runRecon(config.runDir, {
    driver,
    now: new Date('2026-06-17T13:00:00.000Z'),
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers).toEqual([
    { type: 'challenge', evidence: 'verify you are human', viewportId: 'desktop' },
  ]);
  expect(fs.existsSync(path.join(config.runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(readJson(path.join(config.runDir, '01-recon', 'page-state.json')).viewports[0].title).toBe('Access challenge');
  expect(readJson(path.join(config.runDir, 'page-model.json')).source.recon.status).toBe('blocked');
});

test('recon retargets dominant same-origin iframe content with explicit evidence', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const shellUrl = 'https://example.com/shell';
  const iframeUrl = 'https://example.com/embed';
  const driver = fakeDriver({
    desktop: readySnapshot({
      finalUrl: shellUrl,
      effectiveUrl: iframeUrl,
      retargetedFrom: shellUrl,
      title: 'Embedded app',
      iframe: {
        dominant: true,
        retargeted: true,
        sameOrigin: true,
        accessible: true,
        url: iframeUrl,
        src: iframeUrl,
        areaRatio: 0.92,
      },
      iframes: [{
        dominant: true,
        retargeted: true,
        sameOrigin: true,
        accessible: true,
        url: iframeUrl,
        src: iframeUrl,
        areaRatio: 0.92,
      }],
    }),
  });

  const result = runRecon(config.runDir, {
    driver,
    now: new Date('2026-06-17T13:10:00.000Z'),
  });

  expect(result.status).toBe('ready');
  const pageState = readJson(path.join(config.runDir, '01-recon', 'page-state.json'));
  expect(pageState.viewports[0]).toMatchObject({
    finalUrl: shellUrl,
    effectiveUrl: iframeUrl,
    retargetedFrom: shellUrl,
    dominantIframe: {
      dominant: true,
      retargeted: true,
      sameOrigin: true,
      accessible: true,
    },
  });

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.source.url).toBe(iframeUrl);
  expect(pageModel.source.retargetedFrom).toBe(shellUrl);
  expect(pageModel.pages.home.path).toBe('/embed');
});

test('recon records dominant cross-origin iframe content as a blocker', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const iframeUrl = 'https://player.example.org/embed';
  const driver = fakeDriver({
    desktop: readySnapshot({
      finalUrl: 'https://example.com/shell',
      effectiveUrl: 'https://example.com/shell',
      iframe: {
        dominant: true,
        sameOrigin: false,
        accessible: false,
        url: iframeUrl,
        src: iframeUrl,
        areaRatio: 0.9,
      },
      iframes: [{
        dominant: true,
        sameOrigin: false,
        accessible: false,
        url: iframeUrl,
        src: iframeUrl,
        areaRatio: 0.9,
      }],
    }),
  });

  const result = runRecon(config.runDir, {
    driver,
    now: new Date('2026-06-17T13:20:00.000Z'),
  });

  expect(result.status).toBe('blocked');
  expect(result.blockers).toEqual([
    {
      type: 'cross-origin-iframe',
      evidence: 'dominant iframe is cross-origin',
      url: iframeUrl,
      viewportId: 'desktop',
    },
  ]);
  expect(readJson(path.join(config.runDir, '01-recon', 'page-state.json')).viewports[0].dominantIframe.url).toBe(iframeUrl);
});

test('recon preserves non-Recon Page model fields and existing Region data', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const original = readJson(pageModelFile);
  original.pages.home.regions = [{
    id: 'region-existing',
    name: 'Existing Region',
    kind: 'section',
  }];
  original.captures = [{ id: 'capture-existing' }];
  original.notes = [{ id: 'note-existing', text: 'keep' }];
  original.exceptions = [{ id: 'exception-existing', reason: 'keep' }];
  writeJson(pageModelFile, original);

  runRecon(config.runDir, {
    driver: fakeDriver({ desktop: readySnapshot() }),
    now: new Date('2026-06-17T13:30:00.000Z'),
  });

  const updated = readJson(pageModelFile);
  expect(updated.pages.home.regions).toEqual(original.pages.home.regions);
  expect(updated.captures).toEqual(original.captures);
  expect(updated.notes).toEqual(original.notes);
  expect(updated.exceptions).toEqual(original.exceptions);
});

test('yoinkit recon exits non-zero on blockers after writing artifacts', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const fixtureFile = path.join(cwd, 'blocked-recon-fixture.json');
  writeJson(fixtureFile, {
    desktop: readySnapshot({
      readiness: { status: 'blocked', readyState: 'complete', textLength: 80 },
      blockers: [{ type: 'access-denied', evidence: 'access denied' }],
    }),
  });

  const result = spawnSync(process.execPath, [BIN, 'recon', config.runDir], {
    cwd,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      YOINKIT_RECON_FIXTURE: fixtureFile,
    }),
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain('Recon: blocked');
  expect(result.stdout).toContain('page-state.json');
  expect(result.stderr).toContain('Recon blocked: access-denied (access denied)');
  expect(fs.existsSync(path.join(config.runDir, '01-recon', 'page-state.json'))).toBe(true);
});
