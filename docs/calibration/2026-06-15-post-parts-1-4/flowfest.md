# flowfest — calibration 2026-06-15 (post Parts 1-4)

URL: https://www.flowfest.co.uk/
Run: runs/www.flowfest.co.uk/2026-06-15-calib-rb-flowfest
Stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   10     | 3  | 1     | 3     | 3     |  0      | 30%  |  40%    |

Spec: 28 animations (11 measured / 17 verify), 7 timelines.
Map: ST 7 · hover 8 · cssHover 9 · loop 5 · split 2.

## Notable wins (max 3, the cleanest measured results)
- accordion-click — click — icon rotate 0->-135deg + li panel height 78.4->273.2px, 7 findings (Part 4: now hits the header, was an occlusion error at baseline).
- link-hover — hover — div.underline-link::before [scale 0->1] — 0.5s cubic-bezier(.625,.05,0,1) (Part 2: pseudo underline, was empty at baseline; Part 2.5: no spurious rotate).
- css-hover-a-btn-w-inline-block — hover — a.btn [y 0->3.56px] — 0.25s cubic-bezier (measured).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| css-hover-button-btn | hover | error | occlusion | Preflight: button.btn center is covered by div.stack-cards__card |
| css-hover-div-modal-yt-card | hover | error | hidden_not_visible | Preflight: div.modal-yt__card matched no visible elements |
| primary-button-hover | hover | error | hidden_not_visible | Preflight: div.btn__bar matched no visible elements |
| misc-hover | hover | empty | inert_representative | no animation captured |
| split-reveal-0-div-speakers-grid-lines | scroll-reveal | empty | occlusion | no animation captured (correctly-routed-empty, site drift) |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- Spec count is now 28 (11 measured), down from baseline 48 (32). This is the intended Part 3 drawSVG grouping (4 triggers collapsed from 26 near-identical rows to 4 ×N entries carrying summed layers), NOT lost spec.
- split-reveal-0/1 (speakers__grid-lines / community__grid-lines) correctly route to scroll-reveal but capture 0 layers: the live DOM has no measurable transform/opacity/clip/size motion on those hosts (site drift), same correctly-routed-empty class as vwlab's drift. The scroll-reveal path is validated by ashley's per-host captures, not these inert named hosts.

## Rebuild verdict (one line)
useful — only 4/10 live captures usable, but the 11 measured registry animations plus the recovered accordion and pseudo underline carry the spec; the remaining misses are planner target-selection (occlusion / not-visible), not engine failure.
