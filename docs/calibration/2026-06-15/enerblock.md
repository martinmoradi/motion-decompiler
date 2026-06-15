# enerblock — calibration 2026-06-15

URL: https://enerblock.net/en/
Run: runs/enerblock.net/2026-06-15-calib-enerblock
Stack: GSAP, ScrollTrigger, Lenis
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   4      | 2  | 0     | 1     | 1     |  0      | 50%  |  50%    |

Spec: 12 animations (9 measured / 3 verify), 3 timelines.
Map: ST 8 · hover 20 · cssHover 0 · loop 0 · split 1.

## Notable wins (max 3, the cleanest measured results)
- boot-load-reveals — boot — 9 layers animate together, span.pretitle opacity 1->0 + width (measured).
- primary-button-hover — hover — 4-item stagger, y 0->15.09px, ~12.4ms apart, 0.6s cubic-bezier(0.53,0,0,1) (measured ease).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| arrow-row-hover | hover | error | occlusion | Preflight: div.carousel__arrow--prev center is covered by div.carousel__control |
| link-hover | hover | empty | inert_representative | no animation captured (selector hittable, 0 moved layers) |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- none

## Rebuild verdict (one line)
partial — only 4 captures proposed (2 measured wins) plus 9 measured registry animations; small but accurate, the carousel-arrow occlusion is a real planner target-resolution gap.
