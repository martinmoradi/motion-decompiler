#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv[2];

if (!arg) {
  fail('Usage: node skill/subslice/scripts/resolve-subslice.mjs <subslice-id-or-report-path>');
}

const repoRoot = process.cwd();
const reportsRoot = path.join(repoRoot, 'audit', 'impeccable', 'reports');
const sourceRoot = path.join(repoRoot, 'audit', 'impeccable', 'source');

if (!fs.existsSync(reportsRoot)) {
  fail(`Reports root not found: ${rel(reportsRoot)}`);
}

const leaf = resolveLeaf(arg);
const dir = path.dirname(leaf);
const parent = path.join(dir, `${path.basename(dir)}.md`);

if (!fs.existsSync(parent)) {
  fail(`Parent overview not found for ${rel(leaf)}: expected ${rel(parent)}`);
}

if (!fs.existsSync(sourceRoot)) {
  fail(`Source root not found: ${rel(sourceRoot)}`);
}

const note = path.join(reportsRoot, '_subslice-notes', path.basename(leaf));

process.stdout.write(JSON.stringify({
  id: inferId(leaf),
  leaf: rel(leaf),
  parent: rel(parent),
  sourceRoot: rel(sourceRoot),
  note: rel(note),
}, null, 2) + '\n');

function resolveLeaf(input) {
  const maybePath = path.resolve(repoRoot, input);
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isFile()) {
    return maybePath;
  }

  const candidates = listMarkdown(reportsRoot)
    .filter(file => path.basename(file).startsWith(`${input}-`));

  if (candidates.length === 0) {
    fail(`No subslice report matched ${input}`);
  }

  if (candidates.length > 1) {
    fail([
      `Ambiguous subslice id ${input}. Matches:`,
      ...candidates.map(file => `- ${rel(file)}`),
    ].join('\n'));
  }

  return candidates[0];
}

function listMarkdown(root) {
  const out = [];
  walk(root, out);
  return out.filter(file => file.endsWith('.md') && !file.includes(`${path.sep}_subslice-notes${path.sep}`));
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function inferId(file) {
  const match = path.basename(file).match(/^([0-9]+[a-z]?)-/);
  return match ? match[1] : path.basename(file, '.md');
}

function rel(file) {
  return path.relative(repoRoot, file);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
