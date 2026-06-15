# vwlab — calibration 2026-06-15 (post Parts 1-4)

URL: https://vwlab.io/pages/report
Run: runs/vwlab.io/2026-06-15-calib-rb-vwlab
Stack: (none detected)
Hard fail: no

## Numbers
| proposed | ok | check | empty | error | skipped | hit% | usable% |
|----------|----|-------|-------|-------|---------|------|---------|
|   5      | 0  | 0     | 0     | 5     |  0      | 0%   |  0%     |

Spec: 2 animations (1 measured / 1 verify), 0 timelines.
Map: ST 0 · hover 18 · cssHover 1 · loop 2 · split 0.

## Notable wins (max 3, the cleanest measured results)
- none

## Top failures (max 5, worst first)
| id | type | status | cause | one-line reason |
|----|------|--------|-------|-----------------|
| css-hover-a-link-list-social-link | hover | error | wrong_document_iframe | Preflight: a.link.list-social__link matched no visible elements (resolves into iframe) |
| link-hover | hover | error | wrong_document_iframe | Preflight: a.header__link.lined matched no visible elements |
| misc-hover | hover | error | wrong_document_iframe | Preflight: a.header__logo.w-inline-block matched no visible elements |
| nav-link-hover | hover | error | wrong_document_iframe | Preflight: li.header__nav__link matched no visible elements |
| primary-button-hover | hover | error | wrong_document_iframe | Preflight: a.header__cta.e-flex matched no visible elements |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- wrong_document_iframe (DETECTED, Part 1 working): the page has DRIFTED BACK to a cross-origin iframe shell. report.md leads with "Primary content is a cross-origin iframe: https://report-vwlab.netlify.app (100% of the viewport)" plus the thin-document signal (scrollHeight 802 vs innerHeight 800, 40 content elements, 50 chars body text). All 5 shell-chrome hover selectors resolve into the inaccessible iframe, so every capture errors; the classifier now buckets them wrong_document_iframe and wrong_document carries the iframe src. This is the honesty win the baseline projected (baseline masked these 5 as hidden_not_visible).
- Methodology note: this contradicts the Part-1-era roadmap note that vwlab "is no longer a cross-origin shell". The live URL flickers between shell and real-content states (Part 4's Codex run saw it as 12 real captures; this run sees the shell). The cross-origin guarantee is already pinned by the permanent two-port smoke fixture, so the live URL does not need to carry it.

## Rebuild verdict (one line)
not useful — the tool correctly detects and reports the cross-origin shell; 0 usable captures because the real content (report-vwlab.netlify.app) lives in an inaccessible iframe. SWAP recommended (see SCOREBOARD).
