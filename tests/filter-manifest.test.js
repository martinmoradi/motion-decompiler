#!/usr/bin/env node
'use strict';
/*
 * filter-manifest.js coverage — pure selection, no browser.
 * Focus: --grep validation (a bare --grep must not become /true/i; an invalid
 * regex must fail cleanly) plus the happy --ids / --grep paths.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skill', 'codex', 'scripts', 'filter-manifest.js');
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed += 1; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-manifest-test-'));
const inFile = path.join(dir, 'manifest.proposed.json');
fs.writeFileSync(inFile, JSON.stringify({
  url: 'https://example.test/', viewport: [1280, 800], captureStrategy: 'reuse-page',
  captures: [
    { id: 'hero-load', type: 'boot', root: 'h1' },
    { id: 'work-card-hover', type: 'hover', root: 'a.card' },
  ],
}));

function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

// --grep with no value: parseArgs would make it `true`; must fail, not match all.
{
  const outFile = path.join(dir, 'a.json');
  const r = run(['--in', inFile, '--out', outFile, '--grep']);
  ok('bare --grep fails (exit 2)', r.status === 2);
  ok('bare --grep names the problem', /--grep needs a regex value/.test(r.stderr));
  ok('bare --grep writes no output', !fs.existsSync(outFile));
}

// Invalid regex: clean error, not a thrown stack.
{
  const outFile = path.join(dir, 'b.json');
  const r = run(['--in', inFile, '--out', outFile, '--grep', '(']);
  ok('invalid regex fails (exit 2)', r.status === 2);
  ok('invalid regex reports cleanly', /invalid --grep regex/.test(r.stderr));
}

// Happy path: a real pattern selects matching captures.
{
  const outFile = path.join(dir, 'c.json');
  const r = run(['--in', inFile, '--out', outFile, '--grep', 'card']);
  ok('valid --grep succeeds', r.status === 0);
  const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  ok('valid --grep keeps the matching capture only', out.captures.length === 1 && out.captures[0].id === 'work-card-hover');
}

// Happy path: --ids exact match still works.
{
  const outFile = path.join(dir, 'd.json');
  const r = run(['--in', inFile, '--out', outFile, '--ids', 'hero-load']);
  ok('--ids succeeds', r.status === 0);
  const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  ok('--ids keeps the named capture', out.captures.length === 1 && out.captures[0].id === 'hero-load');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`filter-manifest.test.js: ${passed} checks passed`);
