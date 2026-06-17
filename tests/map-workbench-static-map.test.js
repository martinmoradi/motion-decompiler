'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

const { initRun } = require('../lib/map-workbench/init');
const { readJson, writeJson } = require('../lib/map-workbench/artifacts');
const { runRecon } = require('../lib/map-workbench/recon');
const {
  createCaptureBrowserStaticMapDriver,
  runStaticMap,
} = require('../lib/map-workbench/static-map');

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

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function startFixtureServer() {
  const child = spawn(process.execPath, [path.join(__dirname, 'fixtures', 'static-map-server.js')], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`fixture server did not start${stderr ? `: ${stderr}` : ''}`));
    }, 5_000);
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.once('data', chunk => {
      clearTimeout(timeout);
      const url = chunk.toString().trim();
      resolve({
        url,
        close: () => new Promise((closeResolve) => {
          if (child.exitCode != null) {
            closeResolve();
            return;
          }
          child.once('exit', () => closeResolve());
          child.kill('SIGTERM');
        }),
      });
    });
  });
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

function writeTinyPng(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, tinyPngBytes());
}

function tinyPngBytes() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lTO+8QAAAABJRU5ErkJggg==',
    'base64'
  );
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
    captureRegionCrop({ outputFile }) {
      writeTinyPng(outputFile);
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
        crop: { path: '02-static-map/crops/desktop/region-launch-faster.png' },
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
  expect(coverage).toContain('02-static-map/crops/desktop/region-launch-faster.png');

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
      captureRegionCrop({ outputFile }) {
        writeTinyPng(outputFile);
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

test('static-map records crop evidence for every present Region viewport', () => {
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
    now: new Date('2026-06-17T12:34:00.000Z'),
  });

  const captured = [];
  const result = runStaticMap(config.runDir, {
    driver: {
      measure(targetUrl, viewport) {
        const width = viewport.width;
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section.hero',
              selectors: ['main > section.hero'],
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: viewport.id === 'mobile' ? 72 : 80, width, height: viewport.id === 'mobile' ? 520 : 600 },
            }),
            measuredCandidate({
              selector: '#w-node-_generated',
              selectors: ['#w-node-_generated'],
              semantic: { tagName: 'section', heading: 'Generated only' },
              rect: { x: 0, y: viewport.id === 'mobile' ? 620 : 700, width, height: 320 },
            }),
          ],
        };
      },
      captureRegionCrop({ selector, outputFile, relativePath, region, viewport }) {
        captured.push({ selector, relativePath, regionId: region.id, viewportId: viewport.id });
        writeTinyPng(outputFile);
        return { width: region.viewports[viewport.id].rect.width, height: region.viewports[viewport.id].rect.height };
      },
    },
    now: new Date('2026-06-17T13:14:00.000Z'),
  });

  const hero = result.regions.find(region => region.id === 'region-launch-faster');
  expect(hero.viewports.desktop.crop).toMatchObject({
    path: '02-static-map/crops/desktop/region-launch-faster.png',
    width: 1280,
    height: 600,
  });
  expect(hero.viewports.mobile.crop).toMatchObject({
    path: '02-static-map/crops/mobile/region-launch-faster.png',
    width: 390,
    height: 520,
  });
  expect(fs.statSync(path.join(config.runDir, hero.viewports.desktop.crop.path)).size).toBeGreaterThan(0);
  expect(captured.map(call => [call.regionId, call.viewportId, call.selector])).toEqual([
    ['region-launch-faster', 'desktop', 'main > section.hero'],
    ['region-launch-faster', 'mobile', 'main > section.hero'],
  ]);

  const generated = result.regions.find(region => region.id === 'region-generated-only');
  expect(generated.viewports.desktop.crop).toEqual({
    path: null,
    reason: 'no stable primary selector is available for crop capture',
  });
});

test('static-map fetches safely discoverable Region asset evidence', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:36:00.000Z'),
  });

  const png = tinyPngBytes();
  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section.hero',
              selectors: ['main > section.hero'],
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: 80, width: 1280, height: 600 },
              assets: [
                {
                  selector: 'img.hero-art',
                  kind: 'img',
                  url: 'https://example.com/assets/hero.png',
                  role: 'content',
                  intrinsic: { width: 1, height: 1 },
                  rect: { x: 80, y: 140, width: 420, height: 260 },
                },
                {
                  selector: '.missing-bg',
                  kind: 'background-image',
                  url: 'https://example.com/assets/missing.png',
                  role: 'content',
                },
                {
                  selector: 'img.analytics-pixel',
                  kind: 'img',
                  url: 'https://vendor.example/pixel.gif',
                  role: 'vendor',
                  required: false,
                },
              ],
            }),
          ],
        };
      },
      fetchAsset({ url }) {
        if (url.endsWith('/hero.png')) return { bytes: png, contentType: 'image/png' };
        throw new Error('404 not found');
      },
    },
    now: new Date('2026-06-17T13:16:00.000Z'),
  });

  const assets = result.regions[0].static.assets;
  expect(assets).toHaveLength(3);
  expect(assets[0]).toMatchObject({
    selector: 'img.hero-art',
    kind: 'img',
    url: 'https://example.com/assets/hero.png',
    path: '02-static-map/assets/region-launch-faster/hero.png',
    contentType: 'image/png',
    bytes: png.length,
    sha256: crypto.createHash('sha256').update(png).digest('hex'),
    dimensions: { width: 1, height: 1 },
    status: 'fetched',
    required: true,
    severity: 'required',
  });
  expect(fs.statSync(path.join(config.runDir, assets[0].path)).size).toBe(png.length);
  expect(assets[1]).toMatchObject({
    selector: '.missing-bg',
    status: 'missing',
    path: null,
    reason: 'asset fetch failed: 404 not found',
    required: true,
    severity: 'required',
  });
  expect(assets[2]).toMatchObject({
    selector: 'img.analytics-pixel',
    status: 'missing',
    path: null,
    reason: 'cross-origin asset fetch skipped',
    required: false,
    severity: 'info',
  });
});

test('static-map records measured typography evidence and missing typography reasons', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:37:00.000Z'),
  });

  const result = runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section.hero',
              selectors: ['main > section.hero'],
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: 80, width: 1280, height: 600 },
              typography: [
                {
                  selector: 'h1.hero-title',
                  sampleText: 'Launch faster',
                  fontFamily: '"Inter", sans-serif',
                  fontSize: '64px',
                  fontWeight: '700',
                  lineHeight: '72px',
                  letterSpacing: '-1px',
                  sourceHints: {
                    stylesheetHrefs: ['https://example.com/site.css'],
                    fontUrls: ['https://example.com/fonts/inter.woff2'],
                  },
                },
                {
                  selector: 'p.hero-copy',
                  sampleText: 'Proof text',
                  fontFamily: 'Arial, sans-serif',
                  fontSize: '18px',
                  fontWeight: '400',
                },
              ],
            }),
          ],
        };
      },
    },
    now: new Date('2026-06-17T13:17:00.000Z'),
  });

  expect(result.regions[0].static.typography).toEqual([
    {
      selector: 'h1.hero-title',
      sampleText: 'Launch faster',
      fontFamily: '"Inter", sans-serif',
      fontSize: '64px',
      fontWeight: '700',
      lineHeight: '72px',
      letterSpacing: '-1px',
      sourceHints: {
        stylesheetHrefs: ['https://example.com/site.css'],
        fontUrls: ['https://example.com/fonts/inter.woff2'],
      },
      missing: [],
    },
    {
      selector: 'p.hero-copy',
      sampleText: 'Proof text',
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      fontWeight: '400',
      lineHeight: null,
      letterSpacing: null,
      sourceHints: {
        stylesheetHrefs: [],
        fontUrls: [],
        reason: 'no source stylesheet or font URL hints were discoverable',
      },
      missing: [
        { field: 'lineHeight', reason: 'line-height was not measured' },
        { field: 'letterSpacing', reason: 'letter spacing was not measured' },
        { field: 'sourceHints', reason: 'no source stylesheet or font URL hints were discoverable' },
      ],
    },
  ]);
});

test('static-map assertions and coverage include crop asset typography unknown and completeness rows', () => {
  const cwd = tempDir();
  const config = createRun(cwd);
  runRecon(config.runDir, {
    driver: fakeReconDriver({ desktop: readyReconSnapshot() }),
    now: new Date('2026-06-17T12:38:00.000Z'),
  });

  runStaticMap(config.runDir, {
    driver: {
      measure() {
        return {
          candidates: [
            measuredCandidate({
              selector: 'main > section.hero',
              selectors: ['main > section.hero'],
              semantic: { tagName: 'section', heading: 'Launch faster' },
              rect: { x: 0, y: 80, width: 1280, height: 600 },
              typography: [
                {
                  selector: 'h1.hero-title',
                  fontFamily: 'Inter',
                  fontSize: '64px',
                  fontWeight: '700',
                  lineHeight: '72px',
                  letterSpacing: '-1px',
                },
              ],
              assets: [
                {
                  selector: 'img.hero-art',
                  kind: 'img',
                  url: 'https://example.com/assets/missing.png',
                  role: 'content',
                },
                {
                  selector: 'img.vendor-pixel',
                  kind: 'img',
                  url: 'https://vendor.example/pixel.gif',
                  role: 'vendor',
                  required: false,
                },
              ],
            }),
            measuredCandidate({
              selector: '#w-node-_generated',
              selectors: ['#w-node-_generated'],
              semantic: { tagName: 'section', heading: 'Generated only' },
              rect: { x: 0, y: 760, width: 1280, height: 320 },
              typography: [
                {
                  selector: '#w-node-_generated h2',
                  fontFamily: 'Arial',
                  fontSize: '32px',
                  fontWeight: '600',
                  lineHeight: '40px',
                  letterSpacing: '0px',
                },
              ],
            }),
          ],
        };
      },
      captureRegionCrop({ outputFile }) {
        writeTinyPng(outputFile);
      },
      fetchAsset() {
        throw new Error('404 not found');
      },
    },
    now: new Date('2026-06-17T13:18:00.000Z'),
  });

  const assertions = readJson(path.join(config.runDir, '02-static-map', 'assertions.json')).assertions;
  expect(assertions).toContainEqual(expect.objectContaining({
    id: 'static-map-region-launch-faster-desktop-crop',
    kind: 'region-crop',
    required: true,
    status: 'pass',
  }));
  expect(assertions).toContainEqual(expect.objectContaining({
    id: 'static-map-region-launch-faster-assets',
    kind: 'region-assets',
    required: true,
    status: 'fail',
    failure: '1 required asset is missing',
  }));
  expect(assertions).toContainEqual(expect.objectContaining({
    id: 'static-map-region-launch-faster-typography',
    kind: 'region-typography',
    required: true,
    status: 'pass',
  }));
  expect(assertions).toContainEqual(expect.objectContaining({
    id: 'static-map-region-generated-only-unknowns',
    kind: 'region-unknowns',
    required: false,
    status: 'info',
  }));
  expect(assertions).toContainEqual(expect.objectContaining({
    id: 'static-map-region-launch-faster-evidence-completeness',
    kind: 'region-evidence-completeness',
    required: true,
    status: 'fail',
  }));

  const coverage = fs.readFileSync(path.join(config.runDir, '02-static-map', 'coverage.md'), 'utf8');
  expect(coverage).toContain('| region-crop | static-map-region-launch-faster-desktop-crop | required | complete |');
  expect(coverage).toContain('| region-assets | static-map-region-launch-faster-assets | required | missing |');
  expect(coverage).toContain('| region-unknowns | static-map-region-generated-only-unknowns | info | info |');
  expect(coverage).toContain('| region-evidence-completeness | static-map-region-launch-faster-evidence-completeness | required | missing |');
});

const browserTest = commandExists('agent-browser') ? test : test.skip;

browserTest('static-map browser fixture writes a non-empty Region crop', async () => {
  const fixtureServer = await startFixtureServer();
  const cwd = tempDir();
  const fixtureUrl = fixtureServer.url;
  const config = createRun(cwd, { url: fixtureUrl });
  runRecon(config.runDir, {
    driver: fakeReconDriver({
      desktop: readyReconSnapshot({
        finalUrl: fixtureUrl,
        effectiveUrl: fixtureUrl,
        title: 'Static Map Evidence Fixture',
        dimensions: {
          scrollWidth: 1280,
          scrollHeight: 1300,
          clientWidth: 1280,
          clientHeight: 800,
        },
      }),
    }),
    now: new Date('2026-06-17T12:39:00.000Z'),
  });

  const session = `yoink-static-map-test-${process.pid}-${Date.now()}`;
  const previousSession = process.env.AGENT_BROWSER_SESSION;
  process.env.AGENT_BROWSER_SESSION = session;
  try {
    const result = runStaticMap(config.runDir, {
      driver: createCaptureBrowserStaticMapDriver({ openDelayMs: 0 }),
      now: new Date('2026-06-17T13:19:00.000Z'),
    });
    const firstCrop = result.regions
      .flatMap(region => Object.values(region.viewports).map(viewport => viewport.crop))
      .find(crop => crop && crop.path);

    expect(firstCrop.path).toMatch(/^02-static-map\/crops\/desktop\/.+\.png$/);
    expect(fs.statSync(path.join(config.runDir, firstCrop.path)).size).toBeGreaterThan(0);
    expect(result.regions.some(region => region.static.typography.length > 0)).toBe(true);
  } finally {
    const env = Object.assign({}, process.env, { AGENT_BROWSER_SESSION: session });
    spawnSync(path.join(__dirname, '..', 'bin', 'capture-browser'), ['close'], { env });
    await fixtureServer.close();
    if (previousSession === undefined) delete process.env.AGENT_BROWSER_SESSION;
    else process.env.AGENT_BROWSER_SESSION = previousSession;
  }
}, 30_000);

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
