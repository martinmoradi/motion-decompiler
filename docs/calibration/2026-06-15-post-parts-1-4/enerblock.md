# enerblock — calibration 2026-06-15 (post Parts 1-4)

URL: https://enerblock.net/en/
Run: runs/enerblock.net/2026-06-15-calib-rb-enerblock
Stack: GSAP, ScrollTrigger, Lenis
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   4      | 2  | 0     | 1     | 1     |  0      | 50%  |  50%    |

Spec: 12 animations (10 measured / 2 verify), 3 timelines.
Map: ST 8 · hover 20 · cssHover 0 · loop 0 · split 1.

## Notable wins (max 3, the cleanest measured results)
- link-hover — hover — a.menu__item__link.link--underline::before [scale 0->1] — 0.3s ease (Part 2: pseudo-element underline, was empty at baseline).
- primary-button-hover — hover — 4-item stagger, y 0->15.09px, ~11.1ms apart, 0.6s cubic-bezier (measured).

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| arrow-row-hover | hover | error | occlusion | Preflight: div.carousel__arrow.carousel__arrow--prev center is covered |
| split-reveal-0-span-pretitle-content | scroll-reveal | empty | inert_representative | no animation captured |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- Part 2 win landed: the `a.link--underline` pseudo-element underline (now resolved as `a.menu__item__link.link--underline::before`) flips empty -> ok with an authoritative scale 0->1 @0.3s ease track.

## Rebuild verdict (one line)
useful — small site, but the underline pseudo + button stagger are both measured and the 8 ScrollTriggers back the spec; the two misses are a covered carousel arrow and one inert pretitle host.
