#!/usr/bin/env node
/* Unit test for the engine's matrix decoder (window.__cap._decodeTransform).
 *
 * Pure math, no browser: the single engine file is loaded in a vm context with
 * minimal browser shims so we can call decodeTransform directly. The point is
 * the degenerate-scale rotation guard — a collapsed axis must NOT decode to a
 * spurious rotation, while a genuine rotation must still decode correctly. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENGINE = path.join(__dirname, '..', 'extension', 'capture-animation.js');
const src = fs.readFileSync(ENGINE, 'utf8');

// Just enough of a browser for the engine's top-level code to load. None of
// these are exercised by decodeTransform itself.
const noop = () => {};
const ctx = {
  console,
  setInterval: () => 0,
  clearInterval: noop,
  setTimeout: () => 0,
  clearTimeout: noop,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  performance: { now: () => 0 },
  getComputedStyle: () => ({}),
  document: { documentElement: {}, body: {}, addEventListener: noop,
              querySelectorAll: () => [], createElement: () => ({ style: {} }) },
  CSS: { escape: s => String(s) },
};
ctx.window = ctx;            // engine uses both `window.x` and bare globals
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: ENGINE });

const decode = ctx.window.__cap._decodeTransform;
if (typeof decode !== 'function') {
  console.error('FAIL: __cap._decodeTransform not exposed');
  process.exit(1);
}

let failures = 0;
function approx(a, b, eps = 0.05) { return Math.abs(a - b) <= eps; }
function check(name, cond, detail) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { failures++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

// 1) Collapsed scaleX (matrix(0,0,0,1,0,0)): scaleX 0, scaleY 1, NO rotation.
const collapsed = decode('matrix(0,0,0,1,0,0)');
check('collapsed scaleX ~ 0', approx(collapsed.scaleX, 0), JSON.stringify(collapsed));
check('collapsed scaleY ~ 1', approx(collapsed.scaleY, 1), JSON.stringify(collapsed));
check('collapsed rotate suppressed to 0', collapsed.rotate === 0, JSON.stringify(collapsed));

// 1b) The same axis with realistic browser float residuals must still yield 0,
// not the amplified ~90deg the un-guarded atan2 produced.
const noisy = decode('matrix(1e-16, 2e-16, -3e-17, 1, 0, 0)');
check('collapsed-with-residuals rotate suppressed to 0', noisy.rotate === 0, JSON.stringify(noisy));

// 2) Genuine 90deg rotation at unit scale: guard must NOT fire.
const rot = decode('matrix(0,1,-1,0,0,0)');
check('real rotation scaleX ~ 1', approx(rot.scaleX, 1), JSON.stringify(rot));
check('real rotation scaleY ~ 1', approx(rot.scaleY, 1), JSON.stringify(rot));
check('real rotation decodes to 90', approx(rot.rotate, 90), JSON.stringify(rot));

// 3) A genuine small-but-non-collapsed scale with rotation must survive: a 45deg
// rotation uniformly scaled to 0.01 (well above the 1e-3 epsilon).
const s = 0.01, ang = Math.PI / 4;
const small = decode(`matrix(${s * Math.cos(ang)},${s * Math.sin(ang)},${-s * Math.sin(ang)},${s * Math.cos(ang)},0,0)`);
check('small-scale rotation preserved', approx(small.rotate, 45), JSON.stringify(small));

// 4) 3D: an X column made of float residuals (collapsed scaleX, magnitude
//    ~2e-16) normalizes to a garbage unit column — un-guarded this decodes to a
//    bogus rotateY/rotateZ. The guard must suppress both. matrix3d is
//    column-major: X col (residuals), Y col (0,1,0), Z col (0,0,1).
const m3d = decode('matrix3d(1e-16,2e-16,1e-16,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)');
check('3d collapsed scaleX ~ 0', approx(m3d.scaleX, 0), JSON.stringify(m3d));
check('3d collapsed rotateY suppressed', m3d.rotateY === 0, JSON.stringify(m3d));
check('3d collapsed rotateZ suppressed', m3d.rotateZ === 0, JSON.stringify(m3d));
// And a real 3D rotation (90deg about Z, unit scale) must still decode.
const m3dRot = decode('matrix3d(0,1,0,0, -1,0,0,0, 0,0,1,0, 0,0,0,1)');
check('3d real rotateZ decodes to 90', approx(Math.abs(m3dRot.rotateZ), 90), JSON.stringify(m3dRot));

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log('\ndecode-transform: all assertions passed');
