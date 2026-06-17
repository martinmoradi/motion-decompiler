#!/usr/bin/env bun
'use strict';

const { afterEach, expect, test } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  parseInitArgs,
  resolveRunConfig,
  resolveViewports,
} = require('../lib/map-workbench/config');

const BIN = path.join(__dirname, '..', 'bin', 'yoinkit');
const tempDirs = new Set();

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinkit-init-test-'));
  tempDirs.add(dir);
  return dir;
}

function runInit(cwd, args) {
  return spawnSync(process.execPath, [BIN, 'init', ...args], { cwd, encoding: 'utf8' });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('parseInitArgs accepts only the v0 init shorthand', () => {
  const parsed = parseInitArgs([
    'https://example.com/',
    '--run-dir', 'runs/example',
    '--slug', 'example',
    '--viewport', '1280x800',
    '--viewport', 'mobile=390x844',
    '--primary-viewport', 'mobile',
    '--output-dir', 'out/example',
    '--mode', 'automated',
  ]);

  expect(parsed.url).toBe('https://example.com/');
  expect(parsed.viewports).toEqual(['1280x800', 'mobile=390x844']);
  expect(parsed.mode).toBe('automated');
  expect(() => parseInitArgs(['https://example.com/', '--no-open'])).toThrow(/Unknown init option: --no-open/);
  expect(() => parseInitArgs(['https://example.com/', '--runs-dir', 'runs'])).toThrow(/Unknown init option: --runs-dir/);
});

test('asset policy defaults to safe skips and explicit overrides persist in config', () => {
  const cwd = tempDir();
  const defaults = resolveRunConfig({
    url: 'https://example.com/',
  }, { cwd, now: new Date('2026-06-17T12:00:00.000Z') });

  expect(defaults.yoink.assets).toEqual({
    file: { mode: 'skip', root: null },
    crossOrigin: { mode: 'skip' },
    strictSkippedAssets: false,
    maxBytes: 10_000_000,
  });

  const root = path.join(cwd, 'trusted-assets');
  const override = resolveRunConfig({
    url: 'https://example.com/',
    allowFileAssets: true,
    fileAssetRoot: root,
    fetchPublicCrossOriginAssets: true,
    strictSkippedAssets: true,
  }, { cwd, now: new Date('2026-06-17T12:00:00.000Z') });

  expect(override.yoink.assets).toEqual({
    file: { mode: 'allow', root },
    crossOrigin: { mode: 'fetch-public-https' },
    strictSkippedAssets: true,
    maxBytes: 10_000_000,
  });
  expect(() => resolveRunConfig({
    url: 'https://example.com/',
    allowFileAssets: true,
  }, { cwd })).toThrow(/--allow-file-assets requires --file-asset-root/);
  expect(() => resolveRunConfig({
    url: 'https://example.com/',
    fileAssetRoot: root,
  }, { cwd })).toThrow(/--file-asset-root requires --allow-file-assets/);
});

test('viewport shorthand resolves default, named, unnamed, and duplicate ids', () => {
  expect(resolveViewports([])).toEqual([
    { id: 'desktop', width: 1280, height: 800 },
  ]);

  expect(resolveViewports([
    '1280x800',
    'desktop=1440x900',
    '700x900',
    '390x844',
    'mobile=375x812',
    '700x700',
  ])).toEqual([
    { id: 'desktop', width: 1280, height: 800 },
    { id: 'desktop-2', width: 1440, height: 900 },
    { id: 'tablet', width: 700, height: 900 },
    { id: 'mobile', width: 390, height: 844 },
    { id: 'mobile-2', width: 375, height: 812 },
    { id: 'tablet-2', width: 700, height: 700 },
  ]);
});

test('resolved config records deterministic and explicit run directories', () => {
  const cwd = tempDir();
  const now = new Date('2026-06-17T12:00:00.000Z');
  const deterministic = resolveRunConfig({
    url: 'https://Example.com/work/hero?ref=1',
    slug: 'Launch Page',
  }, { cwd, now });

  expect(deterministic.runDir).toBe(path.join(cwd, 'yoink-runs', 'example.com', '2026-06-17-launch-page'));
  expect(deterministic.targetUrl).toBe('https://example.com/work/hero?ref=1');
  expect(deterministic.primaryViewport).toBe('desktop');
  expect(deterministic.outputDir).toBe(path.join(deterministic.runDir, 'out'));
  expect(deterministic.implement.projectPath).toBe(deterministic.outputDir);

  const explicit = resolveRunConfig({
    url: 'https://example.com/',
    runDir: 'my-run',
    outputDir: 'my-output',
  }, { cwd, now });

  expect(explicit.runDir).toBe(path.join(cwd, 'my-run'));
  expect(explicit.outputDir).toBe(path.join(cwd, 'my-output'));
});

test('primary viewport defaults to the first configured viewport and must exist', () => {
  const cwd = tempDir();
  const now = new Date('2026-06-17T12:00:00.000Z');

  const config = resolveRunConfig({
    url: 'https://example.com/',
    viewports: ['mobile=390x844', '1280x800'],
  }, { cwd, now });

  expect(config.primaryViewport).toBe('mobile');
  expect(resolveRunConfig({
    url: 'https://example.com/',
    viewports: ['mobile=390x844', '1280x800'],
    primaryViewport: 'desktop',
  }, { cwd, now }).primaryViewport).toBe('desktop');
  expect(() => resolveRunConfig({
    url: 'https://example.com/',
    viewports: ['mobile=390x844'],
    primaryViewport: 'desktop',
  }, { cwd, now })).toThrow(/Primary viewport "desktop" does not reference a configured viewport/);
});

test('init writes only config and minimal Page model shell', () => {
  const cwd = tempDir();
  const runDir = path.join(cwd, 'runs', 'explicit');
  const outputDir = path.join(cwd, 'out', 'example');
  const result = runInit(cwd, [
    'https://example.com/products/',
    '--run-dir', runDir,
    '--viewport', '390x844',
    '--viewport', 'desktop=1280x800',
    '--primary-viewport', 'desktop',
    '--output-dir', outputDir,
    '--mode', 'automated',
  ]);

  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(runDir);
  expect(path.isAbsolute(result.stdout.trim())).toBe(true);

  const entries = fs.readdirSync(runDir).sort();
  expect(entries).toEqual(['00-config.json', 'page-model.json']);

  const config = readJson(path.join(runDir, '00-config.json'));
  expect(config).toMatchObject({
    schemaVersion: 1,
    runDir,
    targetUrl: 'https://example.com/products/',
    scope: 'page',
    viewports: [
      { id: 'mobile', width: 390, height: 844 },
      { id: 'desktop', width: 1280, height: 800 },
    ],
    primaryViewport: 'desktop',
    outputDir,
    yoink: { mode: 'automated' },
    implement: { targetStack: 'house', projectPath: outputDir, checkIns: true },
  });

  const pageModel = readJson(path.join(runDir, 'page-model.json'));
  expect(pageModel).toEqual({
    schemaVersion: 1,
    source: { url: 'https://example.com/products/' },
    viewports: config.viewports,
    pages: {
      home: {
        path: '/products/',
        dimensions: {},
        regions: [],
      },
    },
    captures: [],
    notes: [],
    exceptions: [],
  });
});

test('init command creates the deterministic run directory when no explicit run dir is supplied', () => {
  const cwd = tempDir();
  const today = new Date().toISOString().slice(0, 10);
  const expectedRunDir = path.join(cwd, 'yoink-runs', 'example.com', `${today}-custom`);

  const result = runInit(cwd, ['https://example.com/landing', '--slug', 'custom']);

  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(expectedRunDir);
  expect(fs.existsSync(path.join(expectedRunDir, '00-config.json'))).toBe(true);
  expect(fs.existsSync(path.join(expectedRunDir, 'page-model.json'))).toBe(true);
});

test('init fails clearly when the run directory already exists without overwriting evidence', () => {
  const cwd = tempDir();
  const runDir = path.join(cwd, 'runs', 'existing');
  fs.mkdirSync(runDir, { recursive: true });
  const evidence = path.join(runDir, 'evidence.txt');
  fs.writeFileSync(evidence, 'keep me\n');

  const result = runInit(cwd, ['https://example.com/', '--run-dir', runDir]);

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/Run already exists/);
  expect(fs.readFileSync(evidence, 'utf8')).toBe('keep me\n');
  expect(fs.existsSync(path.join(runDir, '00-config.json'))).toBe(false);
  expect(fs.existsSync(path.join(runDir, 'page-model.json'))).toBe(false);
});
