'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  loadPageModel,
  loadRunConfig,
  motionScoutDir,
  readJson,
  reconDir,
  savePageModel,
  staticMapDir,
  writeJson,
  writeText,
} = require('./artifacts');
const { staticMapTargetUrl } = require('./static-map');

const MOTION_SCOUT_SCHEMA_VERSION = 1;
const DEFAULT_OPEN_DELAY_MS = 250;
const TRIGGER_ORDER = ['hover', 'click', 'scroll', 'load', 'loop', 'cursor', 'unknown'];
const SOURCE_ORDER = [
  'css-transition-hover',
  'hover-affordance',
  'css-keyframes',
  'css-keyframes-loop',
  'split-reveal-dom',
  'scroll-trigger-registry',
  'sticky-pinned-clue',
  'click-affordance',
  'cursor-affordance',
  'unknown-motion-clue',
];
const FORBIDDEN_MOTION_FACT_KEYS = new Set([
  'dur',
  'duration',
  'ease',
  'easing',
  'from',
  'to',
  'frames',
  'timelineRef',
  'captureId',
  'importance',
  'componentName',
  'implementationToken',
  'implementationTokens',
]);

class MotionScoutPrerequisiteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MotionScoutPrerequisiteError';
  }
}

function nowIso(env = {}) {
  const now = env.now ? new Date(env.now) : new Date();
  return now.toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value, fallback = 'candidate') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function configuredViewports(config) {
  return Array.isArray(config.viewports) ? config.viewports.slice() : [];
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

function pageRegions(pageModel) {
  const pages = pageModel && pageModel.pages && typeof pageModel.pages === 'object'
    ? pageModel.pages
    : {};
  const home = pages.home || {};
  return Array.isArray(home.regions) ? home.regions : [];
}

function completedStaticMap(runDir, pageModel) {
  const measurementsFile = path.join(staticMapDir(runDir), 'measurements.json');
  const assertionsFile = path.join(staticMapDir(runDir), 'assertions.json');
  const coverageFile = path.join(staticMapDir(runDir), 'coverage.md');
  if (!fs.existsSync(measurementsFile) || !fs.existsSync(assertionsFile) || !fs.existsSync(coverageFile)) {
    throw new MotionScoutPrerequisiteError('motion-scout requires completed Static Map artifacts: 02-static-map/measurements.json, assertions.json, and coverage.md are required');
  }
  const regions = pageRegions(pageModel);
  if (!regions.length) {
    throw new MotionScoutPrerequisiteError('motion-scout requires completed Static Map Region scaffold in page-model.json');
  }
  return regions;
}

function motionScoutTargetUrl(runDir, config) {
  const pageStateFile = path.join(reconDir(runDir), 'page-state.json');
  if (!fs.existsSync(pageStateFile)) return config.targetUrl;
  return staticMapTargetUrl(config, readJson(pageStateFile));
}

function selectorOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value) || null;
  return cleanText(value.sel || value.selector || value.targetSelector || value.target || value.host || value.trigger) || null;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function priorityRank(hint) {
  if (hint === 'high') return 3;
  if (hint === 'medium') return 2;
  if (hint === 'low') return 1;
  return 0;
}

function transitionProperties(value) {
  return cleanText(value)
    .split(',')
    .map(part => cleanText(part).toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function observation({
  source,
  trigger,
  targetSelector,
  viewportId,
  regionSelector = null,
  reason = null,
  priorityHint = 'medium',
  evidence = {},
}) {
  const normalizedTrigger = TRIGGER_ORDER.includes(trigger) ? trigger : 'unknown';
  return {
    source,
    trigger: normalizedTrigger,
    triggerReason: normalizedTrigger === 'unknown' ? (reason || 'motion clue did not identify a v0 trigger') : null,
    targetSelector,
    viewportId,
    regionSelector,
    priorityHint,
    evidence,
  };
}

function firstAnimationTarget(scrollTrigger = {}) {
  for (const anim of arrayOf(scrollTrigger.anims)) {
    const targets = arrayOf(anim && anim.targets);
    if (targets[0]) return targets[0];
  }
  return null;
}

function observationsFromMeasurement(measurement = {}, viewportId) {
  const observations = [];

  for (const item of arrayOf(measurement.cssHovers)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    const properties = transitionProperties(item.prop || item.property || item.transitionProperty);
    const animatesStrongProperty = properties.some(prop => /transform|opacity|filter|clip|height|width|all/.test(prop));
    observations.push(observation({
      source: 'css-transition-hover',
      trigger: 'hover',
      targetSelector,
      viewportId,
      priorityHint: animatesStrongProperty ? 'high' : 'medium',
      evidence: {
        propertyFamilies: properties,
      },
    }));
  }

  for (const item of arrayOf(measurement.hoverCandidates)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'hover-affordance',
      trigger: 'hover',
      targetSelector,
      viewportId,
      priorityHint: 'medium',
    }));
  }

  for (const item of arrayOf(measurement.cssKeyframes)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'css-keyframes',
      trigger: 'load',
      targetSelector,
      viewportId,
      priorityHint: 'medium',
    }));
  }

  for (const item of arrayOf(measurement.loops)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'css-keyframes-loop',
      trigger: 'loop',
      targetSelector,
      viewportId,
      priorityHint: 'low',
    }));
  }

  for (const item of arrayOf(measurement.splitReveals)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'split-reveal-dom',
      trigger: 'load',
      targetSelector,
      viewportId,
      regionSelector: selectorOf(item.section) || item.section || null,
      priorityHint: 'high',
      evidence: {
        itemCount: Number(item.count || 0) || null,
        kinds: arrayOf(item.kinds).map(cleanText).filter(Boolean).slice(0, 8),
      },
    }));
  }

  for (const item of arrayOf(measurement.scrollTriggers)) {
    const targetSelector = selectorOf(item.trigger) || firstAnimationTarget(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'scroll-trigger-registry',
      trigger: 'scroll',
      targetSelector,
      viewportId,
      regionSelector: selectorOf(item.trigger),
      priorityHint: item.pin || item.scrub ? 'high' : 'medium',
      evidence: {
        pin: Boolean(item.pin),
        scrub: Boolean(item.scrub),
        callbacks: arrayOf(item.callbacks).map(cleanText).filter(Boolean).slice(0, 8),
      },
    }));
  }

  for (const item of arrayOf(measurement.stickyCandidates)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'sticky-pinned-clue',
      trigger: 'scroll',
      targetSelector,
      viewportId,
      priorityHint: 'medium',
    }));
  }

  for (const item of arrayOf(measurement.clickCandidates)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'click-affordance',
      trigger: 'click',
      targetSelector,
      viewportId,
      priorityHint: 'medium',
    }));
  }

  for (const item of arrayOf(measurement.cursorCandidates)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'cursor-affordance',
      trigger: 'cursor',
      targetSelector,
      viewportId,
      priorityHint: 'medium',
    }));
  }

  for (const item of arrayOf(measurement.unknownCandidates)) {
    const targetSelector = selectorOf(item);
    if (!targetSelector) continue;
    observations.push(observation({
      source: 'unknown-motion-clue',
      trigger: 'unknown',
      targetSelector,
      viewportId,
      regionSelector: selectorOf(item.regionSelector),
      reason: cleanText(item.reason) || null,
      priorityHint: 'low',
    }));
  }

  return observations;
}

function sourceSelectors(region = {}) {
  const source = region.source || {};
  return [source.primarySelector].concat(source.selectors || [])
    .map(cleanText)
    .filter(Boolean);
}

function selectorMatchesRegion(selector, region) {
  const target = cleanText(selector);
  if (!target) return false;
  return sourceSelectors(region).some(regionSelector => (
    target === regionSelector ||
    target.startsWith(`${regionSelector} `) ||
    target.startsWith(`${regionSelector}>`) ||
    target.startsWith(`${regionSelector} >`)
  ));
}

function regionForObservation(regions, obs) {
  const selectors = [obs.regionSelector, obs.targetSelector].filter(Boolean);
  for (const selector of selectors) {
    const region = regions.find(candidate => selectorMatchesRegion(selector, candidate));
    if (region) return { regionId: region.id, regionReason: null };
  }
  return {
    regionId: null,
    regionReason: 'motion clue did not match any Static Map Region selector',
  };
}

function signatureFor(obs) {
  return [obs.trigger, obs.targetSelector].join('|');
}

function evidenceFor(obs) {
  return Object.assign({
    source: obs.source,
    viewportId: obs.viewportId,
  }, cloneJson(obs.evidence || {}));
}

function uniqueCandidateId(obs, region, usedIds) {
  const selectorTail = cleanText(obs.targetSelector).split(/\s+/).slice(-2).join(' ');
  const base = `candidate-${slugify(obs.trigger)}-${slugify(region.regionId || 'out-of-region')}-${slugify(selectorTail)}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function recipeFor(trigger, targetSelector) {
  const base = { trigger, targetSelector };
  if (trigger === 'hover') {
    return Object.assign(base, {
      steps: [
        { action: 'scrollIntoView', selector: targetSelector },
        { action: 'hover', selector: targetSelector },
        { action: 'wait', waitMs: 1200 },
      ],
    });
  }
  if (trigger === 'click') {
    return Object.assign(base, {
      steps: [
        { action: 'scrollIntoView', selector: targetSelector },
        { action: 'click', selector: targetSelector },
        { action: 'wait', waitMs: 1200 },
      ],
    });
  }
  if (trigger === 'scroll') {
    return Object.assign(base, {
      steps: [
        { action: 'scan', selector: targetSelector },
        { action: 'scrollIntoView', selector: targetSelector },
        { action: 'wait', waitMs: 1200 },
      ],
    });
  }
  if (trigger === 'load') {
    return Object.assign(base, {
      steps: [
        { action: 'boot', selectors: [targetSelector] },
        { action: 'wait', waitMs: 4000 },
      ],
    });
  }
  if (trigger === 'loop') {
    return Object.assign(base, {
      steps: [
        { action: 'scan', selector: targetSelector },
        { action: 'wait', waitMs: 2000 },
      ],
    });
  }
  if (trigger === 'cursor') {
    return Object.assign(base, {
      steps: [
        { action: 'scrollIntoView', selector: targetSelector },
        { action: 'mouseMove', selector: targetSelector },
        { action: 'wait', waitMs: 1200 },
      ],
    });
  }
  return Object.assign(base, {
    steps: [
      { action: 'scan', selector: targetSelector },
      { action: 'wait', waitMs: 1200 },
    ],
  });
}

function viewportApplicabilityFor(trigger, occurrences, config) {
  const viewportIds = Array.from(new Set(occurrences.map(occurrence => occurrence.viewportId))).sort();
  if (trigger === 'hover' || trigger === 'cursor') {
    return {
      mode: 'pointer-only',
      viewportIds,
      reason: `${trigger} candidates require a pointer-capable interaction`,
    };
  }
  const configuredIds = configuredViewports(config).map(viewport => viewport.id).sort();
  return {
    mode: viewportIds.length === configuredIds.length && viewportIds.every((id, index) => id === configuredIds[index]) ? 'all' : 'viewport-specific',
    viewportIds,
    reason: viewportIds.length === configuredIds.length ? null : 'candidate was only discovered in these measured viewports',
  };
}

function buildCandidates({ observations, regions, config }) {
  const bySignature = new Map();
  const usedIds = new Set();
  const candidates = [];

  for (const obs of observations) {
    const signature = signatureFor(obs);
    let candidate = bySignature.get(signature);
    const region = regionForObservation(regions, obs);
    const occurrence = {
      viewportId: obs.viewportId,
      targetSelector: obs.targetSelector,
      regionId: region.regionId,
      regionReason: region.regionReason,
      evidenceSource: obs.source,
    };

    if (!candidate) {
      candidate = {
        id: uniqueCandidateId(obs, region, usedIds),
        trigger: obs.trigger,
        triggerReason: obs.triggerReason,
        targetSelector: obs.targetSelector,
        regionId: region.regionId,
        regionReason: region.regionReason,
        evidence: [],
        recipe: recipeFor(obs.trigger, obs.targetSelector),
        viewportApplicability: null,
        priorityHint: obs.priorityHint,
        priorityReason: `${obs.source} produced this candidate lead`,
        occurrences: [],
      };
      bySignature.set(signature, candidate);
      candidates.push(candidate);
    }

    candidate.occurrences.push(occurrence);
    const evidence = evidenceFor(obs);
    const evidenceKey = JSON.stringify(evidence);
    if (!candidate.evidence.some(existing => JSON.stringify(existing) === evidenceKey)) {
      candidate.evidence.push(evidence);
    }
    if (priorityRank(obs.priorityHint) > priorityRank(candidate.priorityHint)) {
      candidate.priorityHint = obs.priorityHint;
      candidate.priorityReason = `${obs.source} produced this candidate lead`;
    }
    if (!candidate.regionId && region.regionId) {
      candidate.regionId = region.regionId;
      candidate.regionReason = region.regionReason;
    }
  }

  for (const candidate of candidates) {
    candidate.viewportApplicability = viewportApplicabilityFor(candidate.trigger, candidate.occurrences, config);
  }

  return candidates;
}

function sourceCounts(candidates) {
  const counts = {};
  for (const source of SOURCE_ORDER) counts[source] = 0;
  for (const candidate of candidates) {
    for (const source of new Set(candidate.evidence.map(item => item.source))) {
      counts[source] = (counts[source] || 0) + 1;
    }
  }
  return counts;
}

function hasForbiddenMotionFact(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenMotionFact);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_MOTION_FACT_KEYS.has(key) || hasForbiddenMotionFact(child));
}

function buildMotionCandidatesArtifact({ config, generatedAt, targetUrl, candidates }) {
  return {
    schemaVersion: MOTION_SCOUT_SCHEMA_VERSION,
    generatedAt,
    targetUrl,
    primaryViewport: config.primaryViewport,
    candidates: cloneJson(candidates),
    discovery: {
      sources: sourceCounts(candidates),
      motionFidelity: {
        status: 'not-measured',
        reason: 'Motion Scout records candidate leads only; Capture records measured motion facts later.',
      },
    },
  };
}

function buildAssertions({ generatedAt, candidates }) {
  const counts = sourceCounts(candidates);
  const assertions = [{
    id: 'motion-scout-candidates-present',
    kind: 'motion-candidates',
    required: false,
    status: candidates.length ? 'pass' : 'info',
    evidence: candidates.length ? [`${candidates.length} candidate leads discovered`] : ['no likely motion leads were discovered'],
    failure: null,
  }];

  for (const source of SOURCE_ORDER) {
    const count = counts[source] || 0;
    assertions.push({
      id: `motion-scout-source-${source}`,
      kind: 'discovery-source',
      required: false,
      status: count ? 'pass' : 'info',
      evidence: [`${count} candidate ${count === 1 ? 'lead' : 'leads'}`],
      failure: null,
    });
  }

  const unattachedWithoutReason = candidates.filter(candidate => !candidate.regionId && !candidate.regionReason);
  assertions.push({
    id: 'motion-scout-region-attachment',
    kind: 'region-attachment',
    required: true,
    status: unattachedWithoutReason.length ? 'fail' : 'pass',
    evidence: candidates.map(candidate => `${candidate.id}:${candidate.regionId || 'out-of-region'}`),
    failure: unattachedWithoutReason.length ? 'Some candidates lacked both Region id and null + reason' : null,
  });

  assertions.push({
    id: 'motion-scout-no-measured-motion-facts',
    kind: 'motion-fidelity-boundary',
    required: true,
    status: hasForbiddenMotionFact(candidates) ? 'fail' : 'pass',
    evidence: ['candidate records omit measured duration, easing, from/to values, sampled frames, capture ids, Signature importance, and implementation tokens'],
    failure: hasForbiddenMotionFact(candidates) ? 'Candidate records contain measured motion or implementation facts' : null,
  });

  assertions.push({
    id: 'motion-scout-motion-fidelity-deferred',
    kind: 'motion-fidelity-boundary',
    required: false,
    status: 'info',
    evidence: ['Motion Scout discovery coverage is separate from Capture motion fidelity'],
    failure: null,
  });

  return {
    schemaVersion: MOTION_SCOUT_SCHEMA_VERSION,
    generatedAt,
    assertions,
  };
}

function coverageCell(value) {
  return String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCoverage({ generatedAt, candidates }) {
  const counts = sourceCounts(candidates);
  const lines = [
    '# Motion Scout Coverage',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Discovery Sources',
    '',
    '| Source | Candidates | Status |',
    '| --- | ---: | --- |',
  ];

  for (const source of SOURCE_ORDER) {
    const count = counts[source] || 0;
    lines.push(`| ${coverageCell(source)} | ${count} | ${count ? 'complete' : 'info'} |`);
  }

  lines.push('');
  lines.push('## Candidate Leads');
  lines.push('');
  lines.push('| Candidate | Trigger | Region | Target | Priority | Evidence |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  if (!candidates.length) {
    lines.push('| candidates | unknown | out-of-region | none | low | no likely motion leads were discovered |');
  }

  for (const candidate of candidates) {
    lines.push(`| ${coverageCell(candidate.id)} | ${coverageCell(candidate.trigger)} | ${coverageCell(candidate.regionId || candidate.regionReason)} | ${coverageCell(candidate.targetSelector)} | ${coverageCell(candidate.priorityHint)} | ${coverageCell(candidate.evidence.map(item => item.source).join(', '))} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function updatePageModelForMotionScout(pageModel, candidates) {
  const next = cloneJson(pageModel);
  const pages = next.pages && typeof next.pages === 'object' ? next.pages : {};
  const home = pages.home || {};
  const regions = Array.isArray(home.regions) ? home.regions : [];
  const refsByRegion = new Map();

  for (const candidate of candidates) {
    for (const occurrence of candidate.occurrences || []) {
      const regionId = occurrence.regionId;
      if (!regionId) continue;
      if (!refsByRegion.has(regionId)) refsByRegion.set(regionId, new Set());
      refsByRegion.get(regionId).add(candidate.id);
    }
  }

  home.regions = regions.map((region) => {
    const nextRegion = cloneJson(region);
    nextRegion.motionCandidates = Array.from(refsByRegion.get(region.id) || []);
    return nextRegion;
  });
  pages.home = home;
  next.pages = pages;
  delete next.motionCandidates;
  return next;
}

function createFixtureMotionScoutDriver(file) {
  const fixture = readJson(file);
  return {
    calls: [],
    measure(targetUrl, viewport) {
      this.calls.push({ targetUrl, viewport: cloneJson(viewport) });
      const raw = fixture[viewport.id] || fixture.default || fixture;
      if (!raw) throw new Error(`No Motion Scout fixture measurement for viewport "${viewport.id}"`);
      return cloneJson(raw);
    },
  };
}

function motionScoutProbeScript() {
  const engineFile = path.join(__dirname, '..', '..', 'extension', 'capture-animation.js');
  const probeFile = path.join(__dirname, '..', 'probes', 'motion-scout-probe.js');
  const engineSource = fs.readFileSync(engineFile, 'utf8');
  const probeSource = fs.readFileSync(probeFile, 'utf8');
  return `(() => {
    if (!window.__cap || typeof window.__cap.map !== 'function') {
${engineSource}
    }
${probeSource}
    return window.__yoinkitMotionScoutProbe();
  })()`;
}

function createCaptureBrowserMotionScoutDriver(options = {}) {
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
      return parseJsonOutput(run(['eval', motionScoutProbeScript(), '--max-output', '5000000']));
    },
  };
}

function defaultDriver() {
  return createCaptureBrowserMotionScoutDriver();
}

function runMotionScout(runDir, env = {}) {
  const absRunDir = path.resolve(runDir);
  const config = loadRunConfig(absRunDir);
  const pageModel = loadPageModel(absRunDir);
  const regions = completedStaticMap(absRunDir, pageModel);
  const generatedAt = nowIso(env);
  const targetUrl = motionScoutTargetUrl(absRunDir, config);
  const driver = env.driver || defaultDriver();
  if (!driver || typeof driver.measure !== 'function') {
    throw new Error('motion-scout requires a discovery driver');
  }

  const observations = [];
  for (const viewport of configuredViewports(config)) {
    const measurement = driver.measure(targetUrl, viewport, {
      runDir: absRunDir,
      config,
      pageModel,
    }) || {};
    observations.push(...observationsFromMeasurement(measurement, viewport.id));
  }

  const candidates = buildCandidates({ observations, regions, config });
  const artifact = buildMotionCandidatesArtifact({ config, generatedAt, targetUrl, candidates });
  const assertions = buildAssertions({ generatedAt, candidates });
  const coverage = buildCoverage({ generatedAt, candidates });
  const updatedPageModel = updatePageModelForMotionScout(pageModel, candidates);
  const dir = motionScoutDir(absRunDir);

  writeJson(path.join(dir, 'motion-candidates.json'), artifact);
  writeJson(path.join(dir, 'assertions.json'), assertions);
  writeText(path.join(dir, 'coverage.md'), coverage);
  savePageModel(absRunDir, updatedPageModel);

  return {
    status: 'ready',
    generatedAt,
    artifacts: {
      candidates: path.join(dir, 'motion-candidates.json'),
      assertions: path.join(dir, 'assertions.json'),
      coverage: path.join(dir, 'coverage.md'),
    },
    candidates,
    assertions,
    coverage,
    pageModel: updatedPageModel,
  };
}

module.exports = {
  MOTION_SCOUT_SCHEMA_VERSION,
  MotionScoutPrerequisiteError,
  completedStaticMap,
  createCaptureBrowserMotionScoutDriver,
  createFixtureMotionScoutDriver,
  motionScoutProbeScript,
  runMotionScout,
};
