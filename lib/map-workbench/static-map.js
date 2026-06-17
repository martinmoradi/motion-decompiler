'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fileURLToPath } = require('url');
const { spawnSync } = require('child_process');

const {
  loadPageModel,
  loadRunConfig,
  readJson,
  reconDir,
  savePageModel,
  staticMapDir,
  writeJson,
  writeText,
} = require('./artifacts');

const STATIC_MAP_SCHEMA_VERSION = 1;
const DEFAULT_OPEN_DELAY_MS = 250;
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lTO+8QAAAABJRU5ErkJggg==',
  'base64'
);

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

function configuredViewports(config) {
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
  if (/:nth-of-type\(/i.test(selector)) return true;
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

function structuralRank(candidate = {}) {
  const tag = semanticTag(candidate);
  const role = cleanText(candidate.semantic && candidate.semantic.role).toLowerCase();
  if (tag === 'section' || tag === 'article') return 5;
  if (tag === 'header' || tag === 'footer' || tag === 'nav') return 4;
  if (role === 'banner' || role === 'contentinfo' || role === 'navigation') return 4;
  if (tag === 'main' || role === 'main') return 2;
  return 3;
}

function overlapRatio(a, b) {
  const ar = rectOf(a);
  const br = rectOf(b);
  const left = Math.max(ar.x, br.x);
  const right = Math.min(ar.x + ar.width, br.x + br.width);
  const top = Math.max(ar.y, br.y);
  const bottom = Math.min(ar.y + ar.height, br.y + br.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const smallerArea = Math.max(1, Math.min(ar.width * ar.height, br.width * br.height));
  return intersection / smallerArea;
}

function mergeCandidateEvidence(base, duplicate) {
  const merged = cloneJson(base);
  const baseSelectors = selectorList(base);
  merged.selectors = baseSelectors.concat(selectorList(duplicate).filter(selector => !baseSelectors.includes(selector)));
  merged.evidence = cloneJson(base.evidence || []).concat(cloneJson(duplicate.evidence || []));
  return merged;
}

function collapseOverlappingStructuralCandidates(candidates = []) {
  const sorted = candidates.slice().sort((a, b) => {
    const ay = rectOf(a).y;
    const by = rectOf(b).y;
    if (ay !== by) return ay - by;
    return structuralRank(b) - structuralRank(a);
  });
  const kept = [];

  for (const candidate of sorted) {
    const duplicateIndex = kept.findIndex(existing => overlapRatio(existing, candidate) >= 0.9);
    if (duplicateIndex === -1) {
      kept.push(candidate);
      continue;
    }

    const existing = kept[duplicateIndex];
    const preferred = structuralRank(candidate) > structuralRank(existing) ? candidate : existing;
    const secondary = preferred === candidate ? existing : candidate;
    kept[duplicateIndex] = mergeCandidateEvidence(preferred, secondary);
  }

  return kept.sort((a, b) => rectOf(a).y - rectOf(b).y);
}

function regionCandidates(candidates = []) {
  // Tiny fragments stay in raw measurements, but do not become standalone
  // Regions in the v0 page outline.
  return collapseOverlappingStructuralCandidates(
    candidates.filter(candidate => !isTinyNonRegionCandidate(candidate))
  );
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
  const entries = Object.entries(measuredByViewport);
  const viewportOrder = new Map(entries.map(([viewportId], index) => [viewportId, index]));
  const groups = [];
  const byKey = new Map();

  for (const [viewportId, measurement] of entries) {
    const candidates = regionCandidates(measurement.candidates || []);
    const keys = occurrenceKeys(candidates);
    candidates.forEach((candidate, index) => {
      const key = keys[index];
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          primaryCandidate: null,
          fallbackCandidate: candidate,
          firstViewportId: viewportId,
          candidatesByViewport: {},
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.candidatesByViewport[viewportId] = candidate;
      if (viewportId === primaryViewportId) group.primaryCandidate = candidate;
      if (!group.fallbackCandidate) group.fallbackCandidate = candidate;
    });
  }

  for (const group of groups) {
    if (!group.primaryCandidate) group.primaryCandidate = group.fallbackCandidate;
  }

  function orderValue(group) {
    const primaryCandidate = group.candidatesByViewport[primaryViewportId];
    if (primaryCandidate) return rectOf(primaryCandidate).y;
    return rectOf(group.fallbackCandidate).y;
  }

  return groups.sort((a, b) => {
    const aPrimary = a.candidatesByViewport[primaryViewportId] ? 0 : 1;
    const bPrimary = b.candidatesByViewport[primaryViewportId] ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    const ay = orderValue(a);
    const by = orderValue(b);
    if (ay !== by) return ay - by;
    const av = viewportOrder.get(a.firstViewportId) || 0;
    const bv = viewportOrder.get(b.firstViewportId) || 0;
    if (av !== bv) return av - bv;
    return String(a.key).localeCompare(String(b.key));
  });
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
  const viewports = configuredViewports(config).map((viewport) => {
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

function runRelativePath(runDir, file) {
  return path.relative(runDir, file).split(path.sep).join('/');
}

function cropPathFor(runDir, viewportId, regionId) {
  return path.join(staticMapDir(runDir), 'crops', slugify(viewportId, 'viewport'), `${slugify(regionId, 'region')}.png`);
}

function failedEvidence(reason) {
  return {
    path: null,
    reason,
  };
}

function assetRequired(asset = {}) {
  if (asset.required === false) return false;
  const role = cleanText(asset.role || asset.purpose || asset.context).toLowerCase();
  if (['decorative', 'vendor', 'analytics', 'tracking', 'offscreen', 'crop-covered'].includes(role)) return false;
  if (asset.vendor || asset.decorative || asset.offscreen || asset.coveredByCrop || asset.cropCovered) return false;
  return true;
}

function safeAssetFetch(url, targetUrl) {
  if (!url) return { ok: false, reason: 'asset URL was not discoverable' };
  let parsed;
  try {
    parsed = new URL(url, targetUrl);
  } catch (error) {
    return { ok: false, reason: 'asset URL was invalid' };
  }
  if (parsed.protocol === 'data:' || parsed.protocol === 'file:') return { ok: true, url: parsed.href };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `${parsed.protocol.replace(':', '')} asset fetch skipped` };
  }
  let target;
  try {
    target = new URL(targetUrl);
  } catch (error) {
    return { ok: false, reason: 'target URL was unavailable for asset safety check' };
  }
  if (parsed.origin !== target.origin) return { ok: false, reason: 'cross-origin asset fetch skipped' };
  return { ok: true, url: parsed.href };
}

function decodeDataUrl(url) {
  const match = String(url).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('invalid data URL');
  const contentType = match[1] || 'application/octet-stream';
  const encoded = match[3] || '';
  const bytes = match[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded));
  return { bytes, contentType };
}

function defaultFetchAsset({ url }) {
  const parsed = new URL(url);
  if (parsed.protocol === 'data:') return decodeDataUrl(url);
  if (parsed.protocol === 'file:') return { bytes: fs.readFileSync(fileURLToPath(parsed)), contentType: null };
  const result = spawnSync('curl', ['--silent', '--show-error', '--location', '--fail', '--max-time', '8', url], {
    encoding: null,
    maxBuffer: 10_000_000,
  });
  if (result.status !== 0) {
    const detail = Buffer.concat([result.stderr || Buffer.alloc(0), result.stdout || Buffer.alloc(0)]).toString('utf8').trim();
    throw new Error(detail || `curl exited ${result.status}`);
  }
  return { bytes: result.stdout || Buffer.alloc(0), contentType: null };
}

function extensionForAsset(asset = {}, url, contentType) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    if (ext) return ext.toLowerCase();
  } catch (error) {
    // Fall through to content type.
  }
  const byContentType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
  };
  const normalized = String(contentType || asset.contentType || '').split(';')[0].trim().toLowerCase();
  return byContentType[normalized] || '.bin';
}

function baseNameForAsset(asset = {}, url, index, contentType) {
  let base = cleanText(asset.name || asset.alt || asset.kind || `asset-${index + 1}`);
  try {
    const parsed = new URL(url);
    const parsedBase = parsed.protocol === 'data:' ? '' : path.basename(parsed.pathname);
    if (parsedBase) base = parsedBase.replace(path.extname(parsedBase), '');
  } catch (error) {
    // Use the fallback base above.
  }
  return `${slugify(base, `asset-${index + 1}`)}${extensionForAsset(asset, url, contentType)}`;
}

function uniqueAssetPath(runDir, regionId, asset, url, index, contentType, used) {
  const fileName = baseNameForAsset(asset, url, index, contentType);
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  let candidate = fileName;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${suffix}${ext}`;
    suffix += 1;
  }
  used.add(candidate);
  return path.join(staticMapDir(runDir), 'assets', slugify(regionId, 'region'), candidate);
}

function imageDimensions(bytes, contentType, asset = {}) {
  if (asset.intrinsic && asset.intrinsic.width && asset.intrinsic.height) {
    return {
      width: Math.round(Number(asset.intrinsic.width)),
      height: Math.round(Number(asset.intrinsic.height)),
    };
  }
  if (asset.dimensions && asset.dimensions.width && asset.dimensions.height) {
    return {
      width: Math.round(Number(asset.dimensions.width)),
      height: Math.round(Number(asset.dimensions.height)),
    };
  }
  const type = String(contentType || asset.contentType || '').split(';')[0].trim().toLowerCase();
  if ((type === 'image/png' || bytes.slice(1, 4).toString('ascii') === 'PNG') && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return null;
}

function missingAssetEvidence(asset, reason, required) {
  return Object.assign({}, cloneJson(asset), {
    path: null,
    status: 'missing',
    reason,
    required,
    severity: required ? 'required' : 'info',
  });
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function typographySourceHints(entry = {}, missing) {
  const sourceHints = entry.sourceHints || {};
  const stylesheetHrefs = uniqueStrings([]
    .concat(sourceHints.stylesheetHrefs || [])
    .concat(sourceHints.stylesheets || [])
    .concat(entry.stylesheetHref || [])
    .concat(entry.stylesheetHrefs || []));
  const fontUrls = uniqueStrings([]
    .concat(sourceHints.fontUrls || [])
    .concat(sourceHints.fontUrl || [])
    .concat(entry.fontUrl || [])
    .concat(entry.fontUrls || []));
  if (!stylesheetHrefs.length && !fontUrls.length) {
    const reason = 'no source stylesheet or font URL hints were discoverable';
    missing.push({ field: 'sourceHints', reason });
    return {
      stylesheetHrefs,
      fontUrls,
      reason,
    };
  }
  return {
    stylesheetHrefs,
    fontUrls,
  };
}

function typographyValue(entry, field, label, missing) {
  const value = cleanText(entry[field]);
  if (value) return value;
  missing.push({ field, reason: `${label} was not measured` });
  return null;
}

function normalizeTypographyEntry(entry = {}) {
  const missing = [];
  return {
    selector: entry.selector || null,
    sampleText: cleanText(entry.sampleText || entry.text) || null,
    fontFamily: typographyValue(entry, 'fontFamily', 'font family', missing),
    fontSize: typographyValue(entry, 'fontSize', 'font size', missing),
    fontWeight: typographyValue(entry, 'fontWeight', 'font weight', missing),
    lineHeight: typographyValue(entry, 'lineHeight', 'line-height', missing),
    letterSpacing: typographyValue(entry, 'letterSpacing', 'letter spacing', missing),
    sourceHints: typographySourceHints(entry, missing),
    missing,
  };
}

function enrichRegionTypography(regions) {
  for (const region of regions) {
    const typography = Array.isArray(region.static && region.static.typography)
      ? region.static.typography
      : [];
    region.static.typography = typography.map(normalizeTypographyEntry);
  }
  return regions;
}

function enrichRegionAssets({ runDir, targetUrl, driver, regions }) {
  const fetchAsset = driver && typeof driver.fetchAsset === 'function'
    ? driver.fetchAsset.bind(driver)
    : defaultFetchAsset;

  for (const region of regions) {
    const assets = Array.isArray(region.static && region.static.assets) ? region.static.assets : [];
    const usedNames = new Set();
    region.static.assets = assets.map((asset, index) => {
      const required = assetRequired(asset);
      const safety = safeAssetFetch(asset.url, targetUrl);
      if (!safety.ok) return missingAssetEvidence(asset, safety.reason, required);

      try {
        const fetched = fetchAsset({
          url: safety.url,
          targetUrl,
          asset: cloneJson(asset),
          region: cloneJson(region),
          runDir,
        }) || {};
        const bytes = Buffer.isBuffer(fetched.bytes) ? fetched.bytes : Buffer.from(fetched.bytes || []);
        if (!bytes.length) throw new Error('asset fetch returned no bytes');
        const contentType = fetched.contentType || asset.contentType || null;
        const outputFile = uniqueAssetPath(runDir, region.id, asset, safety.url, index, contentType, usedNames);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, bytes);
        return Object.assign({}, cloneJson(asset), {
          url: safety.url,
          path: runRelativePath(runDir, outputFile),
          status: 'fetched',
          contentType,
          bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          dimensions: imageDimensions(bytes, contentType, asset),
          required,
          severity: required ? 'required' : 'info',
        });
      } catch (error) {
        return missingAssetEvidence(asset, `asset fetch failed: ${error.message || error}`, required);
      }
    });
  }
  return regions;
}

function enrichRegionCrops({ runDir, targetUrl, config, driver, regions }) {
  for (const region of regions) {
    for (const viewport of configuredViewports(config)) {
      const facts = region.viewports[viewport.id];
      if (!facts || facts.presence !== 'present') continue;

      const selector = region.source && region.source.primarySelector;
      if (!selector) {
        facts.crop = failedEvidence('no stable primary selector is available for crop capture');
        continue;
      }
      if (!driver || typeof driver.captureRegionCrop !== 'function') {
        facts.crop = failedEvidence('crop capture driver is unavailable');
        continue;
      }

      const outputFile = cropPathFor(runDir, viewport.id, region.id);
      const relativePath = runRelativePath(runDir, outputFile);
      try {
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        const result = driver.captureRegionCrop({
          targetUrl,
          viewport: cloneJson(viewport),
          selector,
          outputFile,
          relativePath,
          region: cloneJson(region),
          runDir,
        }) || {};
        if (!fs.existsSync(outputFile)) throw new Error('crop driver did not write an image');
        const bytes = fs.statSync(outputFile).size;
        if (bytes <= 0) throw new Error('crop image was empty');
        facts.crop = {
          path: relativePath,
          width: Math.round(Number(result.width) || (facts.rect && facts.rect.width) || 0),
          height: Math.round(Number(result.height) || (facts.rect && facts.rect.height) || 0),
          bytes,
          selector,
          method: result.method || 'browser-selector-screenshot',
        };
      } catch (error) {
        facts.crop = failedEvidence(`crop capture failed: ${error.message || error}`);
      }
    }
  }
  return regions;
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
    const presentViewports = Object.values(region.viewports).filter(viewport => viewport.presence === 'present');
    const presentGeometryOk = presentViewports.every(viewport => viewport.rect);
    const presentPlaceholderOk = presentViewports.every(viewport => (
      viewport.placeholder &&
      viewport.rect &&
      viewport.placeholder.width === viewport.rect.width &&
      viewport.placeholder.height === viewport.rect.height
    ));
    assertions.push({
      id: `static-map-${region.id}-geometry`,
      kind: 'region-geometry',
      required: true,
      status: presentViewports.length && presentGeometryOk ? 'pass' : 'fail',
      evidence: Object.entries(region.viewports).map(([viewportId, facts]) => `${viewportId}:${facts.presence}`),
      failure: presentViewports.length ? null : 'Region is absent in every measured viewport',
    });
    assertions.push({
      id: `static-map-${region.id}-placeholder`,
      kind: 'region-placeholder',
      required: true,
      status: presentViewports.length && presentPlaceholderOk ? 'pass' : 'fail',
      evidence: Object.entries(region.viewports).map(([viewportId, facts]) => `${viewportId}:${facts.placeholder ? `${facts.placeholder.width}x${facts.placeholder.height}` : 'missing'}`),
      failure: presentViewports.length ? null : 'Region is absent in every measured viewport',
    });

    const cropFailures = [];
    for (const [viewportId, facts] of Object.entries(region.viewports)) {
      if (facts.presence !== 'present') continue;
      const cropOk = facts.crop && facts.crop.path;
      if (!cropOk) cropFailures.push(`${viewportId}: ${facts.crop && facts.crop.reason ? facts.crop.reason : 'crop path missing'}`);
      assertions.push({
        id: `static-map-${region.id}-${viewportId}-crop`,
        kind: 'region-crop',
        required: true,
        status: cropOk ? 'pass' : 'fail',
        evidence: [cropOk ? facts.crop.path : `${viewportId}: ${facts.crop && facts.crop.reason ? facts.crop.reason : 'crop path missing'}`],
        failure: cropOk ? null : (facts.crop && facts.crop.reason) || 'crop path missing',
      });
    }

    const assets = Array.isArray(region.static && region.static.assets) ? region.static.assets : [];
    const requiredAssets = assets.filter(asset => asset.required !== false);
    const missingRequiredAssets = requiredAssets.filter(asset => asset.status === 'missing' || !asset.path);
    assertions.push({
      id: `static-map-${region.id}-assets`,
      kind: 'region-assets',
      required: true,
      status: missingRequiredAssets.length ? 'fail' : 'pass',
      evidence: assets.length
        ? assets.map(asset => `${asset.selector || asset.url || asset.kind || 'asset'}:${asset.status || 'unprocessed'}${asset.severity ? `:${asset.severity}` : ''}`)
        : ['no asset evidence discovered for this Region'],
      failure: missingRequiredAssets.length
        ? `${missingRequiredAssets.length} required asset ${missingRequiredAssets.length === 1 ? 'is' : 'are'} missing`
        : null,
    });

    const typography = Array.isArray(region.static && region.static.typography) ? region.static.typography : [];
    const typographyMissing = typography.flatMap(entry => (entry.missing || [])
      .filter(missing => missing.field !== 'sourceHints')
      .map(missing => `${entry.selector || 'typography'}:${missing.field}`));
    assertions.push({
      id: `static-map-${region.id}-typography`,
      kind: 'region-typography',
      required: true,
      status: typographyMissing.length ? 'fail' : 'pass',
      evidence: typography.length
        ? typography.map(entry => `${entry.selector || 'typography'}:${entry.fontFamily || 'unknown font'}:${entry.fontSize || 'unknown size'}`)
        : ['no typography evidence discovered for this Region'],
      failure: typographyMissing.length ? `typography evidence missing ${typographyMissing.join(', ')}` : null,
    });

    assertions.push({
      id: `static-map-${region.id}-unknowns`,
      kind: 'region-unknowns',
      required: false,
      status: region.unknowns && region.unknowns.length ? 'info' : 'pass',
      evidence: region.unknowns && region.unknowns.length
        ? region.unknowns.map(unknown => `${unknown.field}: ${unknown.reason}`)
        : ['no unknown Static Map facts recorded for this Region'],
      failure: null,
    });

    const completenessFailures = []
      .concat(cropFailures.map(failure => `crop ${failure}`))
      .concat(missingRequiredAssets.map(asset => `asset ${asset.selector || asset.url || 'unknown'}: ${asset.reason || 'missing'}`))
      .concat(typographyMissing.map(failure => `typography ${failure}`));
    assertions.push({
      id: `static-map-${region.id}-evidence-completeness`,
      kind: 'region-evidence-completeness',
      required: true,
      status: completenessFailures.length ? 'fail' : 'pass',
      evidence: [
        `crops:${cropFailures.length ? 'missing' : 'complete'}`,
        `assets:${missingRequiredAssets.length ? 'missing' : 'complete'}`,
        `typography:${typographyMissing.length ? 'missing' : 'complete'}`,
        `unknowns:${region.unknowns && region.unknowns.length ? 'recorded' : 'none'}`,
      ],
      failure: completenessFailures.length ? completenessFailures.join('; ') : null,
    });
  }

  return {
    schemaVersion: STATIC_MAP_SCHEMA_VERSION,
    generatedAt,
    assertions,
  };
}

function regionAssertionStatus(assertions, regionId) {
  const rows = assertions.filter(assertion => assertion.id.startsWith(`static-map-${regionId}-`));
  if (!rows.length) return { status: 'missing', reason: 'no assertion rows were generated for this Region' };
  const failed = rows.filter(assertion => assertion.required !== false && assertion.status !== 'pass');
  if (!failed.length) return { status: 'complete', reason: '' };
  return {
    status: 'missing',
    reason: failed.map(assertion => assertion.failure || assertion.id).filter(Boolean).join('; '),
  };
}

function coverageStatus(status) {
  if (status === 'pass') return 'complete';
  if (status === 'info') return 'info';
  return 'missing';
}

function coverageRequired(required) {
  return required === false ? 'info' : 'required';
}

function coverageCell(value) {
  return String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCoverage({ regions, assertions, generatedAt }) {
  const lines = [
    '# Static Map Coverage',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Area | Name | Required | Status | Evidence | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const region of regions) {
    const assertionStatus = regionAssertionStatus(assertions, region.id);
    const viewportIds = Object.keys(region.viewports).filter(id => region.viewports[id].presence === 'present');
    const cropReasons = Object.values(region.viewports)
      .map(viewport => viewport.crop && viewport.crop.reason)
      .filter(Boolean);
    const reason = assertionStatus.reason || cropReasons[0] || '';
    lines.push(`| ${region.id} | ${region.name} | required | ${assertionStatus.status} | ${viewportIds.join(', ')} | ${reason} |`);
  }

  if (!regions.length) {
    lines.push('| regions | Region scaffold | required | missing | none | Static Map produced no Regions |');
  }

  for (const assertion of assertions) {
    lines.push(`| ${coverageCell(assertion.kind)} | ${coverageCell(assertion.id)} | ${coverageRequired(assertion.required)} | ${coverageStatus(assertion.status)} | ${coverageCell((assertion.evidence || []).join('; '))} | ${coverageCell(assertion.failure || '')} |`);
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

function staticMapTargetUrl(config, pageState) {
  const primaryRecord = pageState && Array.isArray(pageState.viewports)
    ? pageState.viewports.find(record => record.viewportId === config.primaryViewport) || pageState.viewports[0]
    : null;
  return (pageState && pageState.source && pageState.source.effectiveUrl) ||
    (pageState && pageState.effectiveUrl) ||
    (primaryRecord && primaryRecord.effectiveUrl) ||
    config.targetUrl;
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
    captureRegionCrop({ outputFile }) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, TINY_PNG);
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
    captureRegionCrop({ targetUrl, viewport, selector, outputFile }) {
      run(['open', targetUrl]);
      run(['set', 'viewport', String(viewport.width), String(viewport.height)]);
      if (openDelayMs > 0) sleepMs(openDelayMs);
      run(['screenshot', selector, outputFile]);
      return {
        method: 'agent-browser-selector-screenshot',
      };
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
  const targetUrl = staticMapTargetUrl(config, pageState);
  for (const viewport of configuredViewports(config)) {
    measuredByViewport[viewport.id] = driver.measure(targetUrl, viewport, {
      runDir: absRunDir,
      config,
      pageState,
    }) || {};
  }

  const regions = enrichRegionAssets({
    runDir: absRunDir,
    targetUrl,
    driver,
    regions: enrichRegionTypography(enrichRegionCrops({
      runDir: absRunDir,
      targetUrl,
      config,
      driver,
      regions: createRegions(config, measuredByViewport),
    })),
  });
  const measurements = buildMeasurements({ config, measuredByViewport, regions, generatedAt });
  const assertions = buildAssertions({ regions, generatedAt });
  const coverage = buildCoverage({ regions, assertions: assertions.assertions, generatedAt });
  const updatedPageModel = updatePageModelForStaticMap(pageModel, regions);
  const dir = staticMapDir(absRunDir);

  writeJson(path.join(dir, 'measurements.json'), measurements);
  writeJson(path.join(dir, 'assertions.json'), assertions);
  writeText(path.join(dir, 'coverage.md'), coverage);
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
  staticMapTargetUrl,
  staticMapProbeScript,
};
