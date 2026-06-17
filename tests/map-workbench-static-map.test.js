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

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-static-map-test-'));
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
    typography: [],
    assets: [],
  }, overrides);
}

test('static-map requires completed ready Recon evidence before writing Static Map artifacts', () => {
  const cwd = tempDir();
  const config = createRun(cwd);

  expect(() => runStaticMap(config.runDir, {
    driver: { measure() { return { candidates: [] }; } },
    now: new Date('2026-06-17T13:00:00.000Z'),
  })).toThrow(/requires completed Recon/);
  expect(fs.existsSync(path.join(config.runDir, '02-static-map'))).toBe(false);
});

test('static-map refuses blocked Recon evidence without overwriting run artifacts', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({
      desktop: readyReconSnapshot({
        readiness: { status: 'blocked', readyState: 'complete', textLength: 80 },
        blockers: [{ type: 'challenge', evidence: 'verify you are human' }],
      }),
    }),
    now: new Date('2026-06-17T12:20:00.000Z'),
  });

  expect(() => runStaticMap(config.runDir, {
    driver: { measure() { return { candidates: [] }; } },
    now: new Date('2026-06-17T13:00:00.000Z'),
  })).toThrow(/ready status; found blocked/);
  expect(fs.existsSync(path.join(config.runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(config.runDir, '02-static-map'))).toBe(false);
});

test('static-map creates a place-first Region scaffold from measured candidates', () => {
  const cwd = tempDir();
  const config = createRun(cwd, {
    viewports: ['desktop=1280x800', 'mobile=390x844'],
  });
  runRecon(config.runDir, {
    driver: fakeReconDriver({
      desktop: readyReconSnapshot(),
      mobile: readyReconSnapshot({
        dimensions: {
          scrollWidth: 390,
          scrollHeight: 2200,
          clientWidth: 390,
          clientHeight: 844,
        },
        viewport: { width: 390, height: 844, devicePixelRatio: 2 },
      }),
    }),
    now: new Date('2026-06-17T12:15:00.000Z'),
  });

  const driver = {
    measure(targetUrl, viewport) {
      const width = viewport.width;
      const compact = viewport.id === 'mobile';
      return {
        settling: {
          recipe: ['initial-rest'],
          note: 'fixture was already at rest',
        },
        candidates: [
          measuredCandidate({
            selector: 'header.site-header',
            selectors: ['header.site-header', 'header[role="banner"]'],
            semantic: { tagName: 'header', role: 'banner', text: 'Acme Work Contact' },
            rect: { x: 0, y: 0, width, height: compact ? 64 : 72 },
            scrollY: 0,
            stacking: { zIndex: '10', position: 'sticky' },
          }),
          measuredCandidate({
            selector: 'main > section.hero',
            selectors: ['main > section.hero', '[data-section="hero"]'],
            semantic: { tagName: 'section', ariaLabel: 'Launch faster', heading: 'Launch faster' },
            rect: { x: 0, y: compact ? 64 : 72, width, height: compact ? 560 : 620 },
            scrollY: 0,
          }),
          measuredCandidate({
            selector: 'section.work-grid',
            selectors: ['section.work-grid'],
            semantic: { tagName: 'section', heading: 'Selected work', repeatedItemCount: 3 },
            rect: { x: 0, y: compact ? 624 : 692, width, height: compact ? 780 : 520 },
            scrollY: compact ? 520 : 620,
          }),
          measuredCandidate({
            selector: 'footer.site-footer',
            selectors: ['footer.site-footer'],
            semantic: { tagName: 'footer', role: 'contentinfo', text: 'Footer' },
            rect: { x: 0, y: compact ? 1404 : 1212, width, height: compact ? 220 : 180 },
            scrollY: compact ? 1320 : 1120,
          }),
        ],
      };
    },
  };

  const result = runStaticMap(config.runDir, {
    driver,
    now: new Date('2026-06-17T13:00:00.000Z'),
  });

  expect(result.regions.map(region => [region.id, region.name, region.kind, region.order])).toEqual([
    ['region-header', 'Header', 'header', 0],
    ['region-launch-faster', 'Launch faster', 'hero', 1],
    ['region-selected-work', 'Selected work', 'list', 2],
    ['region-footer', 'Footer', 'footer', 3],
  ]);

  const pageModel = readJson(path.join(config.runDir, 'page-model.json'));
  expect(pageModel.pages.home.regions).toHaveLength(4);
  expect(pageModel.pages.home.regions[1]).toMatchObject({
    id: 'region-launch-faster',
    parentId: null,
    viewports: {
      desktop: {
        presence: 'present',
        rect: { x: 0, y: 72, width: 1280, height: 620 },
        scrollY: 0,
        placeholder: { width: 1280, height: 620 },
        crop: { path: null, reason: 'crop capture deferred for Static Map Region scaffold slice' },
      },
      mobile: {
        presence: 'present',
        rect: { x: 0, y: 64, width: 390, height: 560 },
        scrollY: 0,
        placeholder: { width: 390, height: 560 },
      },
    },
    source: {
      primarySelector: 'main > section.hero',
      selectors: ['main > section.hero', '[data-section="hero"]'],
    },
    motionCandidates: [],
  });
  expect(pageModel.pages.home.regions[0].viewports.desktop.stacking).toEqual({ zIndex: '10', position: 'sticky' });
  expect(pageModel.captures).toEqual([]);
  expect(pageModel.notes).toEqual([]);
  expect(pageModel.exceptions).toEqual([]);

  const measurements = readJson(path.join(config.runDir, '02-static-map', 'measurements.json'));
  expect(measurements.viewports.map(viewport => viewport.id)).toEqual(['desktop', 'mobile']);
  expect(measurements.viewports[0].rawCandidates).toHaveLength(4);
  expect(measurements.settling.desktop.recipe).toEqual(['initial-rest']);

  const assertions = readJson(path.join(config.runDir, '02-static-map', 'assertions.json'));
  expect(assertions.assertions.every(assertion => assertion.status === 'pass')).toBe(true);
  expect(assertions.assertions.map(assertion => assertion.id)).toContain('static-map-regions-present');

  const coverage = fs.readFileSync(path.join(config.runDir, '02-static-map', 'coverage.md'), 'utf8');
  expect(coverage).toContain('| region-launch-faster | Launch faster | required | complete |');
  expect(coverage).toContain('crop capture deferred for Static Map Region scaffold slice');

  expect(fs.readdirSync(config.runDir).sort()).toEqual(['00-config.json', '01-recon', '02-static-map', 'page-model.json']);
});

test('static-map keeps generated selectors as evidence instead of Region identity', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:25:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: '#w-node-_123-456',
              selectors: ['#w-node-_123-456', 'body > div:nth-child(2) > section:nth-child(3)'],
              semantic: { tagName: 'section', heading: 'Feature' },
              rect: { x: 0, y: 120, width: 1280, height: 360 },
            }),
            measuredCandidate({
              selector: 'body > div:nth-child(2) > section:nth-child(4)',
              selectors: ['body > div:nth-child(2) > section:nth-child(4)'],
              semantic: { tagName: 'section', heading: 'Feature' },
              rect: { x: 0, y: 520, width: 1280, height: 360 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:05:00.000Z'),
  });

  expect(result.regions.map(region => region.id)).toEqual(['region-feature', 'region-feature-2']);
  expect(result.regions.some(region => /desktop|w-node|nth-child|123|456/.test(region.id))).toBe(false);
  expect(result.regions[0].source).toMatchObject({
    primarySelector: null,
    selectors: ['#w-node-_123-456', 'body > div:nth-child(2) > section:nth-child(3)'],
  });
  expect(result.regions[0].unknowns).toContainEqual({
    field: 'source.primarySelector',
    reason: 'no stable primary selector was measured for this Region',
  });
});

test('static-map treats nth-of-type selectors as unstable primary selector evidence', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:27:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section:nth-of-type(2)',
              selectors: ['main > section:nth-of-type(2)'],
              semantic: { tagName: 'section', heading: 'Feature' },
              rect: { x: 0, y: 120, width: 1280, height: 360 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:07:00.000Z'),
  });

  expect(result.regions[0].source.primarySelector).toBe(null);
  expect(result.regions[0].source.selectors).toEqual(['main > section:nth-of-type(2)']);
  expect(result.regions[0].unknowns).toContainEqual({
    field: 'source.primarySelector',
    reason: 'no stable primary selector was measured for this Region',
  });
});

test('static-map measures the effective Recon URL for retargeted iframe runs', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  const shellUrl = 'https://example.com/shell';
  const iframeUrl = 'https://example.com/embed';
  runRecon(config.runDir, {
    driver: fakeReconDriver({
      desktop: readyReconSnapshot({
        finalUrl: shellUrl,
        effectiveUrl: iframeUrl,
        retargetedFrom: shellUrl,
        title: 'Embedded app',
      }),
    }),
    now: new Date('2026-06-17T12:28:00.000Z'),
  });

  const measuredUrls = [];
  runStaticMap(config.runDir, {
    driver: {
      measure(targetUrl) {
        measuredUrls.push(targetUrl);
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section.hero',
              semantic: { tagName: 'section', heading: 'Embedded hero' },
              rect: { x: 0, y: 0, width: 1280, height: 500 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:08:00.000Z'),
  });

  expect(measuredUrls).toEqual([iframeUrl]);
});

test('static-map merges tiny candidates into the surrounding page outline', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:30:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'header.site-header',
              semantic: { tagName: 'header' },
              rect: { x: 0, y: 0, width: 1280, height: 72 },
            }),
            measuredCandidate({
              selector: 'main > section.hero',
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: 72, width: 1280, height: 620 },
            }),
            measuredCandidate({
              selector: 'main > section.hero .eyebrow',
              semantic: { tagName: 'span', text: 'New' },
              rect: { x: 96, y: 140, width: 82, height: 14 },
            }),
            measuredCandidate({
              selector: 'footer.site-footer',
              semantic: { tagName: 'footer' },
              rect: { x: 0, y: 692, width: 1280, height: 180 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:10:00.000Z'),
  });

  expect(result.regions.map(region => region.id)).toEqual([
    'region-header',
    'region-launch-faster',
    'region-footer',
  ]);
  expect(result.regions.some(region => region.name === 'New')).toBe(false);

  const measurements = readJson(path.join(config.runDir, '02-static-map', 'measurements.json'));
  expect(measurements.viewports[0].rawCandidates).toHaveLength(4);
});

test('static-map collapses overlapping parent and child structural candidates', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:32:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'main',
              semantic: { tagName: 'main', heading: 'Launch faster' },
              rect: { x: 0, y: 80, width: 1280, height: 620 },
            }),
            measuredCandidate({
              selector: 'main > section.hero',
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: 80, width: 1280, height: 620 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:12:00.000Z'),
  });

  expect(result.regions.map(region => region.id)).toEqual(['region-launch-faster']);
  expect(result.regions[0].source.selectors).toContain('main > section.hero');
});

test('static-map seeds Regions from the union of viewport candidates', () => {
  const cwd = tempDir();
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
    now: new Date('2026-06-17T12:33:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure(targetUrl, viewport) {
        if (viewport.id === 'desktop') {
          return {
            candidates: [
              measuredCandidate({
                selector: 'section.desktop-panel',
                semantic: { tagName: 'section', heading: 'Desktop panel' },
                rect: { x: 0, y: 100, width: 1280, height: 420 },
              }),
            ],
          };
        }
        return {
          candidates: [
            measuredCandidate({
              selector: 'section.mobile-panel',
              semantic: { tagName: 'section', heading: 'Mobile panel' },
              rect: { x: 0, y: 70, width: 390, height: 360 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:13:00.000Z'),
  });

  expect(result.regions.map(region => region.id)).toEqual([
    'region-desktop-panel',
    'region-mobile-panel',
  ]);
  expect(result.regions[0].viewports.desktop.presence).toBe('present');
  expect(result.regions[0].viewports.mobile.presence).toBe('absent');
  expect(result.regions[1].viewports.desktop.presence).toBe('absent');
  expect(result.regions[1].viewports.mobile.presence).toBe('present');

  const assertions = readJson(path.join(config.runDir, '02-static-map', 'assertions.json'));
  expect(assertions.assertions.every(assertion => assertion.status === 'pass')).toBe(true);

  const coverage = fs.readFileSync(path.join(config.runDir, '02-static-map', 'coverage.md'), 'utf8');
  expect(coverage).toContain('| region-mobile-panel | Mobile panel | required | complete | mobile |');
});

test('yoinkit static-map runs the Static Map stage from completed Recon inputs', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:35:00.000Z'),
  });
  const fixtureFile = path.join(cwd, 'static-map-fixture.json');
  fs.writeFileSync(fixtureFile, `${JSON.stringify({
    desktop: {
      candidates: [
        measuredCandidate({
          selector: 'main > section.hero',
          semantic: { tagName: 'section', heading: 'Launch faster' },
          rect: { x: 0, y: 80, width: 1280, height: 600 },
        }),
      ],
    },
  }, null, 2)}\n`);

  const result = spawnSync(process.execPath, [BIN, 'static-map', config.runDir], {
    cwd,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      YOINKIT_STATIC_MAP_FIXTURE: fixtureFile,
    }),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Static Map: ready');
  expect(result.stdout).toContain('measurements.json');
  expect(readJson(path.join(config.runDir, 'page-model.json')).pages.home.regions[0].id).toBe('region-launch-faster');
});

test('static-map updates only Static Map-owned Page model fields', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot({ title: 'Keep recon title' }) }),
    now: new Date('2026-06-17T12:40:00.000Z'),
  });
  const pageModelFile = path.join(config.runDir, 'page-model.json');
  const before = readJson(pageModelFile);
  before.pages.home.regions = [{ id: 'region-old', name: 'Old' }];
  before.captures = [{ id: 'capture-existing' }];
  before.notes = [{ id: 'note-existing', text: 'keep' }];
  before.exceptions = [{ id: 'exception-existing', reason: 'keep' }];
  writeJson(pageModelFile, before);

  runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'footer.site-footer',
              semantic: { tagName: 'footer' },
              rect: { x: 0, y: 900, width: 1280, height: 160 },
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:15:00.000Z'),
  });

  const after = readJson(pageModelFile);
  expect(after.source).toEqual(before.source);
  expect(after.pages.home.regions.map(region => region.id)).toEqual(['region-footer']);
  expect(after.captures).toEqual(before.captures);
  expect(after.notes).toEqual(before.notes);
  expect(after.exceptions).toEqual(before.exceptions);
  expect(fs.existsSync(path.join(config.runDir, '03-motion-scout'))).toBe(false);
  expect(fs.existsSync(path.join(config.runDir, '04-map-report'))).toBe(false);
});
