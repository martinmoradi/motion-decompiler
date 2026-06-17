# ashleybrookecs — calibration 2026-06-15

URL: https://ashleybrookecs.com/
Run: runs/ashleybrookecs.com/2026-06-15-calib-ashleybrookecs
Stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   10     | 5  | 1     | 2     | 2     |  0      | 50%  |  60%    |

Spec: 107 animations (77 measured / 30 verify), 8 timelines.
Map: ST 79 · hover 17 · cssHover 2 · loop 1 · split 7.

## Notable wins (max 3, the cleanest measured results)
- boot-load-reveals — boot — 96-layer staggered load reveal, width 145.5->134.7px over 4.68s (measured).
- loop-67-div-clients-logos-cms-list-wrapper-w-dyn-list — loop — 7-item logo loop, scale 0.929->1 + rotate 3.2->0deg, ~22.7ms apart, 0.74s (measured).
- css-hover-a-demo-footer-bottom-link-u-text-style-small — hover — single link, opacity 0.7->1 + color, 0.5s cubic-bezier(0.19,1,0.22,1) (measured ease).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| primary-button-hover | hover | error | hidden_not_visible | Preflight: scroll target button.clickable_btn matched no visible elements |
| scroll-68-p-clients-names-text-u-cover-absolute | scroll | error | hidden_not_visible | Preflight: scrollintoview p.clients_names_text.u-cover-absolute matched no visible elements |
| link-hover | hover | empty | inert_representative | no animation captured (selector hittable, 0 moved layers) |
| misc-hover | hover | empty | inert_representative | no animation captured (nav-logo hittable, 0 moved layers) |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- none

## Rebuild verdict (one line)
useful — 6/10 captures usable plus 77 measured registry animations; the two inert hovers and two not-visible selectors are planner over-proposal, not engine failure.
