# Mammoth Murals Repair Calibration

Target: `https://mammothmurals.com/`

Baseline run:
`/home/martin/src/perso/yoinkit/docs/calibration/mammothmurals-2026-06-16-repair-baseline/naked-skill-run`

Current run:
`/home/martin/src/perso/yoinkit/runs/mammothmurals.com/2026-06-16-run-2`

The baseline was copied before the current run and preserved as a full run
artifact snapshot.

## Metrics

Baseline:

```text
$ bun ./bin/calib-metrics /home/martin/src/perso/yoinkit/docs/calibration/mammothmurals-2026-06-16-repair-baseline/naked-skill-run --site mammothmurals
calib-metrics → docs/calibration/mammothmurals-2026-06-16-repair-baseline/naked-skill-run/metrics.json
  site=mammothmurals stack=[GSAP, ScrollTrigger, Lenis, Webflow, jQuery] hard_fail=false
  status totals: proposed=18 ok=7 check=3 empty=5 error=3 skipped=0 attempted=18
  hit%=39% usable%=56%
  usable scoreboard: first_try=8 (ok=5 check=3); after_repair=2 (ok=2 check=0)
  repair: attempted=10 succeeded=2; by_action terminal_give_up(0/7) retarget_selector(1/1) precondition_action(1/3); terminal genuinely_absent=7
  spec: 50 anims (17 measured / 33 verify), 15 timelines
  failure_causes: occlusion=2 hidden_not_visible=2 inert_representative=4
```

Current:

```text
$ bun ./bin/calib-metrics /home/martin/src/perso/yoinkit/runs/mammothmurals.com/2026-06-16-run-2 --site mammothmurals
calib-metrics → runs/mammothmurals.com/2026-06-16-run-2/metrics.json
  site=mammothmurals stack=[GSAP, ScrollTrigger, Lenis, Webflow, jQuery] hard_fail=false
  status totals: proposed=18 ok=6 check=3 empty=5 error=4 skipped=0 attempted=18
  hit%=33% usable%=50%
  usable scoreboard: first_try=8 (ok=5 check=3); after_repair=1 (ok=1 check=0)
  repair: attempted=10 succeeded=1; by_action terminal_give_up(0/9) scroll_into_view(1/2) precondition_action(0/4) use_other_instance(0/1); terminal genuinely_absent=7 genuinely_inert=1 needs_human=1
  spec: 49 anims (16 measured / 33 verify), 14 timelines
  failure_causes: occlusion=2 hidden_not_visible=3 inert_representative=4
```

## Capture Split

First-try usable stayed flat at 8 captures: 5 `ok`, 3 `check`.

After-repair usable dropped from 2 to 1. Baseline repaired
`scroll-3-div-g-cta-collection` and `css-hover-button-vimeo-lightbox-close`.
Current repaired only `scroll-3-div-g-cta-collection`.

Repair attempted count stayed at 10. Repair succeeded count dropped from 2 to 1.

## Terminal Causes

Baseline terminalized 7 rows, all as `genuinely_absent`.

Current terminalized 9 rows:

- `genuinely_absent`: 7
- `genuinely_inert`: 1, `css-hover-div-vimeo-lightbox-btn`
- `needs_human`: 1, `css-hover-button-vimeo-lightbox-close`

The current terminal split is more honest. The lightbox button is now separated
from absent split-text drift, and the close button is marked as a possible real
repair that needs human review after both opener preconditions failed.

## Repaired Rows

Current `scroll-3-div-g-cta-collection` is a distinct useful repair. It captured
the CTA image stagger: 7 `div.g_cta_image` layers scaling into place with opacity
and blur settling.

Baseline `scroll-3-div-g-cta-collection` was suspicious despite being counted as
usable. Its timeline captured two `div.hero_contact_top-left.u-sprite` sprite
layers, not the CTA collection named by the capture id. That looks like a
duplicate or mistargeted already-running sprite, not a real CTA repair.

Baseline `css-hover-button-vimeo-lightbox-close` was a distinct repaired
animation: the close button hover measured `scale 1->0.95` and `rotate 0->-90deg`.
Current regressed here: both opener preconditions failed to converge and the row
ended as `needs_human`.

## What Improved

The current repaired CTA row is better targeted. `scroll_into_view` on
`div.g_cta_content` produced the expected CTA image reveal instead of the
baseline's unrelated sprite capture.

`report.md` now tells the repair truth. It includes a human scoreboard, a
first-try section, an after-repair section, an honest-terminal section, and
`Still unrepaired: None`. Terminal rows keep their original status/cause while
showing repair outcome and terminal cause.

The terminal accounting is also clearer: current output distinguishes
`genuinely_absent`, `genuinely_inert`, and `needs_human`; the baseline collapsed
all terminal rows into `genuinely_absent` and still presented the report as
ordinary empty/failed captures.

## What Regressed

The current run lost the lightbox close hover repair that the baseline captured.
That accounts for the drop from 10 usable captures to 9, 15 timelines to 14, and
50 spec animations to 49.

The current report is more truthful, but the scoreboard is numerically worse:
hit rate dropped from 39% to 33%, usable rate from 56% to 50%, and
after-repair usable from 2 to 1.

## Live Site Drift Or Expected Change

The map shape stayed stable: 18 proposed captures, 8 ScrollTriggers, 64 hover
candidates, 13 CSS hovers, 10 loops, and 6 split reveals in both runs. Most
first-try captures are the same families with small timing/count differences
that look like normal live capture variance.

The lightbox close regression may be live-state drift or changed opener behavior.
The current repair attempts both click and keyboard activation on
`button.g_video_button`; neither made the close hover measurable. The baseline's
working precondition included a wait after clicking the same opener. That is a
small but important recipe difference to investigate before calling it pure site
drift.

## Naked Skill Rough Spots

The flow completed without source changes. The main rough spot is operational:
diagnosis worker JSON still has to be manually piped into `repair-loop.js
save-output`, which is easy to fumble when four batches return at different
times.

The diagnosis prompt also allows useful terminal-primary outputs, and the
coordinator accepts them, but the wording still nudges primary/fallback toward
actionable hypotheses. That mismatch is survivable, but it made the all-terminal
split-reveal batches feel slightly ambiguous.

Finally, the report truth improved, but the raw capture table still lists
terminal rows with their original `empty`/`error` status. The later sections fix
the interpretation, so this is honest rather than wrong, but it makes the table
easy to misread if someone stops before the scoreboard.
