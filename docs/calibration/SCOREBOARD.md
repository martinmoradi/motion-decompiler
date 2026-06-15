# motion-decompiler calibration scoreboard

Run date: 2026-06-15
Methodology: identical for all 4 sites — `scout -> decompile`, full
planner-proposed manifest, no curation, soft-fail expected, real headed browser
via `bin/capture-browser` (unique `AGENT_BROWSER_SESSION` per site). No engine or
planner source was tuned for this run. Numbers are mechanical, emitted by
`bin/calib-metrics` (see its `bucketCause()` keyword map for failure-cause rules).

`hit% = ok / attempted`; `usable% = (ok+check) / attempted`; `attempted` excludes
skipped. This is the standing baseline against which fixes are measured.

| site | stack | proposed | ok | check | empty | error | hit% | usable% | animations (measured/verify) | dominant failure cause |
|------|-------|----------|----|-------|-------|-------|------|---------|------------------------------|------------------------|
| ashleybrookecs | GSAP+ScrollTrigger+Lenis+Webflow+jQuery | 10 | 5 | 1 | 2 | 2 | 50% | 60% | 107 (77/30) | hidden_not_visible + inert (2/2 tie) |
| enerblock | GSAP+ScrollTrigger+Lenis | 4 | 2 | 0 | 1 | 1 | 50% | 50% | 12 (9/3) | occlusion + inert (1/1 tie) |
| flowfest | GSAP+ScrollTrigger+Lenis+Webflow+jQuery | 9 | 1 | 1 | 3 | 4 | 11% | 22% | 48 (32/16) | inert_representative (3) |
| vwlab | (none detected) | 5 | 0 | 0 | 0 | 5 | 0% | 0% | 2 (1/1) | hidden_not_visible (5) — masked wrong_document_iframe |
| **totals** | — | **28** | **8** | **2** | **6** | **12** | **28.6%** | **35.7%** | **169 (119/50)** | hidden_not_visible (9) |

## Failure-cause histogram (summed across all sites)

| bucket | count |
|--------|-------|
| occlusion | 3 |
| hidden_not_visible | 9 |
| inert_representative | 6 |
| pseudo_element | 0 |
| wrong_trigger_boot_vs_scroll | 0 |
| wrong_document_iframe | 0 |
| vendor_animation | 0 |
| other | 0 |
| **total failures** | **18** |

18 failed captures (6 empty + 12 error) across 28 attempted.

## Reading the baseline

- **wrong_document_iframe = 0 is misleading.** vwlab's 5 errors ARE the
  cross-origin-iframe regression (it maps the Shopify embed shell, every selector
  resolves into report-vwlab.netlify.app), but the tool flags no iframe and the
  reason string is "selector matched no visible elements", so the extractor
  buckets them as `hidden_not_visible` and `wrong_document` stays null. When the
  iframe-detection fix lands, expect 5 to move out of `hidden_not_visible` into a
  flagged iframe / `wrong_document_iframe`, vwlab hit% to become meaningful, and
  `wrong_document` to carry the iframe src.
- **hidden_not_visible (9) is the largest bucket** but 5 of those 9 are the vwlab
  masking above; the real "selector matched no visible element" planner misses
  are 4 (ashleybrookecs 2, flowfest 2).
- **inert_representative (6)** are captures where the element was hittable but
  moved nothing. At least one (flowfest `boot-load-reveals`) is probably a
  `wrong_trigger_boot_vs_scroll` that the vague "no animation captured" reason
  cannot distinguish — a richer-reasons gap.
- **occlusion (3)** are genuine planner target-resolution misses (covering
  sticky/overlay element), including the accordion-body-vs-header click on
  flowfest.

## Diff vs previous run

No previous SCOREBOARD.md — this is the first standing baseline. Future reruns
add a diff row here showing delta on hit% and on each failure bucket.
