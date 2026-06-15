# Calibration: ashleybrookecs.com

Date: 2026-06-15
Target: https://ashleybrookecs.com/
Goal: test whether motion-decompiler generalizes beyond mammothmurals.com, without tuning source for this site.
Mode: full planner-proposed manifest, no curation, soft-fail expected on bad selectors.

## Result summary

| Field | Value |
| -- | -- |
| Run directory | `runs/ashleybrookecs.com/2026-06-15-claude-ashleybrookecs` |
| Smoke test | PASS (exit 0, all 21 checks true) |
| Stack detected | GSAP, ScrollTrigger, Lenis, Webflow, jQuery |
| Proposed captures | 10 (plus 3 skipped at planning) |
| Capture results | 10 |
| ok / check / empty / error / skipped | 5 / 1 / 2 / 2 / 0 |
| Assembled animations | 107 |
| Timelines saved | 8 |
| Source files modified by me | none |

Map-level counts: 79 ScrollTriggers, 17 hover candidates, 2 CSS hover timing groups, 1 CSS loop, 7 split-reveal hosts.

The run completed cleanly. No hard fail. The two failed captures recorded `status:"error"` and the pipeline continued through the remaining captures, assembly, report, and browser close, exactly as the latest CLI is meant to behave.

## Per-capture outcome

| Status | ID | Type | Note |
| -- | -- | -- | -- |
| ok | boot-load-reveals | boot | 109 layers, 4.67s split reveal |
| check | scroll-57 services_home_heading_word_wrap | scroll-reveal | 4-item stagger y -144->0px, ~0ms apart, flagged verify |
| ok | loop-67 clients_logos_cms_list_wrapper | manual | 7-item logo loop, scale 0.928->1 + rotate 3.2->0deg |
| error | scroll-68 clients_names_text.u-cover-absolute | scroll-reveal | preflight: no visible elements |
| ok | css-hover nav-link.btn-animate-chars | hover | 5-char color stagger rgb(19,20,16)->rgb(246,61,24) |
| ok | css-hover demo-footer__bottom_link | hover | opacity 0.7->1, 0.5s cubic-bezier(0.19,1,0.22,1), measured |
| error | primary-button-hover button.clickable_btn | hover | preflight: no visible elements |
| ok | nav-link-hover span.nav-link__label | hover | 5-char color stagger, 0.77s |
| empty | link-hover a.clickable_link.w-inline-block | hover | hittable, but no motion on hover |
| empty | misc-hover a.nav-logo.u-column-span-5 | hover | hittable, but no motion on hover |

## Top 8 signature animations (from animations.md)

1. **Nav link btn animate chars CSS hover** (`css-hover-a-nav-link-btn-animate-chars`) - hover - color + transform - 7 layers - 0.77s (measured) - ease unknown (rAF/JS), verify.
2. **Nav link label h4 hover** (`nav-link-hover`) - hover - color + transform - 6 layers - 0.77s (measured).
3. **Boot/load split reveal** (`boot-load-reveals`) - boot - width + height + transform - 109 layers - 4.67s (measured).
4. **Demo footer bottom link CSS hover** (`css-hover-a-demo-footer-bottom-link-u-text-style-small`) - hover - opacity 0.7->1 - 1 layer - 0.5s - ease cubic-bezier(0.19,1,0.22,1) - confidence measured.
5. **Clients logos in-view loop** (`loop-67-div-clients-logos-cms-list-wrapper-w-dyn-list`) - manual - transform (scale + rotate) - 7 layers - 0.74s (measured).
6. **Services heading word-wrap scroll callback reveal** (`scroll-57-...`) - scroll-reveal - transform - 4 layers - 1.01s (measured).
7. **Char scroll motion** (`scrolltrigger-2-0-div-char`) - scroll - transform - 12 layers - 2.05s - ease expo.out - confidence measured.
8. **Word scroll motion** (`scrolltrigger-7-0-div-word`) - scroll - transform - 15 layers - 1.962s - ease expo.out - confidence measured.

Signatures 9-12 continue the same family (scrolltrigger 25/31/51/32: word and line scroll reveals, expo.out / scrubbed). Below the signature tier, the spec enumerates the full set of 79 ScrollTriggers with measured durations and named GSAP eases (expo.out, power1.inOut, power2.inOut, back.out, linear), a `drawSVG` path-draw sequence on the footer "Referrals" logo (8 segments), and `clipPath` reveals.

## Failed and empty captures, with likely reasons

- **scroll-68 `p.clients_names_text.u-cover-absolute` (error)** - preflight "matched no visible elements." This is an absolutely-positioned overlay text element that is hidden in its rest state and only revealed by a hover/scroll interaction on the clients list. It exists in map.json (the map records 10 callback-only ScrollTriggers, IDs 68-77, all on `clients_names_text`) but is not visible at capture time. The planner deduped that cluster to one capture, which then failed on visibility. Correct rejection, honestly recorded.
- **primary-button-hover `button.clickable_btn` (error)** - preflight "matched no visible elements." The element is in the map but not visible/hittable at the default scroll position (likely inside a CMS slider, off-canvas, or modal). Correct rejection.
- **link-hover `a.clickable_link.w-inline-block` (empty)** - preflight passed (6 matches, 5 visible, hittable at 819,400), real hover fired, but `__cap` recorded zero moved layers. The representative link in this cluster simply has no hover animation (or only a sub-threshold change). Not a driver failure; the candidate genuinely does not move.
- **misc-hover `a.nav-logo.u-column-span-5` (empty)** - same shape: the logo is hittable but has no hover motion. The "misc" bucket is a catch-all of leftover hover candidates, so an inert representative is expected here.

The single **check** (`scroll-57`) captured a real 4-item split-text stagger (y -144->0px) but is flagged "unknown (rAF/JS), verify" because the motion is JS-driven (GSAP callback) with no bound registry tween, so easing source cannot be attributed automatically.

## Was the output useful for recreating the site's motion?

Yes, substantially. A coding agent handed this run could reconstruct the large majority of the site's motion:

- **Scroll choreography is the strongest output.** map.json + animations.md enumerate all 79 ScrollTriggers with measured durations and named eases. The word/char/line split-reveal-on-scroll pattern (the site's dominant motion) is captured as a measured family with expo.out at ~1.5-2.3s. Scrub-bound triggers are labelled as scrub with registry tween durations. The SVG `drawSVG` logo and `clipPath` reveals are identified.
- **CSS hovers came through with measured from/to** (char color sweep rgb(19,20,16)->rgb(246,61,24) staggered ~16.7ms; footer link opacity 0.7->1 at 0.5s with the site's signature cubic-bezier(0.19,1,0.22,1)).
- **The load/intro reveal** was captured at boot (109 layers).

Caveats a rebuild agent should heed, all surfaced by the spec itself:
- Callback-driven timelines carry "unknown (rAF/JS), verify" easing; durations are measured but ease must be eyeballed.
- The boot capture's summary describes width/height deltas of split-text fragments (145.5px->134.7px) rather than the headline's reveal transform, which reads like it latched onto text reflow rather than the intended reveal. Worth a manual verify before trusting the boot timeline.
- Two interaction-gated elements and two inert hovers produced nothing, so those specific moments need a tighter selector or a stateful recipe.

## Generic product issues vs site-specific weirdness

Generic product issues (would recur on other sites):
1. **No pre-check that a hover candidate actually animates.** The dedup picks one representative per cluster; if that representative is inert (link-hover, the nav logo), the capture comes back empty. This is the known "no hover-hittability/animation pre-check" gap, here showing up as the dedup choosing a non-animating member.
2. **Planner proposes elements that the map saw but that are not visible at capture time.** Both errors are this: map.json records elements (including hidden overlays and off-canvas buttons), the planner proposes them, preflight then correctly rejects them. A visibility/animatability filter at planning time would convert these errors into either better selectors or up-front skips.
3. **Easing attribution for JS/GSAP-callback motion is "unknown, verify."** Honest, but a limitation of the measured path.
4. **Boot split-reveal capture can latch onto layout reflow** (width/height of split chars) instead of the reveal transform. Likely generic to split-text-heavy sites.

Site-specific weirdness:
1. ashleybrookecs leans hard on `u-cover-absolute` overlay text (`clients_names_text`) that is hidden until interaction, which is exactly what tripped scroll-68 and spawned 10 callback-only ScrollTriggers (68-77) that the planner correctly routed to "needs verify / capture."
2. `button.clickable_btn` not being visible at default scroll is a layout choice of this site.
3. Very high ScrollTrigger density (79) and a names-list hover reveal are this site's signature, not a tool issue.

## Signs the planner is overfit to Mammoth

No functional overfit was observed on this site. All 10 proposed captures were derived from ashleybrookecs's own selectors (Webflow CMS classes like `clients_logos_cms_list_wrapper`, `services_home_heading_word_wrap`, `nav-link__label`). No Mammoth token appears in any run artifact (grep for `mammoth|g_faq|faq_item|work_home_item` over the run dir returns nothing).

Residual Mammoth-specific traces remain in the planner source only, and all stayed dormant:
- `bin/motion-decompile:44-45` - usage doc examples still use Mammoth selectors (`a.work_home_item_link`, `div.g_faq_item.w-dyn-item`). Cosmetic.
- `bin/motion-decompile:1186` - a hover-scoring penalty regex hardcodes Mammoth class tokens (`g_btn_main`, `work_home_item_link`, `navbar_btn_default`, `services_home_cta`) alongside the generic `w-inline-block`. Only the generic `w-inline-block` touched this run (it penalized the link-hover candidate), and it did not change the outcome. The Mammoth-named tokens did not match. Note ashleybrookecs also has `services_home_*` classes, so a sibling Webflow site could brush against `services_home_cta`; here it did not.
- `bin/motion-decompile:1208` - a work-card heuristic keyed on `work_home_item_link`. Dormant (no such selector here).
- The accordion/FAQ path (lines 1222-1391) is now generic: it infers the accordion root from real selectors via `/accordion|faq/i`. This site has neither, so it stayed dormant and no accordion capture was proposed. This confirms the earlier Mammoth accordion-root hardcode (g_faq_item) is fixed; only dormant regexes and the doc example remain.

Net: the planner generalized. The only overfit is dead weight (denylist tokens and a doc example), not behavior that distorted this run.

## Source files modified

None by me. The working tree already carried pre-existing uncommitted modifications at session start (`README.md`, `bin/motion-decompile`, `tests/run-smoke.sh`) - that is the "latest CLI" with the readiness/soft-fail changes, and I ran it as-is. `git diff --stat` after the run is byte-identical to session start. New untracked paths are only outputs: this report, and the gitignored `runs/` directory.
