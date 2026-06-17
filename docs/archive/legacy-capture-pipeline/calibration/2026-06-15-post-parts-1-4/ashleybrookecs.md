# ashleybrookecs — calibration 2026-06-15 (post Parts 1-4)

URL: https://ashleybrookecs.com/
Run: runs/ashleybrookecs.com/2026-06-15-calib-rb-ashley
Stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   15     | 4  | 4     | 4     | 3     |  0      | 27%  |  53%    |

Spec: 111 animations (77 measured / 34 verify), 12 timelines.
Map: ST 79 · hover 17 · cssHover 2 · loop 1 · split 7.

## Notable wins (max 3, the cleanest measured results)
- loop-67-div-clients-logos-cms-list-wrapper — manual/loop — 7-item logo stagger, scale 0.929->1 + rotate 3.2->0deg, ~22.5ms apart (measured).
- css-hover-a-demo-footer-bottom-link — hover — 3 layers, opacity 0.7->1 + color shift (measured).
- split-reveal-1-p-clients-heading — scroll-reveal — 7-item split-text reveal, transform y 95.97->0px, 1.45s (Part 4: transform-y, not text reflow).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| css-hover-a-nav-link-btn-animate-chars | hover | error | occlusion | Preflight: a.nav-link.btn-animate-chars center is covered |
| nav-link-hover | hover | error | occlusion | Preflight: span.nav-link__label.u-text-style-h4 center is covered |
| primary-button-hover | hover | error | hidden_not_visible | Preflight: button.clickable_btn matched no visible elements |
| link-hover | hover | empty | inert_representative | no animation captured (hittable, moved nothing) |
| misc-hover | hover | empty | inert_representative | no animation captured (hittable, moved nothing) |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- Part 4 win: boot reveal now routes through per-host scroll-reveal captures that report transform y (split-reveal-1 y 95.97->0, split-reveal-5 19-item y 36.65->0), not the baseline's text width/height reflow.
- split-reveal-0-p and split-reveal-6-h2 are correctly-routed-empty (generic p/h2 hosts with no measurable motion), bucketed occlusion by the classifier; same correctly-routed-empty class as the flowfest grid-lines, not a recipe miss.

## Rebuild verdict (one line)
useful — 79 ScrollTriggers carry the spec and 8/15 live captures are usable; the per-host split reveals now report clean transform motion instead of reflow noise.
