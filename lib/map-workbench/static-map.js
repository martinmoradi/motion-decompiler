'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
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
const { normalizeAssetPolicy } = require('./config');

const STATIC_MAP_SCHEMA_VERSION = 1;
const DEFAULT_OPEN_DELAY_MS = 250;
const MAX_ASSET_REDIRECTS = 5;
const ALLOWED_ASSET_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.gif',
  '.jpg',
  '.jpeg',
  '.mp4',
  '.png',
  '.svg',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
]);
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

function recoveryForSkippedAsset(source) {
  if (source === 'file') {
    return {
      flag: '--allow-file-assets --file-asset-root <dir>',
    };
  }
  if (source === 'cross-origin') {
    return {
      flag: '--fetch-public-cross-origin-assets',
    };
  }
  return null;
}

function skippedAssetEvidence(asset, reason, required, source, assetPolicy) {
  const blocking = Boolean(assetPolicy.strictSkippedAssets && required);
  return Object.assign({}, cloneJson(asset), {
    path: null,
    status: 'skipped',
    reason,
    required,
    severity: blocking ? 'required' : 'info',
    gateImpact: blocking ? 'blocking' : 'non-blocking',
    recovery: recoveryForSkippedAsset(source),
  });
}

function missingAssetEvidence(asset, reason, required) {
  return Object.assign({}, cloneJson(asset), {
    path: null,
    status: 'missing',
    reason,
    required,
    severity: required ? 'required' : 'info',
    gateImpact: required ? 'blocking' : 'non-blocking',
  });
}

function allowedAssetMagic(bytes) {
  if (!bytes || !bytes.length) return false;
  if (bytes.length >= 8 && bytes.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.slice(0, 6).toString('ascii'))) return true;
  if (bytes.length >= 12 && bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') return true;
  if (bytes.length >= 12 && bytes.slice(4, 8).toString('ascii') === 'ftyp') return true;
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'wOFF') return true;
  if (bytes.length >= 4 && bytes.slice(0, 4).toString('ascii') === 'wOF2') return true;
  return false;
}

function validateFileAsset(parsed, assetPolicy) {
  if (assetPolicy.file.mode !== 'allow' || !assetPolicy.file.root) {
    return {
      action: 'skip',
      source: 'file',
      reason: 'file asset fetch disabled by default',
    };
  }
  let rootReal;
  let fileReal;
  try {
    rootReal = fs.realpathSync(assetPolicy.file.root);
  } catch (error) {
    return {
      action: 'skip',
      source: 'file',
      reason: `trusted file asset root could not be resolved: ${error.message || error}`,
    };
  }
  try {
    fileReal = fs.realpathSync(fileURLToPath(parsed));
  } catch (error) {
    return {
      action: 'skip',
      source: 'file',
      reason: `file asset could not be resolved: ${error.message || error}`,
    };
  }
  const insideRoot = fileReal === rootReal || fileReal.startsWith(`${rootReal}${path.sep}`);
  if (!insideRoot) {
    return {
      action: 'skip',
      source: 'file',
      reason: 'file asset resolves outside trusted root',
    };
  }
  const stat = fs.statSync(fileReal);
  if (!stat.isFile()) {
    return {
      action: 'skip',
      source: 'file',
      reason: 'file asset is not a regular file',
    };
  }
  if (stat.size > assetPolicy.maxBytes) {
    return {
      action: 'skip',
      source: 'file',
      reason: `file asset exceeds maxBytes (${assetPolicy.maxBytes})`,
    };
  }
  const ext = path.extname(fileReal).toLowerCase();
  if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
    const fd = fs.openSync(fileReal, 'r');
    try {
      const head = Buffer.alloc(Math.min(32, stat.size));
      fs.readSync(fd, head, 0, head.length, 0);
      if (!allowedAssetMagic(head)) {
        return {
          action: 'skip',
          source: 'file',
          reason: 'file asset extension and magic bytes are not allowed',
        };
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  return {
    action: 'fetch',
    source: 'file',
    url: parsed.href,
    filePath: fileReal,
  };
}

function ipv4Public(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

function ipIsPublic(ip) {
  const version = net.isIP(ip);
  if (version === 4) return ipv4Public(ip);
  if (version !== 6) return false;
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return false;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return false;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Public(mapped[1]);
  return true;
}

function resolveHostAddresses(hostname, driver) {
  if (driver && typeof driver.resolveAssetHost === 'function') {
    return driver.resolveAssetHost(hostname);
  }
  if (net.isIP(hostname)) return [hostname];
  const result = spawnSync('getent', ['ahosts', hostname], {
    encoding: 'utf8',
    maxBuffer: 200_000,
  });
  if (result.error || result.status !== 0) return [];
  return Array.from(new Set(String(result.stdout || '')
    .split(/\n+/)
    .map(line => line.trim().split(/\s+/)[0])
    .filter(Boolean)));
}

function publicHttpsFetchPlan(parsed, driver) {
  if (parsed.protocol !== 'https:') {
    return {
      action: 'skip',
      source: 'cross-origin',
      reason: 'cross-origin asset must use https to be fetched',
    };
  }
  const addresses = resolveHostAddresses(parsed.hostname, driver);
  if (!addresses.length) {
    return {
      action: 'skip',
      source: 'cross-origin',
      reason: 'cross-origin asset host could not be resolved safely',
    };
  }
  if (addresses.some(address => !ipIsPublic(address))) {
    return {
      action: 'skip',
      source: 'cross-origin',
      reason: 'cross-origin asset host resolved to a private or reserved address',
    };
  }
  return {
    action: 'fetch',
    source: 'cross-origin',
    url: parsed.href,
    validatePublicHttps: true,
  };
}

function assetFetchPlan(asset = {}, targetUrl, assetPolicy, driver) {
  if (!asset.url) return { action: 'missing', reason: 'asset URL was not discoverable' };
  let parsed;
  try {
    parsed = new URL(asset.url, targetUrl);
  } catch (error) {
    return { action: 'missing', reason: 'asset URL was invalid' };
  }
  if (parsed.protocol === 'data:') return { action: 'fetch', source: 'data', url: parsed.href };
  if (parsed.protocol === 'file:') return validateFileAsset(parsed, assetPolicy);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      action: 'skip',
      source: 'other',
      reason: `${parsed.protocol.replace(':', '')} asset fetch skipped`,
    };
  }
  let target;
  try {
    target = new URL(targetUrl);
  } catch (error) {
    return { action: 'missing', reason: 'target URL was unavailable for asset safety check' };
  }
  if (parsed.origin === target.origin) {
    return {
      action: 'fetch',
      source: 'same-origin',
      url: parsed.href,
      validatePublicHttps: false,
    };
  }
  if (assetPolicy.crossOrigin.mode !== 'fetch-public-https') {
    return {
      action: 'skip',
      source: 'cross-origin',
      reason: 'cross-origin asset fetch disabled by default',
    };
  }
  return publicHttpsFetchPlan(parsed, driver);
}

function decodeDataUrl(url) {
  const match = String(url).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('invalid data URL');
  const contentType = match[1] || 'application/octet-stream';
  const encoded = match[3] || '';
  const bytes = match[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded));
  return { bytes, contentType };
}

function parseHttpHeaderBlock(text) {
  const blocks = String(text || '').trim().split(/\r?\n\r?\n/).filter(Boolean);
  const block = blocks[blocks.length - 1] || '';
  const lines = block.split(/\r?\n/);
  const status = Number(((lines.shift() || '').match(/\s(\d{3})\s?/) || [])[1] || 0);
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return { status, headers };
}

function curlOnce(url, maxBytes) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-asset-'));
  const headersFile = path.join(tmpDir, 'headers.txt');
  const bodyFile = path.join(tmpDir, 'body.bin');
  try {
    const result = spawnSync('curl', [
      '--silent',
      '--show-error',
      '--max-time',
      '8',
      '--max-filesize',
      String(maxBytes),
      '--dump-header',
      headersFile,
      '--output',
      bodyFile,
      url,
    ], {
      encoding: 'utf8',
      maxBuffer: 1_000_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
      throw new Error(detail || `curl exited ${result.status}`);
    }
    const parsedHeaders = parseHttpHeaderBlock(fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : '');
    const bytes = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile) : Buffer.alloc(0);
    if (bytes.length > maxBytes) throw new Error(`asset exceeds maxBytes (${maxBytes})`);
    return {
      status: parsedHeaders.status,
      headers: parsedHeaders.headers,
      bytes,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function validatePublicRedirectTarget(url, driver) {
  const parsed = new URL(url);
  const plan = publicHttpsFetchPlan(parsed, driver);
  if (plan.action !== 'fetch') throw new Error(plan.reason);
}

function fetchHttpAsset({ url, maxBytes, validatePublicHttps, driver }) {
  let current = url;
  for (let redirect = 0; redirect <= MAX_ASSET_REDIRECTS; redirect += 1) {
    if (validatePublicHttps) validatePublicRedirectTarget(current, driver);
    const response = curlOnce(current, maxBytes);
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      current = new URL(response.headers.location, current).href;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status || 'unknown'}`);
    }
    return {
      bytes: response.bytes,
      contentType: response.headers['content-type'] || null,
      finalUrl: current,
    };
  }
  throw new Error(`asset exceeded ${MAX_ASSET_REDIRECTS} redirects`);
}

function defaultFetchAsset({ plan, assetPolicy, driver }) {
  if (plan.source === 'data') return decodeDataUrl(plan.url);
  if (plan.source === 'file') return { bytes: fs.readFileSync(plan.filePath), contentType: null, finalUrl: plan.url };
  return fetchHttpAsset({
    url: plan.url,
    maxBytes: assetPolicy.maxBytes,
    validatePublicHttps: Boolean(plan.validatePublicHttps),
    driver,
  });
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

function enrichRegionAssets({ runDir, targetUrl, driver, assetPolicy, regions }) {
  for (const region of regions) {
    const assets = Array.isArray(region.static && region.static.assets) ? region.static.assets : [];
    const usedNames = new Set();
    region.static.assets = assets.map((asset, index) => {
      const required = assetRequired(asset);
      const plan = assetFetchPlan(asset, targetUrl, assetPolicy, driver);
      if (plan.action === 'missing') return missingAssetEvidence(asset, plan.reason, required);
      if (plan.action === 'skip') return skippedAssetEvidence(asset, plan.reason, required, plan.source, assetPolicy);

      try {
        const fetched = driver && typeof driver.fetchAsset === 'function'
          ? driver.fetchAsset({
            url: plan.url,
            plan: cloneJson(plan),
            targetUrl,
            asset: cloneJson(asset),
            assetPolicy: cloneJson(assetPolicy),
            region: cloneJson(region),
            runDir,
          }) || {}
          : defaultFetchAsset({
            plan,
            assetPolicy,
            driver,
          }) || {};
        const bytes = Buffer.isBuffer(fetched.bytes) ? fetched.bytes : Buffer.from(fetched.bytes || []);
        if (!bytes.length) throw new Error('asset fetch returned no bytes');
        const contentType = fetched.contentType || asset.contentType || null;
        const finalUrl = fetched.finalUrl || plan.url;
        const outputFile = uniqueAssetPath(runDir, region.id, asset, finalUrl, index, contentType, usedNames);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, bytes);
        return Object.assign({}, cloneJson(asset), {
          url: plan.url,
          originalUrl: asset.url || null,
          finalUrl,
          path: runRelativePath(runDir, outputFile),
          status: 'fetched',
          contentType,
          bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          dimensions: imageDimensions(bytes, contentType, asset),
          required,
          severity: required ? 'required' : 'info',
          gateImpact: 'satisfied',
        });
      } catch (error) {
        return missingAssetEvidence(asset, `asset fetch failed: ${error.message || error}`, required);
      }
    });
  }
  return regions;
}

function applyCropEvidence({ facts, selector, outputFile, relativePath, result }) {
  if (!fs.existsSync(outputFile)) throw new Error('crop driver did not write an image');
  const bytes = fs.statSync(outputFile).size;
  if (bytes <= 0) throw new Error('crop image was empty');
  facts.crop = {
    path: relativePath,
    width: Math.round(Number(result && result.width) || (facts.rect && facts.rect.width) || 0),
    height: Math.round(Number(result && result.height) || (facts.rect && facts.rect.height) || 0),
    bytes,
    selector,
    method: (result && result.method) || 'browser-selector-screenshot',
  };
}

function enrichRegionCrops({ runDir, targetUrl, config, driver, regions }) {
  const requestsByViewport = new Map();

  for (const region of regions) {
    for (const viewport of configuredViewports(config)) {
      const facts = region.viewports[viewport.id];
      if (!facts || facts.presence !== 'present') continue;

      const selector = region.source && region.source.primarySelector;
      if (!selector) {
        facts.crop = failedEvidence('no stable primary selector is available for crop capture');
        continue;
      }
      const hasSingleCrop = driver && typeof driver.captureRegionCrop === 'function';
      const hasBatchCrops = driver && typeof driver.captureRegionCrops === 'function';
      if (!hasSingleCrop && !hasBatchCrops) {
        facts.crop = failedEvidence('crop capture driver is unavailable');
        continue;
      }

      const outputFile = cropPathFor(runDir, viewport.id, region.id);
      const relativePath = runRelativePath(runDir, outputFile);
      const request = {
        targetUrl,
        viewport: cloneJson(viewport),
        selector,
        outputFile,
        relativePath,
        region: cloneJson(region),
        facts,
        runDir,
      };
      if (!requestsByViewport.has(viewport.id)) requestsByViewport.set(viewport.id, []);
      requestsByViewport.get(viewport.id).push(request);
    }
  }

  for (const requests of requestsByViewport.values()) {
    if (driver && typeof driver.captureRegionCrops === 'function') {
      const viewport = requests[0].viewport;
      try {
        requests.forEach(request => fs.mkdirSync(path.dirname(request.outputFile), { recursive: true }));
        const results = driver.captureRegionCrops({
          targetUrl,
          viewport,
          crops: requests.map(request => ({
            selector: request.selector,
            outputFile: request.outputFile,
            relativePath: request.relativePath,
            region: request.region,
            runDir,
          })),
        }) || [];
        requests.forEach((request, index) => {
          try {
            const result = Array.isArray(results)
              ? results[index]
              : results[request.relativePath] || results[request.region.id] || {};
            applyCropEvidence({
              facts: request.facts,
              selector: request.selector,
              outputFile: request.outputFile,
              relativePath: request.relativePath,
              result,
            });
          } catch (error) {
            request.facts.crop = failedEvidence(`crop capture failed: ${error.message || error}`);
          }
        });
      } catch (error) {
        requests.forEach((request) => {
          request.facts.crop = failedEvidence(`crop capture failed: ${error.message || error}`);
        });
      }
      continue;
    }

    for (const request of requests) {
      try {
        fs.mkdirSync(path.dirname(request.outputFile), { recursive: true });
        const result = driver.captureRegionCrop({
          targetUrl,
          viewport: request.viewport,
          selector: request.selector,
          outputFile: request.outputFile,
          relativePath: request.relativePath,
          region: request.region,
          runDir,
        }) || {};
        applyCropEvidence({
          facts: request.facts,
          selector: request.selector,
          outputFile: request.outputFile,
          relativePath: request.relativePath,
          result,
        });
      } catch (error) {
        request.facts.crop = failedEvidence(`crop capture failed: ${error.message || error}`);
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
    const missingRequiredAssets = requiredAssets.filter(asset => asset.gateImpact === 'blocking');
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

function skippedAssetsForRegions(regions) {
  const skipped = [];
  for (const region of regions) {
    for (const asset of (region.static && region.static.assets) || []) {
      if (asset.status !== 'skipped') continue;
      skipped.push({
        regionId: region.id,
        selector: asset.selector || asset.url || asset.kind || 'asset',
        reason: asset.reason,
        gateImpact: asset.gateImpact || 'non-blocking',
        recovery: asset.recovery || null,
      });
    }
  }
  return skipped;
}

function staticMapSummary(regions) {
  const skippedAssets = skippedAssetsForRegions(regions);
  const skipped = {
    total: skippedAssets.length,
    file: skippedAssets.filter(asset => /file asset/i.test(asset.reason || '')).length,
    crossOrigin: skippedAssets.filter(asset => /cross-origin/i.test(asset.reason || '')).length,
    other: skippedAssets.filter(asset => !/file asset|cross-origin/i.test(asset.reason || '')).length,
  };
  const cropFacts = regions.flatMap(region => Object.values(region.viewports || {}).filter(viewport => viewport.presence === 'present'));
  const crops = {
    present: cropFacts.length,
    captured: cropFacts.filter(viewport => viewport.crop && viewport.crop.path).length,
    missing: cropFacts.filter(viewport => !viewport.crop || !viewport.crop.path).length,
  };
  return {
    skippedAssets: skipped,
    crops,
  };
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
    lines.push(`| ${coverageCell(region.id)} | ${coverageCell(region.name)} | required | ${coverageCell(assertionStatus.status)} | ${coverageCell(viewportIds.join(', '))} | ${coverageCell(reason)} |`);
  }

  if (!regions.length) {
    lines.push('| regions | Region scaffold | required | missing | none | Static Map produced no Regions |');
  }

  for (const assertion of assertions) {
    lines.push(`| ${coverageCell(assertion.kind)} | ${coverageCell(assertion.id)} | ${coverageRequired(assertion.required)} | ${coverageStatus(assertion.status)} | ${coverageCell((assertion.evidence || []).join('; '))} | ${coverageCell(assertion.failure || '')} |`);
  }

  const skippedAssets = skippedAssetsForRegions(regions);
  if (skippedAssets.length) {
    lines.push('');
    lines.push('## Skipped Assets');
    lines.push('');
    lines.push('| Region | Asset | Gate Impact | Reason | Recovery |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const asset of skippedAssets) {
      lines.push(`| ${coverageCell(asset.regionId)} | ${coverageCell(asset.selector)} | ${coverageCell(asset.gateImpact)} | ${coverageCell(asset.reason)} | ${coverageCell(asset.recovery && asset.recovery.flag)} |`);
    }
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

function usableStageUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (error) {
    return null;
  }
  return null;
}

function staticMapTargetUrl(config, pageState) {
  const primaryRecord = pageState && Array.isArray(pageState.viewports)
    ? pageState.viewports.find(record => record.viewportId === config.primaryViewport) || pageState.viewports[0]
    : null;
  return [
    pageState && pageState.source && pageState.source.effectiveUrl,
    pageState && pageState.effectiveUrl,
    primaryRecord && primaryRecord.effectiveUrl,
    pageState && pageState.source && pageState.source.finalUrl,
    pageState && pageState.finalUrl,
    primaryRecord && primaryRecord.finalUrl,
    primaryRecord && primaryRecord.requestedUrl,
    config.targetUrl,
  ].map(usableStageUrl).find(Boolean) || config.targetUrl;
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
    captureRegionCrops({ targetUrl, viewport, crops }) {
      run(['open', targetUrl]);
      run(['set', 'viewport', String(viewport.width), String(viewport.height)]);
      if (openDelayMs > 0) sleepMs(openDelayMs);
      return (crops || []).map((crop) => {
        run(['screenshot', crop.selector, crop.outputFile]);
        return {
          method: 'agent-browser-selector-screenshot',
        };
      });
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
  const assetPolicy = normalizeAssetPolicy(config.yoink && config.yoink.assets);

  const measuredByViewport = {};
  const targetUrl = staticMapTargetUrl(config, pageState);
  for (const viewport of configuredViewports(config)) {
    measuredByViewport[viewport.id] = driver.measure(targetUrl, viewport, {
      runDir: absRunDir,
      config,
      pageState,
    }) || {};
  }

  let regions = createRegions(config, measuredByViewport);
  regions = enrichRegionCrops({
    runDir: absRunDir,
    targetUrl,
    config,
    driver,
    regions,
  });
  regions = enrichRegionTypography(regions);
  regions = enrichRegionAssets({
    runDir: absRunDir,
    targetUrl,
    driver,
    assetPolicy,
    regions,
  });
  const measurements = buildMeasurements({ config, measuredByViewport, regions, generatedAt });
  const assertions = buildAssertions({ regions, generatedAt });
  const coverage = buildCoverage({ regions, assertions: assertions.assertions, generatedAt });
  const updatedPageModel = updatePageModelForStaticMap(pageModel, regions);
  const dir = staticMapDir(absRunDir);
  const summary = staticMapSummary(regions);

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
    summary,
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
