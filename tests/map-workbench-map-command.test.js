#!/usr/bin/env bun
'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-map-command-test-'));
  tempDirs.add(dir);
  return dir;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeFakeBrowser(cwd) {
  const file = path.join(cwd, 'fake-capture-browser.js');
  fs.writeFileSync(file, `#!/usr/bin/env bun
'use strict';
const fs = require('fs');
fs.appendFileSync(process.env.YOINKIT_FAKE_BROWSER_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
`);
  fs.chmodSync(file, 0o755);
  return file;
}

function runCli(cwd, args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    env: Object.assign({}, process.env, env),
  });
}

function createRun(cwd) {
  const runDir = path.join(cwd, 'run');
  const result = runCli(cwd, [
    'init',
    'https://example.com/source',
    '--run-dir',
    runDir,
    '--viewport',
    'desktop=1280x800',
  ]);
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(runDir);
  return runDir;
}

function readyReconSnapshot() {
  return {
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
  };
}

function blockedReconSnapshot() {
  return Object.assign({}, readyReconSnapshot(), {
    title: 'Access challenge',
    readiness: { status: 'blocked', readyState: 'complete', textLength: 120 },
    blockers: [{ type: 'challenge', evidence: 'verify you are human' }],
  });
}

function loadingReconSnapshot() {
  return Object.assign({}, readyReconSnapshot(), {
    title: 'Loading page',
    readiness: { status: 'loading', readyState: 'interactive', textLength: 24 },
    blockers: [],
  });
}

function measuredCandidate() {
  return {
    selector: 'main > section.hero',
    selectors: ['main > section.hero', '[data-section="hero"]'],
    semantic: { tagName: 'section', heading: 'Launch faster' },
    rect: { x: 0, y: 0, width: 1280, height: 620 },
    scrollY: 0,
    stacking: { zIndex: 'auto' },
    colors: [{ property: 'background-color', value: 'rgb(250, 250, 250)' }],
    typography: [{
      selector: 'main > section.hero h1',
      sampleText: 'Launch faster',
      fontFamily: 'Inter',
      fontSize: '48px',
      fontWeight: '700',
      lineHeight: '56px',
      letterSpacing: '0px',
      sourceHints: { stylesheetHrefs: [], fontUrls: [] },
    }],
    assets: [],
  };
}

function completeMotionInspections() {
  return REQUIRED_MOTION_DISCOVERY_SOURCES.map(source => ({
    source,
    status: 'complete',
    evidence: `${source} inspected`,
  }));
}

function writeStageFixtures(cwd) {
  const fixtureDir = path.join(cwd, 'fixtures');
  const reconFixture = path.join(fixtureDir, 'recon.json');
  const staticMapFixture = path.join(fixtureDir, 'static-map.json');
  const motionScoutFixture = path.join(fixtureDir, 'motion-scout.json');
  writeJson(reconFixture, { default: readyReconSnapshot() });
  writeJson(staticMapFixture, { default: { candidates: [measuredCandidate()] } });
  writeJson(motionScoutFixture, {
    default: {
      cssHovers: [{ sel: 'main > section.hero a.cta', prop: 'transform' }],
      sourceInspections: completeMotionInspections(),
    },
  });
  return {
    YOINKIT_RECON_FIXTURE: reconFixture,
    YOINKIT_STATIC_MAP_FIXTURE: staticMapFixture,
    YOINKIT_MOTION_SCOUT_FIXTURE: motionScoutFixture,
  };
}

function writeStageFixturesWithMissingStaticMeasurement(cwd) {
  const env = writeStageFixtures(cwd);
  const staticMapFixture = path.join(cwd, 'fixtures', 'static-map-missing.json');
  writeJson(staticMapFixture, {});
  env.YOINKIT_STATIC_MAP_FIXTURE = staticMapFixture;
  return env;
}

test('yoinkit map runs the pre-gate Map workbench sequence and stops before Map Gate', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const env = writeStageFixtures(cwd);

  const result = runCli(cwd, ['map', runDir], env);
  const reportFile = path.join(runDir, '04-map-report', 'index.html');

  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(reportFile);
  expect(path.isAbsolute(result.stdout.trim())).toBe(true);
  expect(fs.existsSync(path.join(runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'measurements.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '03-motion-scout', 'motion-candidates.json'))).toBe(true);
  expect(fs.existsSync(reportFile)).toBe(true);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'report-snapshot.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'gate.json'))).toBe(false);

  const pageState = readJson(path.join(runDir, '01-recon', 'page-state.json'));
  const staticMap = readJson(path.join(runDir, '02-static-map', 'measurements.json'));
  const motionScout = readJson(path.join(runDir, '03-motion-scout', 'motion-candidates.json'));
  const report = readJson(path.join(runDir, '04-map-report', 'report-snapshot.json'));
  expect(new Date(pageState.generatedAt).getTime()).toBeLessThanOrEqual(new Date(staticMap.generatedAt).getTime());
  expect(new Date(staticMap.generatedAt).getTime()).toBeLessThanOrEqual(new Date(motionScout.generatedAt).getTime());
  expect(new Date(motionScout.generatedAt).getTime()).toBeLessThanOrEqual(new Date(report.generatedAt).getTime());
});

test('yoinkit map-review opens Report v0 at the primary viewport', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const env = writeStageFixtures(cwd);
  const mapResult = runCli(cwd, ['map', runDir], env);
  expect(mapResult.status).toBe(0);

  const browserLog = path.join(cwd, 'browser-log.jsonl');
  const fakeBrowser = writeFakeBrowser(cwd);
  const result = runCli(cwd, ['map-review', runDir], Object.assign({}, env, {
    YOINKIT_MAP_REVIEW_BROWSER: fakeBrowser,
    YOINKIT_FAKE_BROWSER_LOG: browserLog,
  }));

  const reportFile = path.join(runDir, '04-map-report', 'index.html');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(reportFile);
  expect(result.stdout).toContain('desktop 1280x800');
  const calls = fs.readFileSync(browserLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(calls.slice(0, 3)).toEqual([
    ['open', `file://${reportFile}`, '--headed'],
    ['set', 'viewport', '1280', '800'],
    ['wait', '--load', 'domcontentloaded'],
  ]);
  expect(calls[3][0]).toBe('eval');
  expect(calls[3][1]).toContain('innerWidth');
  expect(calls[3][2]).toBe('--max-output');
});

test('yoinkit map-review uses the configured primary viewport', () => {
  const cwd = tempDir();
  const runDir = path.join(cwd, 'run');
  const init = runCli(cwd, [
    'init',
    'https://example.com/source',
    '--run-dir',
    runDir,
    '--viewport',
    'desktop=1280x800',
    '--viewport',
    'mobile=390x844',
    '--primary-viewport',
    'mobile',
  ]);
  expect(init.status).toBe(0);
  const reportFile = path.join(runDir, '04-map-report', 'index.html');
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, '<!doctype html><title>Review</title>');

  const browserLog = path.join(cwd, 'browser-log.jsonl');
  const fakeBrowser = writeFakeBrowser(cwd);
  const result = runCli(cwd, ['map-review', runDir], {
    YOINKIT_MAP_REVIEW_BROWSER: fakeBrowser,
    YOINKIT_FAKE_BROWSER_LOG: browserLog,
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('mobile 390x844');
  const calls = fs.readFileSync(browserLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(calls[1]).toEqual(['set', 'viewport', '390', '844']);
});

test('yoinkit map-review requires generated Report v0 HTML', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);

  const result = runCli(cwd, ['map-review', runDir]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('map-review requires Report v0 at 04-map-report/index.html');
});

test('yoinkit map stops at Recon when Recon reports a real blocker', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const reconFixture = path.join(cwd, 'fixtures', 'recon-blocked.json');
  writeJson(reconFixture, { default: blockedReconSnapshot() });

  const result = runCli(cwd, ['map', runDir], { YOINKIT_RECON_FIXTURE: reconFixture });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Recon blocked: challenge (verify you are human)');
  expect(fs.existsSync(path.join(runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'measurements.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'index.html'))).toBe(false);

  const status = readJson(path.join(runDir, '01-recon', 'stage-status.json'));
  expect(status).toMatchObject({
    schemaVersion: 1,
    stage: 'recon',
    status: 'blocked',
    error: 'Recon blocked: challenge (verify you are human)',
    errorName: 'ReconBlockedError',
  });
});

test('yoinkit map attributes non-ready Recon results to Recon', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const reconFixture = path.join(cwd, 'fixtures', 'recon-loading.json');
  writeJson(reconFixture, { default: loadingReconSnapshot() });

  const result = runCli(cwd, ['map', runDir], { YOINKIT_RECON_FIXTURE: reconFixture });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Recon not ready');
  expect(fs.existsSync(path.join(runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'measurements.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'stage-status.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'index.html'))).toBe(false);

  const status = readJson(path.join(runDir, '01-recon', 'stage-status.json'));
  expect(status).toMatchObject({
    schemaVersion: 1,
    stage: 'recon',
    status: 'not-ready',
    errorName: 'ReconNotReadyError',
  });
  expect(status.error).toContain('Recon not ready');
});

test('yoinkit map stops at the first failing stage and preserves completed artifacts', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const env = writeStageFixturesWithMissingStaticMeasurement(cwd);

  const result = runCli(cwd, ['map', runDir], env);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('No Static Map fixture measurement for viewport "desktop"');
  expect(fs.existsSync(path.join(runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'measurements.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '03-motion-scout', 'motion-candidates.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'index.html'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'gate.json'))).toBe(false);

  const status = readJson(path.join(runDir, '02-static-map', 'stage-status.json'));
  expect(status).toMatchObject({
    schemaVersion: 1,
    stage: 'static-map',
    status: 'failed',
    error: 'No Static Map fixture measurement for viewport "desktop"',
  });
  expect(path.isAbsolute(status.runDir)).toBe(true);
});

test('yoinkit map stops at Static Map when no Region scaffold is produced', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const env = writeStageFixtures(cwd);
  const staticMapFixture = path.join(cwd, 'fixtures', 'static-map-empty.json');
  writeJson(staticMapFixture, { default: { candidates: [] } });
  env.YOINKIT_STATIC_MAP_FIXTURE = staticMapFixture;

  const result = runCli(cwd, ['map', runDir], env);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Static Map produced no Regions');
  expect(fs.existsSync(path.join(runDir, '01-recon', 'page-state.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'measurements.json'))).toBe(true);
  expect(fs.existsSync(path.join(runDir, '03-motion-scout', 'motion-candidates.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '03-motion-scout', 'stage-status.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'index.html'))).toBe(false);

  const status = readJson(path.join(runDir, '02-static-map', 'stage-status.json'));
  expect(status).toMatchObject({
    schemaVersion: 1,
    stage: 'static-map',
    status: 'failed',
    error: 'Static Map produced no Regions',
    errorName: 'StaticMapStageFailedError',
  });
});

test('yoinkit map clears a stage failure status after a successful rerun', () => {
  const cwd = tempDir();
  const runDir = createRun(cwd);
  const env = writeStageFixtures(cwd);
  const emptyStaticMapFixture = path.join(cwd, 'fixtures', 'static-map-empty.json');
  writeJson(emptyStaticMapFixture, { default: { candidates: [] } });

  const failed = runCli(cwd, ['map', runDir], Object.assign({}, env, {
    YOINKIT_STATIC_MAP_FIXTURE: emptyStaticMapFixture,
  }));
  expect(failed.status).toBe(1);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'stage-status.json'))).toBe(true);

  const passed = runCli(cwd, ['map', runDir], env);

  expect(passed.status).toBe(0);
  expect(fs.existsSync(path.join(runDir, '02-static-map', 'stage-status.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, '04-map-report', 'index.html'))).toBe(true);
});

test('yoinkit help presents the implemented Map workbench surface without legacy capture commands', () => {
  const cwd = tempDir();

  const result = runCli(cwd, ['--help']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('init -> map -> map-review -> map-gate');
  expect(result.stdout).toContain('bin/yoinkit init <url>');
  expect(result.stdout).toContain('bin/yoinkit map <run-dir>');
  expect(result.stdout).toContain('bin/yoinkit map-review <run-dir>');
  expect(result.stdout).toContain('bin/yoinkit map-gate <run-dir> --approve');
  expect(result.stdout).toContain('bin/yoinkit recon <run-dir>');
  expect(result.stdout).toContain('bin/yoinkit static-map <run-dir>');
  expect(result.stdout).toContain('bin/yoinkit motion-scout <run-dir>');
  expect(result.stdout).toContain('bin/yoinkit map-report <run-dir>');
  expect(result.stdout).not.toContain('bin/yoinkit scout');
  expect(result.stdout).not.toContain('bin/yoinkit yoink');
  expect(result.stdout).not.toContain('bin/yoinkit plan');
  expect(result.stdout).not.toContain('bin/yoinkit capture');
  expect(result.stdout).not.toContain('bin/yoinkit assemble');
  expect(result.stdout).not.toContain('bin/yoinkit report <run-dir>');
  expect(result.stdout).not.toContain('bin/yoinkit run');
  expect(result.stdout).not.toContain('Manifest capture examples');
  expect(result.stdout).not.toContain('Capture-repair loop');
});

test('yoinkit rejects legacy capability-first commands as public aliases', () => {
  const cwd = tempDir();

  for (const command of ['scout', 'yoink', 'plan', 'capture', 'assemble', 'report', 'run']) {
    const result = runCli(cwd, [command, '--help']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Unknown command: ${command}`);
  }
});
