# vwlab — calibration 2026-06-15

URL: https://vwlab.io/pages/report
Run: runs/vwlab.io/2026-06-15-calib-vwlab
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
| css-hover-a-link-list-social-link | hover | error | hidden_not_visible | Preflight: scroll target a.link.list-social__link matched no visible elements |
| link-hover | hover | error | hidden_not_visible | Preflight: scroll target a.header__link.lined matched no visible elements |
| misc-hover | hover | error | hidden_not_visible | Preflight: scroll target a.header__logo.w-inline-block matched no visible elements |
| nav-link-hover | hover | error | hidden_not_visible | Preflight: scroll target li.header__nav__link matched no visible elements |
| primary-button-hover | hover | error | hidden_not_visible | Preflight: scroll target a.header__cta.e-flex matched no visible elements |

## Flags (cross-cutting issues, not per-capture; "none" if clean)
- wrong_document_iframe (regression, not yet detected): the page is a Shopify shell that embeds the real report in a cross-origin iframe (report-vwlab.netlify.app). page-state mapped the wrapper (title "Report | VWLAB", text "YOUR BAG ... CONTINUE SHOPPING", stack none). All 5 selectors resolve into the iframe, so every capture errors "selector matched no visible elements". The tool flags NO iframe (wrong_document=null), so the extractor buckets these as hidden_not_visible. Expected to flip to a flagged iframe + wrong_document_iframe once the iframe-detection fix lands.
- vague-reason finding: "matched no visible elements" cannot be distinguished from a genuinely hidden element. This is exactly why the wrong-document case is invisible in the histogram today and feeds the richer-reasons work.

## Rebuild verdict (one line)
not useful — wrong document captured; 0 usable live captures and only 2 trivial wrapper-loop animations, all because the tool maps the embed shell instead of the cross-origin iframe.
