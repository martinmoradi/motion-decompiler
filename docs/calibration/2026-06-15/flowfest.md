# flowfest — calibration 2026-06-15

URL: https://www.flowfest.co.uk/
Run: runs/www.flowfest.co.uk/2026-06-15-calib-flowfest
Stack: GSAP, ScrollTrigger, Lenis, Webflow, jQuery
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   9      | 1  | 1     | 3     | 4     |  0      | 11%  |  22%    |

Spec: 48 animations (32 measured / 16 verify), 5 timelines.
Map: ST 7 · hover 8 · cssHover 9 · loop 5 · split 2.

## Notable wins (max 3, the cleanest measured results)
- css-hover-a-btn-w-inline-block — hover — single button, y 0->3.56px, 0.25s cubic-bezier(0.625,0.05,0,1) (measured ease).
- scroll-0-div-welcome-col-sun — scroll — sun svg rotate 3.2->4.7deg over 1.58s (measured, status check).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| accordion-click | click | error | occlusion | Preflight: div.accordion-css__item-bottom-content center is covered by div.accordion-css__item-top |
| css-hover-button-btn | hover | error | occlusion | Preflight: button.btn center is covered by div.stack-cards__card |
| css-hover-div-modal-yt-card | hover | error | hidden_not_visible | Preflight: scroll target div.modal-yt__card matched no visible elements |
| primary-button-hover | hover | error | hidden_not_visible | Preflight: scroll target div.btn__bar matched no visible elements |
| boot-load-reveals | boot | empty | inert_representative | no animation captured (boot reveal returned 0 layers) |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- boot-load-reveals empty here but captured 96/9 layers on ashleybrookecs/enerblock; with 7 ST + 2 split reveals on the page, the load reveals are likely scroll-triggered, so this reads as a probable wrong_trigger_boot_vs_scroll. "no animation captured" is too vague for the extractor to separate inert from wrong-trigger (bucketed inert_representative) — richer reasons needed.
- accordion-click clicks the body panel (covered by the top/header) instead of the header toggle: the generic accordion-target flaw noted in planner-overfit-mammoth-selectors.

## Rebuild verdict (one line)
partial — only 2/9 live captures usable, but the 32 measured registry animations carry the spec; the live misses are planner target-selection (occlusion, not-visible, boot-vs-scroll), not engine failure.
