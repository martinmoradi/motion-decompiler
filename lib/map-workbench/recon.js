'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const {
  loadPageModel,
  loadRunConfig,
  readJson,
  reconDir,
  savePageModel,
  writeJson,
} = require('./artifacts');

const RECON_SCHEMA_VERSION = 1;
const DEFAULT_READY_TIMEOUT_MS = 8_000;
const DEFAULT_READY_STABLE_MS = 500;
const DEFAULT_OPEN_DELAY_MS = 250;
const REAL_BLOCKER_TYPES = new Set([
  'access-denied',
  'browser-error',
  'challenge',
  'cross-origin-iframe',
  'rate-limit',
]);

class ReconBlockedError extends Error {
  constructor(result) {
    const summary = result.blockers
      .map(blocker => `${blocker.type}${blocker.evidence ? ` (${blocker.evidence})` : ''}`)
      .join(', ');
    super(`Recon blocked: ${summary || 'unknown blocker'}`);
    this.name = 'ReconBlockedError';
    this.result = result;
  }
}

class ReconNotReadyError extends Error {
  constructor(result) {
    const status = result && result.status ? result.status : 'unknown';
    super(`Recon not ready: ${status}`);
    this.name = 'ReconNotReadyError';
    this.status = status;
    this.result = result;
  }
}

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function orderedViewports(config) {
  const viewports = Array.isArray(config.viewports) ? config.viewports : [];
  const primary = viewports.find(viewport => viewport.id === config.primaryViewport);
  if (!primary) return viewports.slice();
  return [primary].concat(viewports.filter(viewport => viewport.id !== primary.id));
}

function pathForUrl(value, fallback = '/') {
  try {
    return new URL(value).pathname || '/';
  } catch (error) {
    return fallback;
  }
}

function normalizeBlocker(blocker, viewportId) {
  if (!blocker || typeof blocker !== 'object') {
    return { type: 'unknown', evidence: String(blocker || ''), viewportId };
  }
  return Object.assign({ viewportId }, blocker);
}

function uniqueBlockers(blockers) {
  const seen = new Set();
  const out = [];
  for (const blocker of blockers) {
    const key = JSON.stringify([
      blocker.type || 'unknown',
      blocker.viewportId || '',
      blocker.url || '',
      blocker.evidence || '',
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(blocker);
  }
  return out;
}

function hasRealBlocker(blockers = []) {
  return blockers.some(blocker => REAL_BLOCKER_TYPES.has(blocker.type));
}

function readinessStatus(raw, blockers) {
  if (hasRealBlocker(blockers)) return 'blocked';
  const explicit = raw && raw.readiness && raw.readiness.status;
  if (explicit) return explicit;
  if (!raw || !Object.keys(raw).length) return 'not-ready';
  if (raw && raw.ready === false) return 'not-ready';
  if (raw && raw.loading) return 'loading';
  return 'ready';
}

function viewportFacts(viewport, raw = {}) {
  const shell = raw.viewport || raw.shellViewport || {};
  const effective = raw.effectiveViewport || shell;
  return {
    id: viewport.id,
    configured: {
      width: viewport.width,
      height: viewport.height,
    },
    shell: {
      width: Number(shell.width || viewport.width),
      height: Number(shell.height || viewport.height),
      devicePixelRatio: Number(shell.devicePixelRatio || raw.devicePixelRatio || 1),
    },
    effective: {
      width: Number(effective.width || shell.width || viewport.width),
      height: Number(effective.height || shell.height || viewport.height),
      devicePixelRatio: Number(effective.devicePixelRatio || shell.devicePixelRatio || raw.devicePixelRatio || 1),
    },
  };
}

function normalizeProbe(raw, config, viewport, measuredAt) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const iframe = source.iframe || source.dominantIframe || null;
  const blockers = (Array.isArray(source.blockers) ? source.blockers : [])
    .map(blocker => normalizeBlocker(blocker, viewport.id));

  if (source.error) {
    blockers.push({
      type: 'browser-error',
      evidence: String(source.error),
      viewportId: viewport.id,
    });
  }

  if (iframe && iframe.dominant && iframe.sameOrigin === false && !blockers.some(blocker => blocker.type === 'cross-origin-iframe')) {
    blockers.push({
      type: 'cross-origin-iframe',
      evidence: 'dominant iframe is cross-origin',
      url: iframe.url || iframe.src || null,
      viewportId: viewport.id,
    });
  }

  const shellFinalUrl = source.finalUrl || source.url || config.targetUrl;
  const retargetedFrom = source.retargetedFrom || (iframe && iframe.retargeted ? shellFinalUrl : null);
  const effectiveUrl = source.effectiveUrl || (iframe && iframe.retargeted && iframe.url) || shellFinalUrl;
  const status = readinessStatus(source, blockers);
  const readiness = Object.assign({}, source.readiness || {}, {
    status,
    readyState: (source.readiness && source.readiness.readyState) || source.readyState || null,
  });

  return {
    viewportId: viewport.id,
    measuredAt,
    status,
    requestedUrl: config.targetUrl,
    finalUrl: shellFinalUrl,
    effectiveUrl,
    retargetedFrom,
    title: source.title || '',
    readiness,
    blockers: uniqueBlockers(blockers),
    dimensions: source.dimensions || {},
    viewport: viewportFacts(viewport, source),
    sourceMetadata: source.sourceMetadata || source.metadata || {},
    frameworkHints: Array.isArray(source.frameworkHints) ? source.frameworkHints : [],
    libraryHints: Array.isArray(source.libraryHints) ? source.libraryHints : [],
    iframes: Array.isArray(source.iframes) ? source.iframes : (iframe ? [iframe] : []),
    dominantIframe: iframe,
    scrollReadiness: source.scrollReadiness || null,
    lazyLoadReadiness: source.lazyLoadReadiness || null,
  };
}

function primaryRecord(records, config) {
  return records.find(record => record.viewportId === config.primaryViewport) || records[0] || null;
}

function buildPageState({ config, records, generatedAt }) {
  const blockers = uniqueBlockers(records.flatMap(record => record.blockers || []))
    .filter(blocker => REAL_BLOCKER_TYPES.has(blocker.type));
  const status = blockers.length
    ? 'blocked'
    : (records.length && records.every(record => record.status === 'ready') ? 'ready' : 'not-ready');
  return {
    schemaVersion: RECON_SCHEMA_VERSION,
    generatedAt,
    status,
    targetUrl: config.targetUrl,
    primaryViewport: config.primaryViewport,
    measuredViewportOrder: records.map(record => record.viewportId),
    blockers,
    viewports: records,
  };
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function buildViewportManifest({ config, records, generatedAt }) {
  return {
    schemaVersion: RECON_SCHEMA_VERSION,
    generatedAt,
    primaryViewport: config.primaryViewport,
    measuredViewportOrder: records.map(record => record.viewportId),
    viewports: records.map(record => ({
      id: record.viewportId,
      configured: record.viewport.configured,
      shell: record.viewport.shell,
      effective: record.viewport.effective,
      finalUrl: record.finalUrl,
      effectiveUrl: record.effectiveUrl,
      retargetedFrom: record.retargetedFrom,
      dimensions: record.dimensions,
      readiness: record.readiness,
      blockers: record.blockers,
      dominantIframe: record.dominantIframe,
      scrollReadiness: record.scrollReadiness,
      lazyLoadReadiness: record.lazyLoadReadiness,
    })),
  };
}

function buildSourceMetadata({ config, records, generatedAt }) {
  const primary = primaryRecord(records, config) || {};
  return {
    schemaVersion: RECON_SCHEMA_VERSION,
    generatedAt,
    requestedUrl: config.targetUrl,
    finalUrl: primary.finalUrl || config.targetUrl,
    effectiveUrl: primary.effectiveUrl || primary.finalUrl || config.targetUrl,
    retargetedFrom: primary.retargetedFrom || null,
    title: primary.title || '',
    metadata: primary.sourceMetadata || {},
    frameworkHints: primary.frameworkHints || [],
    libraryHints: primary.libraryHints || [],
    iframes: primary.iframes || [],
    perViewport: records.map(record => ({
      viewportId: record.viewportId,
      title: record.title,
      finalUrl: record.finalUrl,
      effectiveUrl: record.effectiveUrl,
      metadata: record.sourceMetadata,
      frameworkHints: record.frameworkHints,
      libraryHints: record.libraryHints,
    })),
  };
}

function updatePageModelForRecon(pageModel, config, records, sourceMetadata, generatedAt, status) {
  const next = cloneJson(pageModel);
  const primary = primaryRecord(records, config) || {};
  next.source = Object.assign({}, next.source || {}, {
    url: sourceMetadata.effectiveUrl || sourceMetadata.finalUrl || config.targetUrl,
    requestedUrl: config.targetUrl,
    finalUrl: sourceMetadata.finalUrl || config.targetUrl,
    title: sourceMetadata.title || '',
    metadata: sourceMetadata.metadata || {},
    frameworkHints: sourceMetadata.frameworkHints || [],
    libraryHints: sourceMetadata.libraryHints || [],
    recon: {
      generatedAt,
      status,
      artifactDir: '01-recon',
    },
  });
  if (sourceMetadata.retargetedFrom) next.source.retargetedFrom = sourceMetadata.retargetedFrom;
  else delete next.source.retargetedFrom;

  next.viewports = Array.isArray(config.viewports) ? cloneJson(config.viewports) : next.viewports;

  const pages = next.pages && typeof next.pages === 'object' ? next.pages : {};
  const home = pages.home || {};
  home.path = pathForUrl(primary.effectiveUrl || primary.finalUrl || next.source.url, home.path || '/');
  home.dimensions = Object.assign({}, home.dimensions || {});
  for (const record of records) {
    home.dimensions[record.viewportId] = record.dimensions || {};
  }
  pages.home = home;
  next.pages = pages;

  return next;
}

function defaultDriver() {
  return createCaptureBrowserDriver();
}

function runRecon(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const config = loadRunConfig(absRunDir);
  const pageModel = loadPageModel(absRunDir);
  const driver = env.driver || defaultDriver();
  const generatedAt = nowIso(env);
  const records = [];

  for (const viewport of orderedViewports(config)) {
    const measuredAt = nowIso(env);
    let raw;
    try {
      raw = driver.probe(config.targetUrl, viewport, { runDir: absRunDir, config });
    } catch (error) {
      raw = {
        error: errorMessage(error),
        readiness: {
          status: 'blocked',
        },
      };
    }
    records.push(normalizeProbe(raw, config, viewport, measuredAt));
  }

  const pageState = buildPageState({ config, records, generatedAt });
  const viewportManifest = buildViewportManifest({ config, records, generatedAt });
  const sourceMetadata = buildSourceMetadata({ config, records, generatedAt });
  const updatedPageModel = updatePageModelForRecon(
    pageModel,
    config,
    records,
    sourceMetadata,
    generatedAt,
    pageState.status
  );

  const dir = reconDir(absRunDir);
  writeJson(path.join(dir, 'page-state.json'), pageState);
  writeJson(path.join(dir, 'viewport-manifest.json'), viewportManifest);
  writeJson(path.join(dir, 'source-metadata.json'), sourceMetadata);
  savePageModel(absRunDir, updatedPageModel);

  return {
    status: pageState.status,
    blockers: pageState.blockers,
    artifacts: {
      pageState: path.join(dir, 'page-state.json'),
      viewportManifest: path.join(dir, 'viewport-manifest.json'),
      sourceMetadata: path.join(dir, 'source-metadata.json'),
    },
    pageState,
    viewportManifest,
    sourceMetadata,
    pageModel: updatedPageModel,
  };
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

function reconProbeScript() {
  return `(() => {
    const short = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
    const textOf = el => (el && (el.innerText || el.textContent) || '').replace(/\\s+/g, ' ').trim();
    const absUrl = (value, base) => {
      try { return value ? new URL(value, base || location.href).href : null; } catch (e) { return value || null; }
    };
    const areaOf = rect => Math.max(0, rect.width) * Math.max(0, rect.height);
    const dims = (doc, win) => {
      const root = doc.documentElement || {};
      const body = doc.body || {};
      return {
        scrollWidth: Math.max(root.scrollWidth || 0, body.scrollWidth || 0, win.innerWidth || 0),
        scrollHeight: Math.max(root.scrollHeight || 0, body.scrollHeight || 0, win.innerHeight || 0),
        clientWidth: root.clientWidth || win.innerWidth || 0,
        clientHeight: root.clientHeight || win.innerHeight || 0,
      };
    };
    const metadata = doc => {
      const meta = name => {
        const el = doc.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]');
        return el ? short(el.getAttribute('content')) : null;
      };
      const link = rel => {
        const el = doc.querySelector('link[rel="' + rel + '"]');
        return el ? absUrl(el.getAttribute('href'), doc.URL) : null;
      };
      return {
        description: meta('description'),
        canonicalUrl: link('canonical'),
        ogTitle: meta('og:title'),
        ogDescription: meta('og:description'),
        ogImage: meta('og:image'),
        robots: meta('robots'),
      };
    };
    const hints = win => {
      const libs = [];
      const frameworks = [];
      if (win.gsap) libs.push('gsap');
      if (win.Webflow || (win.document && win.document.documentElement && win.document.documentElement.classList.contains('w-mod-js'))) libs.push('webflow');
      if (win.jQuery || win.$) libs.push('jquery');
      if (win.Lenis || win.lenis) libs.push('lenis');
      if (win.React || win.__REACT_DEVTOOLS_GLOBAL_HOOK__ || (win.document && win.document.querySelector('[data-reactroot],[data-reactid]'))) frameworks.push('react');
      if (win.Vue || win.__VUE__ || (win.document && win.document.querySelector('[data-v-app]'))) frameworks.push('vue');
      if (win.angular) frameworks.push('angular');
      return { libs: [...new Set(libs)], frameworks: [...new Set(frameworks)] };
    };
    const readiness = (doc, win) => {
      const bodyText = textOf(doc.body);
      const haystack = (doc.title + '\\n' + bodyText).toLowerCase();
      const blockers = [];
      const add = (type, pattern) => {
        const match = haystack.match(pattern);
        if (match) blockers.push({ type, evidence: short(match[0]) });
      };
      add('rate-limit', /\\b429\\b|too many requests|rate limit(?:ed)?|request limit|try again later/);
      add('challenge', /just a moment|verify you are human|captcha|hcaptcha|recaptcha|cloudflare ray|attention required/);
      add('access-denied', /access denied|forbidden|not authorized|permission denied/);
      const loading = doc.readyState === 'loading' || (bodyText.length < 80 && /loading|please wait|one moment|initializing/i.test(bodyText));
      const blocked = blockers.some(item => item.type !== 'loading');
      return {
        status: blocked ? 'blocked' : (loading ? 'loading' : 'ready'),
        readyState: doc.readyState,
        textLength: bodyText.length,
        textSample: short(bodyText),
        elementCount: doc.getElementsByTagName('*').length,
        blockers,
      };
    };
    const iframeFacts = () => Array.from(document.querySelectorAll('iframe')).map((frame, index) => {
      const rect = frame.getBoundingClientRect();
      const src = absUrl(frame.getAttribute('src') || frame.src, location.href);
      let accessible = false;
      let sameOrigin = false;
      let title = '';
      let url = src;
      try {
        sameOrigin = src ? new URL(src, location.href).origin === location.origin : false;
      } catch (e) {
        sameOrigin = false;
      }
      try {
        if (frame.contentDocument) {
          accessible = true;
          sameOrigin = true;
          title = frame.contentDocument.title || '';
          url = frame.contentWindow.location.href || src;
        }
      } catch (e) {
        accessible = false;
      }
      const areaRatio = Math.round((areaOf(rect) / Math.max(1, innerWidth * innerHeight)) * 1000) / 1000;
      return {
        index,
        src,
        url,
        title,
        sameOrigin,
        accessible,
        areaRatio,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
    const iframes = iframeFacts();
    const dominant = iframes.slice().sort((a, b) => b.areaRatio - a.areaRatio)[0] || null;
    const retarget = dominant && dominant.areaRatio >= 0.6 && dominant.accessible;
    const effectiveFrame = retarget ? document.querySelectorAll('iframe')[dominant.index] : null;
    const effectiveDoc = effectiveFrame ? effectiveFrame.contentDocument : document;
    const effectiveWin = effectiveFrame ? effectiveFrame.contentWindow : window;
    const read = readiness(effectiveDoc, effectiveWin);
    const dim = dims(effectiveDoc, effectiveWin);
    const hint = hints(effectiveWin);
    const lazyCandidates = effectiveDoc.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"], [data-src], [data-bg], source[data-srcset]').length;
    const incompleteImages = Array.from(effectiveDoc.images || []).filter(img => !img.complete).length;
    if (dominant && dominant.areaRatio >= 0.6) dominant.dominant = true;
    if (dominant && retarget) dominant.retargeted = true;
    const blockers = read.blockers.slice();
    if (dominant && dominant.areaRatio >= 0.6 && !dominant.accessible) {
      blockers.push({ type: 'cross-origin-iframe', evidence: 'dominant iframe is not readable from the shell page', url: dominant.url || dominant.src });
    }
    return {
      finalUrl: location.href,
      effectiveUrl: retarget ? effectiveWin.location.href : location.href,
      retargetedFrom: retarget ? location.href : null,
      title: effectiveDoc.title || document.title || '',
      readiness: read,
      readyState: read.readyState,
      blockers,
      dimensions: dim,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      effectiveViewport: { width: effectiveWin.innerWidth, height: effectiveWin.innerHeight, devicePixelRatio: effectiveWin.devicePixelRatio || devicePixelRatio },
      sourceMetadata: metadata(effectiveDoc),
      frameworkHints: hint.frameworks,
      libraryHints: hint.libs,
      iframes,
      iframe: dominant,
      scrollReadiness: {
        canScroll: dim.scrollHeight > (effectiveWin.innerHeight || dim.clientHeight) + 1,
        scrollHeight: dim.scrollHeight,
        viewportHeight: effectiveWin.innerHeight || dim.clientHeight,
        currentScrollY: effectiveWin.scrollY || 0,
        note: dim.scrollHeight > (effectiveWin.innerHeight || dim.clientHeight) + 1 ? 'scrollable page; Recon did not perform lazy-load settling' : 'page fits the viewport',
      },
      lazyLoadReadiness: {
        lazyCandidateCount: lazyCandidates,
        incompleteImageCount: incompleteImages,
        note: lazyCandidates || incompleteImages ? 'lazy or incomplete assets detected; later stages should settle before measurement' : 'no obvious lazy-load blockers detected',
      },
    };
  })()`;
}

function createCaptureBrowserDriver(options = {}) {
  const browserBin = options.browserBin || path.join(__dirname, '..', '..', 'bin', 'capture-browser');
  const timeoutMs = options.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
  const stableMs = options.readyStableMs || DEFAULT_READY_STABLE_MS;
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

  function evalProbe() {
    return parseJsonOutput(run(['eval', reconProbeScript(), '--max-output', '5000000']));
  }

  return {
    probe(targetUrl, viewport) {
      run(['open', targetUrl]);
      run(['set', 'viewport', String(viewport.width), String(viewport.height)]);
      if (openDelayMs > 0) sleepMs(openDelayMs);

      const started = Date.now();
      let latest = null;
      let lastKey = null;
      let stableSince = 0;
      while (Date.now() - started <= timeoutMs) {
        latest = evalProbe();
        const blockers = Array.isArray(latest && latest.blockers) ? latest.blockers : [];
        if (blockers.some(blocker => REAL_BLOCKER_TYPES.has(blocker.type))) break;
        const ready = latest && latest.readiness && latest.readiness.status === 'ready';
        const key = latest ? [
          latest.finalUrl,
          latest.effectiveUrl,
          latest.readiness && latest.readiness.readyState,
          latest.readiness && latest.readiness.textLength,
          latest.dimensions && latest.dimensions.scrollHeight,
        ].join('|') : '';
        if (ready) {
          if (key === lastKey) {
            if (!stableSince) stableSince = Date.now();
          } else {
            lastKey = key;
            stableSince = Date.now();
          }
          if (Date.now() - stableSince >= stableMs) break;
        } else {
          lastKey = key;
          stableSince = 0;
        }
        sleepMs(250);
      }
      if (latest && latest.readiness && latest.readiness.status !== 'ready') {
        latest.readiness.waitedMs = Date.now() - started;
      }
      return latest;
    },
  };
}

function createFixtureReconDriver(file) {
  const fixture = readJson(file);
  return {
    calls: [],
    probe(targetUrl, viewport) {
      this.calls.push({ targetUrl, viewport: cloneJson(viewport) });
      const raw = fixture[viewport.id] || fixture.default;
      if (!raw) throw new Error(`No Recon fixture snapshot for viewport "${viewport.id}"`);
      return cloneJson(raw);
    },
  };
}

module.exports = {
  REAL_BLOCKER_TYPES,
  RECON_SCHEMA_VERSION,
  ReconBlockedError,
  ReconNotReadyError,
  createCaptureBrowserDriver,
  createFixtureReconDriver,
  orderedViewports,
  reconProbeScript,
  runRecon,
};
