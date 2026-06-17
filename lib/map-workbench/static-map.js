'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  loadPageModel,
  loadRunConfig,
  readJson,
  reconDir,
  savePageModel,
  staticMapDir,
  writeJson,
} = require('./artifacts');

const STATIC_MAP_SCHEMA_VERSION = 1;
const DEFAULT_OPEN_DELAY_MS = 250;

class StaticMapPrerequisiteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StaticMapPrerequisiteError';
  }
}

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function completedRecon(runDir) {
  const pageStateFile = path.join(reconDir(runDir), 'page-state.json');
  if (!fs.existsSync(pageStateFile)) {
    throw new StaticMapPrerequisiteError('static-map requires completed Recon evidence: 01-recon/page-state.json is missing');
  }
  const pageState = readJson(pageStateFile);
  if (pageState.status !== 'ready') {
    throw new StaticMapPrerequisiteError(`static-map requires completed Recon evidence with ready status; found ${pageState.status || 'unknown'}`);
  }
  return pageState;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  let value = JSON.parse(text);
  if (typeof value === 'string') {
    const inner = value.trim();
    if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
      value = JSON.parse(inner);
    }
  }
  return value;
}

function orderedViewports(config) {
  return Array.isArray(config.viewports) ? config.viewports.slice() : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z0-9]/g, char => char.toUpperCase());
}

function slugify(value, fallback = 'section') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function unstableSelector(value) {
  const selector = String(value || '').trim();
  if (!selector) return true;
  if (/#w-node-/i.test(selector)) return true;
  if (/:nth-child\(/i.test(selector)) return true;
  if (/^body\s*>/i.test(selector)) return true;
  return false;
}

function stableSelector(candidate = {}) {
  const selectors = [candidate.primarySelector, candidate.selector].concat(candidate.selectors || []);
  return selectors.find(selector => !unstableSelector(selector)) || null;
}

function selectorList(candidate = {}) {
  const values = [];
  for (const value of [candidate.primarySelector, candidate.selector].concat(candidate.selectors || [])) {
    if (!value || values.includes(value)) continue;
    values.push(value);
  }
  return values;
}

function candidateKey(candidate = {}, index = 0) {
  return stableSelector(candidate) || cleanText(candidate.semantic && (candidate.semantic.heading || candidate.semantic.ariaLabel)) || `candidate-${index}`;
}

function occurrenceKeys(candidates = []) {
  const counts = new Map();
  return candidates.map((candidate, index) => {
    const base = candidateKey(candidate, index);
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return `${base}::${count}`;
  });
}

function rectOf(candidate = {}) {
  const rect = candidate.rect || {};
  return {
    x: Math.round(Number(rect.x) || 0),
    y: Math.round(Number(rect.y) || 0),
    width: Math.round(Number(rect.width) || 0),
    height: Math.round(Number(rect.height) || 0),
  };
}

function semanticTag(candidate = {}) {
  return cleanText(candidate.semantic && candidate.semantic.tagName).toLowerCase();
}

function isTinyNonRegionCandidate(candidate = {}) {
  const rect = rectOf(candidate);
  const area = rect.width * rect.height;
  const tag = semanticTag(candidate);
  const kind = cleanText(candidate.kind || candidate.kindHint).toLowerCase();
  if (['header', 'footer', 'nav', 'main', 'section', 'article'].includes(tag)) return false;
  if (['sticky', 'overlay'].includes(kind)) return false;
  return rect.height < 32 || rect.width < 32 || area < 2_500;
}

function inferName(candidate = {}, fallbackIndex = 0) {
  const semantic = candidate.semantic || {};
  const tag = semanticTag(candidate);
  if (tag === 'header') return 'Header';
  if (tag === 'footer') return 'Footer';
  if (tag === 'nav') return 'Nav';
  const label = cleanText(semantic.ariaLabel || semantic.heading || semantic.label);
  if (label) return label;
  const text = cleanText(semantic.text);
  if (text) return titleCase(text.split(/\s+/).slice(0, 4).join(' '));
  return `Section ${fallbackIndex + 1}`;
}

function inferKind(candidate = {}, order = 0) {
  const semantic = candidate.semantic || {};
  const explicit = cleanText(candidate.kind || candidate.kindHint).toLowerCase();
  if (explicit) return explicit;
  const tag = semanticTag(candidate);
  const role = cleanText(semantic.role).toLowerCase();
  if (tag === 'header' || role === 'banner') return 'header';
  if (tag === 'footer' || role === 'contentinfo') return 'footer';
  if (tag === 'nav' || role === 'navigation') return 'nav';
  if (Number(semantic.repeatedItemCount || 0) > 1) return 'list';
  if (tag === 'img' || tag === 'picture' || tag === 'video' || role === 'img') return 'media';
  if (order <= 1 && (semantic.heading || semantic.ariaLabel)) return 'hero';
  if (tag === 'section' || tag === 'main' || tag === 'article') return 'section';
  return 'unknown';
}

function uniqueRegionId(name, used) {
  const base = `region-${slugify(name, 'section')}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function groupMeasuredCandidates(measuredByViewport, primaryViewportId) {
  const primary = measuredByViewport[primaryViewportId] || measuredByViewport[Object.keys(measuredByViewport)[0]] || { candidates: [] };
  const primaryCandidates = (primary.candidates || []).filter(candidate => !isTinyNonRegionCandidate(candidate));
  const primaryKeys = occurrenceKeys(primaryCandidates);
  const groups = primaryCandidates.map((candidate, index) => ({
    key: primaryKeys[index],
    primaryCandidate: candidate,
    candidatesByViewport: {
      [primaryViewportId]: candidate,
    },
  }));
  const byKey = new Map(groups.map(group => [group.key, group]));

  for (const [viewportId, measurement] of Object.entries(measuredByViewport)) {
    if (viewportId === primaryViewportId) continue;
    const candidates = (measurement.candidates || []).filter(candidate => !isTinyNonRegionCandidate(candidate));
    const keys = occurrenceKeys(candidates);
    candidates.forEach((candidate, index) => {
      const key = keys[index];
      const group = byKey.get(key);
      if (group) group.candidatesByViewport[viewportId] = candidate;
    });
  }

  return groups.sort((a, b) => rectOf(a.primaryCandidate).y - rectOf(b.primaryCandidate).y);
}

function viewportRegionFacts(candidate) {
  if (!candidate) {
    return {
      presence: 'absent',
      rect: null,
      stacking: null,
      scrollY: null,
      placeholder: null,
      crop: {
        path: null,
        reason: 'candidate was not present in this viewport measurement',
      },
    };
  }
  const rect = rectOf(candidate);
  return {
    presence: 'present',
    rect,
    stacking: candidate.stacking || { zIndex: 'auto' },
    scrollY: Math.round(Number(candidate.scrollY) || 0),
    placeholder: {
      width: rect.width,
      height: rect.height,
    },
    crop: {
      path: null,
      reason: 'crop capture deferred for Static Map Region scaffold slice',
    },
  };
}

function createRegions(config, measuredByViewport) {
  const primaryViewportId = config.primaryViewport || (config.viewports && config.viewports[0] && config.viewports[0].id);
  const groups = groupMeasuredCandidates(measuredByViewport, primaryViewportId);
  const usedIds = new Set();

  return groups.map((group, order) => {
    const primary = group.primaryCandidate;
    const name = inferName(primary, order);
    const selectors = selectorList(primary);
    const primarySelector = stableSelector(primary);
    const viewports = {};
    for (const viewport of config.viewports || []) {
      viewports[viewport.id] = viewportRegionFacts(group.candidatesByViewport[viewport.id]);
    }
    return {
      id: uniqueRegionId(name, usedIds),
      name,
      kind: inferKind(primary, order),
      parentId: null,
      order,
      viewports,
      static: {
        colors: cloneJson(primary.colors || []),
        typography: cloneJson(primary.typography || []),
        assets: cloneJson(primary.assets || []),
        layout: cloneJson(primary.layout || {}),
      },
      source: {
        primarySelector,
        selectors,
        evidence: cloneJson(primary.evidence || []),
      },
      motionCandidates: [],
      unknowns: primarySelector ? [] : [{
        field: 'source.primarySelector',
        reason: 'no stable primary selector was measured for this Region',
      }],
    };
  });
}

function buildMeasurements({ config, measuredByViewport, regions, generatedAt }) {
  const settling = {};
  const viewports = orderedViewports(config).map((viewport) => {
    const measurement = measuredByViewport[viewport.id] || {};
    if (measurement.settling) settling[viewport.id] = cloneJson(measurement.settling);
    return {
      id: viewport.id,
      configured: cloneJson(viewport),
      rawCandidates: cloneJson(measurement.candidates || []),
      regionIds: regions
        .filter(region => region.viewports[viewport.id] && region.viewports[viewport.id].presence === 'present')
        .map(region => region.id),
    };
  });
  return {
    schemaVersion: STATIC_MAP_SCHEMA_VERSION,
    generatedAt,
    targetUrl: config.targetUrl,
    primaryViewport: config.primaryViewport,
    viewports,
    settling,
  };
}

function buildAssertions({ regions, generatedAt }) {
  const assertions = [{
    id: 'static-map-regions-present',
    kind: 'region-scaffold',
    required: true,
    status: regions.length ? 'pass' : 'fail',
    evidence: regions.length ? [`${regions.length} regions created`] : [],
    failure: regions.length ? null : 'Static Map produced no Regions',
  }];

  for (const region of regions) {
    assertions.push({
      id: `static-map-${region.id}-geometry`,
      kind: 'region-geometry',
      required: true,
      status: Object.values(region.viewports).every(viewport => viewport.presence === 'present' && viewport.rect) ? 'pass' : 'fail',
      evidence: Object.entries(region.viewports).map(([viewportId, facts]) => `${viewportId}:${facts.presence}`),
      failure: null,
    });
    assertions.push({
      id: `static-map-${region.id}-placeholder`,
      kind: 'region-placeholder',
      required: true,
      status: Object.values(region.viewports).every(viewport => (
        viewport.placeholder &&
        viewport.rect &&
        viewport.placeholder.width === viewport.rect.width &&
        viewport.placeholder.height === viewport.rect.height
      )) ? 'pass' : 'fail',
      evidence: Object.entries(region.viewports).map(([viewportId, facts]) => `${viewportId}:${facts.placeholder ? `${facts.placeholder.width}x${facts.placeholder.height}` : 'missing'}`),
      failure: null,
    });
  }

  return {
    schemaVersion: STATIC_MAP_SCHEMA_VERSION,
    generatedAt,
    assertions,
  };
}

function buildCoverage({ regions, generatedAt }) {
  const lines = [
    '# Static Map Coverage',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const region of regions) {
    const viewportIds = Object.keys(region.viewports).filter(id => region.viewports[id].presence === 'present');
    const cropReasons = Object.values(region.viewports)
      .map(viewport => viewport.crop && viewport.crop.reason)
      .filter(Boolean);
    lines.push(`| ${region.id} | ${region.name} | required | complete | ${viewportIds.join(', ')} | ${cropReasons[0] || ''} |`);
  }

  if (!regions.length) {
    lines.push('| regions | Region scaffold | required | missing | none | Static Map produced no Regions |');
  }

  lines.push('');
  return lines.join('\n');
}

function updatePageModelForStaticMap(pageModel, regions) {
  const next = cloneJson(pageModel);
  const pages = next.pages && typeof next.pages === 'object' ? next.pages : {};
  const home = pages.home || {};
  home.regions = cloneJson(regions);
  pages.home = home;
  next.pages = pages;
  return next;
}

function createFixtureStaticMapDriver(file) {
  const fixture = readJson(file);
  return {
    calls: [],
    measure(targetUrl, viewport) {
      this.calls.push({ targetUrl, viewport: cloneJson(viewport) });
      const raw = fixture[viewport.id] || fixture.default;
      if (!raw) throw new Error(`No Static Map fixture measurement for viewport "${viewport.id}"`);
      return cloneJson(raw);
    },
  };
}

function staticMapProbeScript() {
  const probeFile = path.join(__dirname, '..', 'probes', 'static-map-probe.js');
  const probeSource = fs.readFileSync(probeFile, 'utf8');
  return `${probeSource}\nwindow.__yoinkitStaticMapProbe();`;
}

function createCaptureBrowserStaticMapDriver(options = {}) {
  const browserBin = options.browserBin || path.join(__dirname, '..', '..', 'bin', 'capture-browser');
  const openDelayMs = options.openDelayMs == null ? DEFAULT_OPEN_DELAY_MS : Number(options.openDelayMs);

  function run(args, maxOutput = 5_000_000) {
    const result = spawnSync(browserBin, args, {
      encoding: 'utf8',
      maxBuffer: maxOutput + 200_000,
    });
    if (result.status !== 0) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
      throw new Error(`Browser command failed: ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
    }
    return result.stdout.trim();
  }

  return {
    measure(targetUrl, viewport) {
      run(['open', targetUrl]);
      run(['set', 'viewport', String(viewport.width), String(viewport.height)]);
      if (openDelayMs > 0) sleepMs(openDelayMs);
      return parseJsonOutput(run(['eval', staticMapProbeScript(), '--max-output', '5000000']));
    },
  };
}

function defaultDriver() {
  return createCaptureBrowserStaticMapDriver();
}

function runStaticMap(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const config = loadRunConfig(absRunDir);
  const pageModel = loadPageModel(absRunDir);
  const pageState = completedRecon(absRunDir);
  const generatedAt = nowIso(env);
  const driver = env.driver || defaultDriver();
  if (!driver || typeof driver.measure !== 'function') {
    throw new Error('static-map requires a measurement driver');
  }

  const measuredByViewport = {};
  for (const viewport of orderedViewports(config)) {
    measuredByViewport[viewport.id] = driver.measure(config.targetUrl, viewport, {
      runDir: absRunDir,
      config,
      pageState,
    }) || {};
  }

  const regions = createRegions(config, measuredByViewport);
  const measurements = buildMeasurements({ config, measuredByViewport, regions, generatedAt });
  const assertions = buildAssertions({ regions, generatedAt });
  const coverage = buildCoverage({ regions, generatedAt });
  const updatedPageModel = updatePageModelForStaticMap(pageModel, regions);
  const dir = staticMapDir(absRunDir);

  writeJson(path.join(dir, 'measurements.json'), measurements);
  writeJson(path.join(dir, 'assertions.json'), assertions);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'coverage.md'), coverage);
  savePageModel(absRunDir, updatedPageModel);

  return {
    status: 'ready',
    generatedAt,
    artifacts: {
      measurements: path.join(dir, 'measurements.json'),
      assertions: path.join(dir, 'assertions.json'),
      coverage: path.join(dir, 'coverage.md'),
    },
    measurements,
    assertions,
    coverage,
    regions,
    pageModel: updatedPageModel,
  };
}

module.exports = {
  STATIC_MAP_SCHEMA_VERSION,
  StaticMapPrerequisiteError,
  completedRecon,
  createRegions,
  createCaptureBrowserStaticMapDriver,
  createFixtureStaticMapDriver,
  runStaticMap,
  staticMapProbeScript,
};
