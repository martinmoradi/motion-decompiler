# Assessment: is the script / prompt / flow improvable?

Written after a full end-to-end run against `https://mammothmurals.com/` (see `RUN-LOG.md`).
Style note: grounded in concrete friction hit during that run, with references to the
engine source (`extension/capture-animation.js`).

## Verdict

**This is not the ceiling.** The current flow reliably nails everything that is
CSS-readable or registry-bound (the 8 "measured" animations plus the 4 scrub
tweens, roughly half the surface). The other half gets captured with the *right
shape but soft numbers*. Two changes would convert most of the 7 "unknown-verify"
results into "measured," and only then do you hit genuine walls.

---

## The one high-leverage move: instrument GSAP, don't just sample the DOM

The approach today is black-box behavioral sampling. But this is a GSAP site, and
`map()` already proves the white-box path works: `easeName()` reads `tween.vars.ease`
straight off the registry for ScrollTrigger tweens (engine line ~359). That is why
the scrub parallax came back as exact `ease: none`, no capture, no guessing.

The reason hover/reveal eases came back `unknown (rAF/JS) — verify` is only that
those tweens are created on the event, after `map()` ran, so they were never in the
registry when I looked. The fix: since `--init-script` runs at document-start, wrap
`gsap.to/from/fromTo/timeline` (poll for `window.gsap`, or trap it with a setter)
and log every tween's `{targets, ease.name, duration, stagger, vars}` as it is
created. A hover capture then cross-references the DOM diff against the tween that
just fired and pulls the **exact** ease name and duration instead of inferring them.

For a Webflow/GSAP site that single change would have turned the hero reveal, the
char-roll links, the CTA wheel, and the work-cover crossfade from "verify" into
measured. It does nothing for canvas or pure-CSS (CSS is already readable), but it
directly attacks the largest bucket of uncertainty. Highest impact, real
engineering effort.

---

## Engine: smaller wins that are clearly reliable

Ordered by value-to-effort, from what actually bit me:

1. **Stop throwing away non-lead layers.** `dump()` collapses to
   `[findings[0], {note}]` whenever it sees a stagger (line ~472). That is a pure
   presentation choice, and it cost me real data twice: the work-card clip/overlay
   and the accordion height/icon were computed in `analyze()` and then discarded,
   so I had to re-read computed style by hand. Keep `findings` complete and put the
   stagger summary *alongside* it, not in place of it. Trivial change, removes a
   whole class of manual workaround.

2. **Infer easing from the timeline you already have.** The raw frames in
   `analyze()` (before the 12-point downsample) are a clean progress curve. The
   hero was `166→123→88→48→26→17→9→2.6→0`, which fits expo.out almost perfectly.
   Normalize progress to [0,1], least-squares against a small set of named eases and
   cubic-beziers, and emit `inferred: expo.out (R²=0.99)` instead of `unknown`.
   This is how easing-extractors work; it is reliable for monotonic single-prop
   tweens. It is the cheaper cousin of the GSAP-instrumentation idea and stacks with
   it (one confirms the other).

3. **`resolve()` should prefer the first *visible* match.** My two failed captures
   (navbar button, generic link) were both "first match is `display:none` or
   off-screen." `resolve()` takes first match blindly. Make it prefer a match with a
   non-zero box that is not `display:none`. That one tweak would have removed my
   longest debugging detour.

4. **Unique selectors.** `cssPath()` emits tag + first two classes (line ~335), so
   the spec hands a downstream agent `div.lines-split` and `div.g_btn_container`,
   which match dozens of elements. The schema field literally says "how to LOCATE
   it" and it often can't. Emit a disambiguated locator (ancestor chain or
   `:nth-of-type`, or a `data-*`/id when present) next to the pretty one.

5. **Report why recording stopped.** Continuous effects (marquee, the crossfade
   slideshow, the partners drift) have no natural settle, so they hit either
   `MAX_MS` or a coincidental 220ms gap, and the sample can be partial or
   misleading. Exposing `terminationReason: settled | capped` plus "did it return to
   baseline" lets the assembler label loop-vs-one-shot honestly instead of me
   probing by hand (which is exactly what I had to do for the wordmark).

6. **Capture the reverse direction.** Hover-out, accordion-close, and scroll-back
   are frequently asymmetric (different ease, different duration). Today only the
   "in" direction exists. A `direction` option or a second listener on mouseleave
   would catch it.

---

## Prompt and flow

The prompt is genuinely good and clearly battle-tested. The eval double-wrap,
IIFE-via-tempfile, headed-browser justification, and selector-not-coordinates rules
all saved time. The gaps are smaller:

- **Promote the load-reveal recipe.** The prompt says load reveals are hard,
  capture them structurally. They are not as hard as stated: reload, then race-arm
  `scan(trigger:manual)` within a few hundred ms (a transition loader buys the
  window), and you catch the whole thing. I got the hero reveal this way. That
  technique deserves to be a documented recipe with its caveat, not something each
  runner rediscovers.
- **Warn that first-match may be hidden,** and suggest checking visibility before
  hover/click. Pairs with the `resolve()` fix above.
- **Add an optional second viewport pass.** The mobile menu and its char-stagger
  reveals are `display:none` at 1280px, so they are uncapturable at desktop, full
  stop. For a "comprehensive" claim, a 390px pass is the only way to reach them.
- **Acknowledge the stagger-collapse workaround** (read open/hovered computed style
  directly) until the engine stops discarding layers.
- **Flag velocity-driven effects as a thing to probe, not sample.** A single scan
  during a scroll made the wordmark look like a fixed `x→-242px` translation. Only
  after reading idle-vs-moving state do you see it is scroll-velocity reactive.
  Without that instinct a runner would mis-spec it confidently.

---

## The genuine ceilings (where more effort stops paying)

Real walls for a computed-style sampler, worth naming so nobody over-invests:

- **Canvas / WebGL.** Opaque to style sampling by definition. Correctly already
  `unreadable`. Cracking it means pixel-diffing or shader inspection, a different
  tool.
- **matrix3d rotation.** Decomposition is mathematically ambiguous (factorization
  order, gimbal). `_approx3d` is honestly the best recoverable from a matrix.
  Translate/scale stay exact.
- **Exact custom eases.** Curve-fitting gets you "looks like expo.out," but a
  `CustomEase`/`CustomBounce` cannot be recovered by name from behavior. GSAP
  instrumentation fixes this where the site uses named eases; bespoke ones stay
  approximate.
- **Stateful / physics / input-driven** (Draggable, Observer inertia, anything tied
  to logged-in or modal state). Not a fixed timeline, so "the spec" is a model, not
  a recording.

---

## Bottom line

Within the current black-box approach you are close to its ceiling on the
*behavioral* side: selectors, stagger fidelity, visible-match resolution, and
easing-fit are polish that would make it more reliable but not fundamentally
smarter. The move that actually raises the ceiling is white-box GSAP
instrumentation, because it replaces inference with measurement for the exact
category (event-bound GSAP tweens) that produced almost all of the "verify" flags.
After that, what is left (canvas, true 3D rotation, custom eases, stateful
interactions) is genuinely hard and probably not worth chasing with this tool.

If I had the next hour: keep-full-findings and visible-match `resolve()` first
(cheap, removes the two worst detours), then the GSAP tween logger (expensive, but
it is the thing that changes the answer).
