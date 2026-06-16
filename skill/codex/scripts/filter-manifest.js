#!/usr/bin/env node
'use strict';
/*
 * filter-manifest.js — narrow a proposed manifest to the captures a TARGETED
 * /motion-decompiler request asked about, preserving every top-level field
 * (url, viewport, captureStrategy, captureGroups, wait settings) so the filtered
 * manifest captures identically — just fewer animations.
 *
 *   node filter-manifest.js --in manifest.proposed.json --out manifest.targeted.json \
 *        --ids "hero-load,hero-headline-reveal"
 *   node filter-manifest.js --in ... --out ... --grep "hero|headline"
 *
 * --ids matches capture.id exactly (comma list). --grep matches a regex against a
 * capture's id + root/selector/target + group + label. At least one of the two is
 * required. This is pure selection (no measurement); the engine still measures
 * whatever survives.
 */

const fs = require('fs');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
  }
  return out;
}

function die(msg) { process.stderr.write(`filter-manifest: ${msg}\n`); process.exit(2); }

const args = parseArgs(process.argv.slice(2));
if (!args.in || !args.out) die('usage: --in <manifest> --out <manifest> (--ids a,b | --grep regex)');
if (!args.ids && !args.grep) die('need --ids or --grep to select captures');
// parseArgs sets a value-less flag to `true`; a bare `--grep` would otherwise
// become the bogus pattern /true/i. Require an explicit pattern.
if (args.grep === true) die('--grep needs a regex value, e.g. --grep "hero|headline"');

const manifest = JSON.parse(fs.readFileSync(args.in, 'utf8'));
const captures = Array.isArray(manifest.captures) ? manifest.captures : [];

const idSet = args.ids ? new Set(String(args.ids).split(',').map(s => s.trim()).filter(Boolean)) : null;
let re = null;
if (args.grep) {
  try { re = new RegExp(String(args.grep), 'i'); }
  catch (e) { die(`invalid --grep regex: ${e.message}`); }
}

function haystack(c) {
  return [c.id, c.root, c.selector, c.target, c.group, c.label, c.action]
    .filter(v => typeof v === 'string').join(' ');
}

const kept = captures.filter((c) => {
  if (idSet && c.id && idSet.has(c.id)) return true;
  if (re && re.test(haystack(c))) return true;
  return false;
});

if (!kept.length) die(`no captures matched (${captures.length} in the manifest). Check --ids/--grep against manifest.proposed.json.`);

const filtered = Object.assign({}, manifest, { captures: kept });
fs.writeFileSync(args.out, `${JSON.stringify(filtered, null, 2)}\n`);
process.stdout.write(`kept ${kept.length}/${captures.length} captures: ${kept.map(c => c.id).join(', ')}\n`);
