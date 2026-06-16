#!/usr/bin/env bun
/* Unit tests for the assembler's spec-shaping helpers in bin/yoinkit:
 *
 *  (a) vendor de-rank  — third-party/injected animations (Shop Pay, Intercom,
 *      consent banners, chat widgets) are tagged and kept OUT of the signature
 *      tier, in the spec, with their source labeled.
 *  (b) drawSVG grouping — near-identical tweens on one ScrollTrigger collapse to
 *      a single counted entry instead of one row per path.
 *  (c) action label    — the preflight/failure label reflects the real action
 *      (hover/click), so a hover failure isn't reported as "scroll target".
 *
 * These are pure functions, so we require the CLI directly (its entrypoint is
 * guarded by require.main === module) and call them with hand-built map data. */
'use strict';

const assert = require('assert');
const path = require('path');

const {
  actionLabel,
  scrollTriggerAnimations,
  vendorAnimationMatch,
  tagVendorAnimations,
  renderAnimationsMarkdown,
} = require(path.join(__dirname, '..', 'bin', 'yoinkit'));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

/* ---------- (c) action label ---------- */

check('actionLabel: hover action and type both report "hover"', () => {
  assert.strictEqual(actionLabel('hover .work-card', 'hover', 'scroll target'), 'hover');
  assert.strictEqual(actionLabel(null, 'hover', 'scroll target'), 'hover');
});

check('actionLabel: click action reports "click"', () => {
  assert.strictEqual(actionLabel('click button.cta', 'click', 'scroll target'), 'click');
});

check('actionLabel: array/object actions resolve their verb', () => {
  assert.strictEqual(actionLabel(['wait 100', 'hover .x'], 'manual', 'scroll target'), 'hover');
  assert.strictEqual(actionLabel([{ command: 'click', selector: '.x' }], 'manual', 'scroll target'), 'click');
});

check('actionLabel: non-pointer captures fall back to the supplied label', () => {
  // A real scroll target (explicit scrollTarget, no pointer action) keeps the
  // generic label rather than borrowing an unrelated verb.
  assert.strictEqual(actionLabel(null, 'manual', 'scroll target'), 'scroll target');
  assert.strictEqual(actionLabel('scrollintoview .section', 'scroll', 'scroll target'), 'scroll target');
  assert.strictEqual(actionLabel('', undefined, 'target'), 'target');
});

/* ---------- (b) drawSVG grouping ---------- */

function drawSvgTrigger(i, count, duration) {
  return {
    i,
    trigger: 'div.stacked-cards__collection',
    start: 'top center',
    end: 'bottom center',
    scrub: 0,
    anims: Array.from({ length: count }, () => ({
      targets: ['path', 'path'],
      targetCount: 2,
      duration,
      ease: 'Power1.easeOut',
      props: { drawSVG: '0% 100%' },
    })),
  };
}

check('grouping: near-identical drawSVG tweens collapse to one counted entry', () => {
  const animations = scrollTriggerAnimations({ scrollTriggers: [drawSvgTrigger(3, 4, 0.75)] }, []);
  assert.strictEqual(animations.length, 1, 'four identical path tweens should yield one row');
  const [entry] = animations;
  assert.strictEqual(entry.count, 4);
  assert.strictEqual(entry.layers, 8, 'layers should sum the per-tween target counts (4 x 2)');
  assert.match(entry.label, /scroll motion \(×4\)/);
  assert.match(entry.notes, /4 near-identical registry tweens grouped/);
  // Stable id: keyed off the first anim in the group, so single-tween output is
  // byte-identical to the pre-grouping behavior.
  assert.strictEqual(entry.id, 'scrolltrigger-3-0-path');
});

check('grouping: distinct targets/durations stay separate', () => {
  const st = {
    i: 2,
    trigger: 'div.about__tile',
    scrub: 0,
    anims: [
      { targets: ['div.rotate-circle__list'], targetCount: 2, duration: 1.47, ease: 'linear', props: { rotate: 360 } },
      { targets: ['div.rotate-circle__image'], targetCount: 8, duration: 1.47, ease: 'linear', props: { rotate: 360 } },
    ],
  };
  const animations = scrollTriggerAnimations({ scrollTriggers: [st] }, []);
  assert.strictEqual(animations.length, 2, 'different targets must not be merged');
  assert.ok(animations.every(a => a.count === 1));
});

check('grouping: a single tween is unchanged (no count suffix, layers preserved)', () => {
  const st = { i: 1, trigger: 'footer', scrub: true, anims: [{ targets: ['div.sun'], targetCount: 1, duration: 1.47, ease: 'none', props: { yPercent: 50 } }] };
  const [entry] = scrollTriggerAnimations({ scrollTriggers: [st] }, []);
  assert.strictEqual(entry.count, 1);
  assert.strictEqual(entry.layers, 1);
  assert.doesNotMatch(entry.label, /×/);
  assert.doesNotMatch(entry.notes, /grouped/);
});

/* ---------- (a) vendor de-rank ---------- */

check('vendorAnimationMatch: Shop Pay shimmer is recognized by keyframe and selector', () => {
  assert.match(
    vendorAnimationMatch({ id: 'css-loop-0-acceleratedcheckoutloadingskeleton-div-wallet-cart-button' }),
    /Shop Pay/,
  );
  assert.match(vendorAnimationMatch({ selector: 'div.wallet-cart-button__skeleton' }), /Shop Pay/);
});

check('vendorAnimationMatch: other known vendors match; real site motion does not', () => {
  assert.match(vendorAnimationMatch({ id: 'css-loop-intercom-launcher' }), /Intercom/);
  assert.match(vendorAnimationMatch({ selector: '#onetrust-banner-sdk' }), /OneTrust/);
  assert.strictEqual(vendorAnimationMatch({ id: 'scrolltrigger-2-0-div-hero', selector: 'div.hero__title' }), null);
});

check('rendering: tagged vendor animation is excluded from signature and labeled', () => {
  const spec = {
    meta: { url: 'https://shop.example/' },
    patterns: [],
    unspecced: [],
    animations: [
      {
        id: 'css-loop-0-acceleratedcheckoutloadingskeleton-div-wallet-cart-button-skeleton',
        label: 'Wallet cart button skeleton CSS loop',
        selector: 'div.wallet-cart-button__skeleton',
        trigger: 'load',
        mechanism: 'CSS keyframes',
        layers: 1,
        confidence: 'measured',
        lead: { duration: '4s infinite', ease: 'ease' },
      },
      {
        id: 'css-hover-0-a-social',
        label: 'Social link hover',
        selector: 'a.social',
        trigger: 'hover',
        mechanism: 'opacity',
        layers: 1,
        confidence: 'unknown - verify',
        lead: { duration: '0.25s', ease: 'ease-out' },
      },
    ],
  };
  tagVendorAnimations(spec);
  assert.strictEqual(spec.animations[0].vendor, 'Shopify Shop Pay / accelerated checkout');
  assert.match(spec.animations[0].notes, /de-ranked from the signature tier/);

  const md = renderAnimationsMarkdown(spec);
  const sig = md.slice(md.indexOf('## Signature moments'), md.indexOf('## Patterns'));
  assert.ok(!/acceleratedcheckout/i.test(sig), 'Shop Pay must not appear in the signature tier');
  const vendorSection = md.slice(md.indexOf('## Third-party / vendor'));
  assert.match(vendorSection, /Shopify Shop Pay/);
  assert.match(vendorSection, /excluded from signature/);
});

console.log(`\n${passed} spec-shaping assertions passed.`);
