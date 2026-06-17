# YoinkIt calibration scoreboard

Run date: 2026-06-15 (post Parts 1-4 re-baseline)
Methodology: identical for all 4 sites — `yoink <url>` (scout -> capture the
full planner-proposed manifest, no curation), soft-fail expected, real headed
browser via `bin/capture-browser` (unique `AGENT_BROWSER_SESSION` per site). No
engine, planner, or test source was tuned for this run (`git status` clean of
source). Numbers are mechanical, emitted by `bin/calib-metrics` (failure buckets
read the structured `cause` field the tool now emits per failed capture).

Per-site notes for this run: `docs/calibration/2026-06-15-post-parts-1-4/`
(named to disambiguate from the original same-day baseline notes in
`docs/calibration/2026-06-15/`).

`hit% = ok / attempted`; `usable% = (ok+check) / attempted`; `attempted` excludes
skipped. **This run sets the new standing denominator: 34 attempted.**

| site | stack | proposed | ok | check | empty | error | hit% | usable% | animations (measured/verify) | dominant failure cause |
|------|-------|----------|----|-------|-------|-------|------|---------|------------------------------|------------------------|
| ashleybrookecs | GSAP+ScrollTrigger+Lenis+Webflow+jQuery | 15 | 4 | 4 | 4 | 3 | 27% | 53% | 111 (77/34) | occlusion (4) |
| enerblock | GSAP+ScrollTrigger+Lenis | 4 | 2 | 0 | 1 | 1 | 50% | 50% | 12 (10/2) | occlusion + inert (1/1 tie) |
| flowfest | GSAP+ScrollTrigger+Lenis+Webflow+jQuery | 10 | 3 | 1 | 3 | 3 | 30% | 40% | 28 (11/17) | occlusion + hidden + inert (2/2/2 tie) |
| vwlab | (none detected) | 5 | 0 | 0 | 0 | 5 | 0% | 0% | 2 (1/1) | wrong_document_iframe (5) |
| **totals** | — | **34** | **9** | **5** | **8** | **12** | **26.5%** | **41.2%** | **153 (99/54)** | occlusion (7) |

## Failure-cause histogram (summed across all sites)

| bucket | count |
|--------|-------|
| occlusion | 7 |
| hidden_not_visible | 3 |
| inert_representative | 5 |
| pseudo_element | 0 |
| wrong_trigger_boot_vs_scroll | 0 |
| wrong_document_iframe | 5 |
| vendor_animation | 0 |
| other | 0 |
| **total failures** | **20** |

20 failed captures (8 empty + 12 error) across 34 attempted.

## Diff vs the 2026-06-15 baseline (28-denominator)

**Read the ABSOLUTE counts, not hit%.** Part 4 made each split-reveal host its
own scroll capture, so `attempted` grew (28 -> 34: +5 ashley, +1 flowfest from
split-host granularization; enerblock and vwlab unchanged at 4 and 5). hit% is
therefore **not apples-to-apples** across this change, and this run is the new
standing denominator.

| metric | baseline (28) | this run (34) | delta | comparable? |
|--------|---------------|---------------|-------|-------------|
| ok | 8 | 9 | **+1** | yes (absolute) |
| check | 2 | 5 | **+3** | yes (absolute) |
| empty | 6 | 8 | +2 | yes (absolute) |
| error | 12 | 12 | 0 | yes (absolute) |
| attempted | 28 | 34 | +6 | denominator changed |
| hit% | 28.6% | 26.5% | -2.1pp | **NO — not apples-to-apples** |
| usable% | 35.7% | 41.2% | +5.5pp | NO (same denominator caveat) |

Honest read: **+1 ok, +3 check, +0 error in absolute terms.** The hit% dip is a
denominator artifact, not a regression — of the granularized split-host captures,
the usable yield is healthy (ashley alone added 4 usable split-reveal rows).

### Histogram diff vs baseline

| bucket | baseline | this run | delta | note |
|--------|----------|----------|-------|------|
| occlusion | 3 | 7 | +4 | more hover candidates attempted on ashley + two split empties classed occlusion; the baseline accordion occlusion is GONE (now ok) |
| hidden_not_visible | 9 | 3 | **-6** | the 5 vwlab maskers left for wrong_document_iframe; honest now |
| inert_representative | 6 | 5 | -1 | — |
| pseudo_element | 0 | 0 | 0 | **both former pseudo failures are now `ok`** (flowfest + enerblock underlines), so the bucket is empty by success, not by blindness |
| wrong_trigger_boot_vs_scroll | 0 | 0 | 0 | flowfest's boot reveal is re-routed to scroll captures (Part 4), so it never fails as a boot miss |
| wrong_document_iframe | 0 | 5 | **+5** | Part 1 honesty: vwlab's 5 errors now correctly attributed (baseline masked them as hidden_not_visible) |
| vendor_animation | 0 | 0 | 0 | de-rank is spec-quality, not a failure bucket (verified by inspection: Shop Pay no longer a vwlab signature) |
| other | 0 | 0 | 0 | no unbucketable reasons |

## Confirmed wins from Parts 2 / 4 (landed in this run)

- **Pseudo-element underlines (Part 2):** flowfest `link-hover` =
  `div.underline-link::before [scale 0->1] @0.5s cubic-bezier(.625,.05,0,1)`;
  enerblock `link-hover` = `a.menu__item__link.link--underline::before
  [scale 0->1] @0.3s ease`. Both were empty at baseline, both now `ok` with the
  authoritative CSS transition. Part 2.5 holds: no spurious rotate row.
- **Accordion (Part 4):** flowfest `accordion-click` flips occlusion-error -> ok
  (7 findings): hits `div.accordion-css__item-top` and captures icon
  `rotate 0->-135deg` + `li` panel height `78.4->273.2px`.
- **Boot reveal (Part 4):** ashley split reveals report transform y
  (split-reveal-1 `y 95.97->0`, split-reveal-5 19-item `y 36.65->0`), not the
  baseline's text width/height reflow.

## Split-host spot-check (Part 4 granularization)

Opened two ashley per-host scroll captures: split-reveal-1 (clients-heading, 7
`div.word` items, y 95.97->0, ~22.8ms stagger, 1.45s) and split-reveal-5
(services-subheading, 19 items, y 36.65->0 ascending per item, ~26.7ms stagger,
1.38s). They carry real, **distinct** motion on different page sections with
different distances and stagger counts — genuine enrichment, not one staggered
reveal fragmented into near-empty rows. Of ashley's 7 split hosts, 5 are usable
(4 ok/check with real transforms) and only 2 generic p/h2 hosts are empty.

## vwlab: keep-or-swap recommendation — **SWAP**

vwlab.io/pages/report has drifted **back** to a cross-origin iframe shell this
run (Part 1 detects it: 100% viewport iframe -> `report-vwlab.netlify.app`,
inaccessible). It yields 0 usable captures whenever it is in shell mode, and the
URL demonstrably flickers between shell and real-content states between runs
(Part 4's run saw 12 real captures; this run sees 5 shell-chrome errors). That
instability makes it a poor standing breadth entry.

A scout of **https://report-vwlab.netlify.app** (the real content) shows a
genuine page: no iframe shell, 80 hover candidates, 11 css-hovers, 4 loops, 10
proposed captures. **Recommendation: swap the standing entry to
report-vwlab.netlify.app** to measure real motion instead of a flickering shell.
The cross-origin guarantee no longer needs a live URL — it is pinned by the
permanent two-port smoke fixture. Pending PM sign-off; not changed unilaterally.

## Reading this run

- The deterministic floor-raisers (Parts 1-4) all show up as intended:
  honest attribution (wrong_document_iframe +5, hidden_not_visible -6), two
  pseudo-element captures converted to `ok`, an accordion error->ok flip, and
  reflow-noise replaced by transform on the ashley reveal.
- Spec richness is intact: flowfest's drop to 28 animations (from 48) is the
  intended lossless Part 3 drawSVG grouping (4 ×N entries carrying summed
  layers), not lost spec. Total animations 153 (99 measured) vs baseline 169
  (119) — the -16 is entirely flowfest's dedup, partly offset by +4 on ashley.
- No source changed; this run only measures.

## Repair-loop sub-table (Part 7 — first repair-enabled run, 2026-06-16)

The capture-repair loop (`docs/PART-5-repair-loop-design.md`) ran ON for the first
time via the `/yoinkit` skill's agent-driven repair stage (parallel
diagnosis subagents → engine re-measure), across the three repair-bearing sites.
Full narrative + the honest "distinct new" read in
`docs/calibration/2026-06-16-skill-repair-validation.md`. **`ok_first_try` is the
primary headline** (the engine's unaided floor); `ok_after_repair` is the loop
increment, never folded into one hit% that hides the floor. Numbers below are
mechanical, emitted by `bin/calib-metrics` from each run's `metrics.json.repair`.

| site | ok_first_try | ok_after_repair | check_first_try | check_after_repair | repair attempted | succeeded |
|------|--------------|-----------------|-----------------|--------------------|------------------|-----------|
| ashleybrookecs | 4 | 4 | 4 | 1 | 7 | 5 |
| enerblock | 2 | 1 | 0 | 1 | 2 | 2 |
| flowfest | 3 | 2 | 1 | 0 | 6 | 2 |
| **totals** | **9** | **7** | **5** | **2** | **15** | **9** |

`succeeded` = repairable captures converted to ok **or** check after repair (7 ok
+ 2 check = 9). **Honest caveat (see the validation note):** the 9 converted rows
are ~5 *distinct new* animations — several `use_other_instance`/`retarget` wins
resolve to a target already captured first-try (both flowfest repairs land on the
Buy-Tickets button; two ashley rows duplicate siblings), and `assembleSpec` dedups
by target. ~5 distinct new is squarely the design §9 ~5–7 projection.

Repair detail (summed across the three sites), from `metrics.json.repair`:

- **by_bucket** `{att, ok}` — `occlusion {7, 5}`, `hidden_not_visible {4, 3}`,
  `inert_representative {4, 1}`. Occlusion and hidden convert well; inert mostly
  does not (and correctly — most inert reps are genuinely inert → honest STOP).
- **by_action** `{att, ok}` — `retarget_selector {5, 4}`, `use_other_instance
  {6, 3}`, `precondition_action {2, 1}`, `scroll_into_view {2, 1}`,
  `terminal_give_up {6, 0}`.
- **terminal** — `genuinely_absent ×1` (the flowfest speakers-grid-lines drift,
  design §7), `genuinely_inert ×3`, `needs_human ×2`. Six first-class honest STOPs,
  not silent empties — this is what lets the scoreboard distinguish "the tool
  failed" from "there is nothing here to capture."

Verdict vs the design §9 projection: confirmed. Not a hit% leap — ~5 distinct new
captures (dominated by `retarget`/`precondition`/`scroll` repairs the deterministic
planner cannot author) plus the inert/absent long tail converted to recorded
terminal verdicts. All three guarantees held in the live run: every win is
engine-measured (no number from a subagent), the drift case terminated in bounded
attempts, and every stateful repair opened a fresh page (M1, no state leak).
