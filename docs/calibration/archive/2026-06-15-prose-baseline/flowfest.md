# Calibration: flowfest.co.uk

Full scout + decompile pass on a non-Mammoth site, to test whether
motion-decompiler generalizes beyond mammothmurals.com. No source files were
tuned for this site.

- **Date:** 2026-06-15
- **Target:** https://www.flowfest.co.uk/
- **Session:** `AGENT_BROWSER_SESSION=motion-claude-flowfest`
- **Driver:** repo wrapper `bin/capture-browser` (headed agent-browser), not raw.

## Result summary

| Field | Value |
| -- | -- |
| Run directory | `runs/www.flowfest.co.uk/2026-06-15-claude-flowfest-2` |
| Smoke result | `ok: true`, 21/21 checks pass, exit 0 |
| `node --check` engine + CLI | both OK |
| Stack detected | GSAP, ScrollTrigger, Lenis, Webflow, jQuery |
| Proposed captures | 9 |
| Capture results | 9 |
| Timelines written | 5 |
| Animations in spec | 48 (measured: 32, unknown/verify: 16) |
| Pipeline hard-fail | no - completed end to end |

### Capture status counts

| Status | Count | Captures |
| -- | -- | -- |
| ok | 1 | css-hover-a-btn-w-inline-block |
| check | 1 | scroll-0-div-welcome-col-sun |
| empty | 3 | boot-load-reveals, link-hover, misc-hover |
| error | 4 | accordion-click, css-hover-div-modal-yt-card, css-hover-button-btn, primary-button-hover |
| skipped | 0 | - |

The 4 errors were recorded as `status:"error"` with a human-readable reason and
the run continued to completion. This is exactly the soft-fail behavior the
calibration was meant to exercise, and it held.

## Top 8 signature animations (from animations.md)

1. **Btn w inline block CSS hover** - hover, transform, 1 layer, 0.25s,
   cubic-bezier(0.625, 0.05, 0, 1), confidence measured. **Live captured**
   (y 0->3.56px).
2. **Welcome col sun scroll callback reveal** - scroll-reveal, transform
   (rotate 2.9->4.4deg), 1 layer, 1.58s, ease unknown (rAF/JS), confidence
   unknown/verify. **Live captured** (49 frames).
3. **Rotate circle image scroll motion** - scroll, transform, 8 layers, 1.47s,
   linear, measured. From GSAP ScrollTrigger registry (`map.json#scrollTriggers[2]`).
4. **Rotate circle list scroll motion** - scroll, transform, 2 layers, 1.47s,
   linear, measured. Registry.
5. **Path scroll motion** (scrolltrigger-3-0-path) - scroll, drawSVG, 2 layers,
   0.75s, Power1.easeOut, measured. Registry.
6. **Path scroll motion** (scrolltrigger-3-1-path) - scroll, drawSVG, 0.75s,
   Power1.easeOut, measured. Registry.
7. **Path scroll motion** (scrolltrigger-3-2-path) - scroll, drawSVG, 0.75s,
   Power1.easeOut, measured. Registry.
8. **Path scroll motion** (scrolltrigger-3-3-path) - scroll, drawSVG, 0.75s,
   Power1.easeOut, measured. Registry.

Other notable spec entries beyond the top 8: a scroll-scrubbed sun motion
(scrolltrigger-1, registry tween 1.47s), two CSS keyframe loops
(`rotateSun` 0.5s infinite linear, `marquee` translateX 25.64s infinite
linear), and CSS hover groups at 0.25s/0.5s with the site's signature
cubic-bezier(0.625, 0.05, 0, 1) ease.

## Where the spec richness comes from

Only 2 of 9 captures produced live findings, yet the spec lists 48 animations.
The other ~46 come from the **map**, not from live capture: the engine read the
GSAP ScrollTrigger registry (scrub tweens, drawSVG path reveals with real
durations and eases), CSS `@keyframes` loops, CSS hover transition groups, and
structurally-detected split-reveal hosts. Those are marked "measured" because
the values came from the GSAP registry / computed CSS, not from frame sampling.
This is the tool's strongest generalization signal: even when live capture is
thin, the map alone yields a usable, mostly-measured spec on a GSAP/Webflow
site.

## Failed and empty captures, with likely reasons

### Errors (preflight refused before any timeline) - 4

- **accordion-click** - "selector center is covered by div.accordion-css__item-top".
  Planner armed on `div.accordion-css__item-icon` but set the action to
  `click div.accordion-css__item-bottom-content` (the collapsed body), which
  sits behind the header. Preflight hittability correctly refused. The click
  should target the header/icon, not the collapsible content.
- **css-hover-div-modal-yt-card** - "selector matched no visible elements". The
  YouTube modal card only exists/visible once a modal is opened; at rest it is
  hidden. Site-specific.
- **css-hover-button-btn** - "selector center is covered by div.stack-cards__card".
  `button.btn` sits under an overlapping stacked card (stack-cards layout).
  Preflight correctly refused. Site-specific overlap.
- **primary-button-hover** (`div.btn__bar`) - "selector matched no visible
  elements". The bar element is present in the map but not visible at rest
  (likely a zero-size / hidden inner affordance). Site-specific.

All four are good outcomes: preflight caught covered/invisible/hidden targets,
recorded a precise reason, and the run kept going.

### Empties (capture ran, zero movement measured) - 3

- **boot-load-reveals** - the two split-reveal hosts (`speakers__grid-lines`,
  `community__grid-lines`) are **scroll-triggered**, not load-triggered. The
  boot recorder armed before page JS but those reveals never fire on load, so it
  saw nothing. The hosts are still surfaced structurally under "Needs verify".
- **link-hover** (`div.underline-link`, nav "About") - the engine sampled 9
  properties (transform, opacity, filter, clipPath, backgroundPosition,
  backgroundColor, color, height, width) and saw zero change. The underline is
  almost certainly a `::after` pseudo-element (scaleX / background-size), which
  the sampler does not read. Real effect, invisible to the engine.
- **misc-hover** (`a.marquee-css__a`) - marquee link inside a continuous CSS
  loop (already captured as `css-loop-1`). The hover produces no per-element
  computed-style delta in the window, likely pseudo-element or no distinct hover
  transform.

## Did the output feel useful for recreating the site's motion?

Yes, for the structural/scroll motion, which is the bulk of this site's
character. A coding agent could rebuild from this spec:

- the scroll-scrubbed sun rotation (measured from/to + 49-frame timeline),
- the drawSVG path reveals (durations + Power1.easeOut from the registry),
- the rotate-circle scroll motion,
- the two CSS loops (sun spin, marquee) with exact durations,
- the button hover micro-motion (measured y-translate + exact cubic-bezier).

The gaps are honestly flagged. The accordion, the modal hover, and the split
reveals all land in "Needs verify" / "Failed" with reasons, rather than being
silently dropped or hallucinated. That honesty is what makes the artifact
trustworthy. What is missing for a faithful rebuild: the split-reveal
choreography (stagger/direction) and any pseudo-element hover detail, both of
which need a different recipe than the planner chose.

## Generic product issues vs site-specific weirdness

**Generic product issues (would recur on other sites):**

- **Pseudo-element hover effects are invisible to the sampler.** Underline-on-hover
  links are extremely common; `link-hover` came back empty for this reason. This
  is a real coverage gap, not a flowfest quirk.
- **Split reveals are assumed to fire on load.** The planner routes split-reveal
  hosts into a `boot` capture, but on a ScrollTrigger site they fire on scroll,
  so boot captures nothing. The planner should prefer a scroll-into-view recipe
  for split reveals when ScrollTrigger is present.
- **Accordion/toggle click target heuristic.** The planner clicked the
  collapsible body (`item-bottom-content`) instead of the visible toggle
  affordance, so preflight refused it. Picking the header/icon as the click
  target would generalize better.
- **Readiness heuristic false-positive.** page-state reported
  `timeout-loading - loading (div.loading-container)` for the map and several
  captures. Flowfest keeps a Webflow preloader element (`loading-container`) in
  the DOM after load, and the readiness check keys on it, so it reports the page
  as perpetually loading. Captures still proceeded (good resilience), but the
  signal is misleading and could mask a genuinely-not-ready page.
- **drawSVG path entries are listed one-per-path.** The spec emits ~20+ nearly
  identical "Path scroll motion" rows (0.75s / 0.5s Power1.easeOut). Grouping
  these by ScrollTrigger would make the spec easier to read; minor.

**Site-specific weirdness (flowfest-only):**

- Modal-only elements (`modal-yt__card`) hidden until a modal opens.
- Stacked-card overlap (`stack-cards__card` covering `button.btn`).
- A hidden/zero-size `btn__bar` inner element.

The 4 errors are all driven by site-specific DOM (covered or hidden elements),
and preflight handled them all correctly. The empties split into generic
(pseudo-element, split-reveal-on-load) and benign (marquee already captured as a
loop).

## Signs the planner is overfit to Mammoth?

**No literal overfit on this site.** `grep -rniE "g_faq_item|work_home|mammoth"`
over the entire run directory returned nothing. Every proposed selector is a
genuine flowfest class derived from the map (`welcome__col-sun`,
`accordion-css__item-icon`, `modal-yt__card`, `marquee-css__a`, `btn__bar`,
`underline-link`, etc.). The accordion plan used flowfest's own
`accordion-css__*` classes, not the Mammoth `g_faq_item` literal noted in prior
memory. So the hardcoded-Mammoth-selector concern did not bite here.

The remaining planner weaknesses are **heuristic**, not Mammoth-specific:
choosing the collapsible body over the toggle for accordions, and routing split
reveals to boot. Those would affect any site, Mammoth included.

## Source files modified

**None.** `git status --short` after the run is byte-identical to the
session-start snapshot:

```
 M README.md          (pre-existing, not mine)
 M bin/motion-decompile (pre-existing, not mine)
 M tests/run-smoke.sh  (pre-existing, not mine)
?? calibration-reports/ (this report)
?? prompt.md           (pre-existing)
```

The three `M` files were already modified before this run began (per the
session-start git snapshot) and I did not touch them. `runs/` is gitignored, so
the run artifacts do not appear. No engine, CLI, or test source was edited for
this calibration. Browser session was closed (no active sessions remain).
