# Skill repair-loop validation — 2026-06-16

First real run of the `/yoinkit` skill with the **agent-driven repair
loop ON**, across the three repair-bearing calibration sites. This is the
long-deferred measurement the roadmap flagged as Part 7's purpose: *is the repair
loop worth its complexity?* The provider here is the skill's diagnosis subagents
(parallel, browser-free), not a `--repair-cmd` process — but the contract and the
honesty invariant are identical: the subagents propose selectors/actions, the
**engine re-measures**, and status comes only from the engine.

Method per site: `scout` → `capture … --repair-dump` (real headed browser) →
Phase A parallel diagnosis subagents → Phase B/C apply + engine re-measure via
`skill/scripts/repair-step.js` → `assemble`/`report`. Runs live under `runs/`
(gitignored); only this summary is committed.

## Per-site results

| site | proposed | ok (1st/repair) | check | empty | error | usable% | repaired | honest terminals |
|---|---|---|---|---|---|---|---|---|
| enerblock | 4 | 3 (2/1) | 1 | 0 | 0 | **100%** | 2 | 0 |
| flowfest | 10 | 5 (3/2) | 1 | 3 | 1 | 60% | 2 | 4 |
| ashleybrookecs | 15 | 8 (4/4) | 5 | 2 | 0 | 87% | 5 | 2 |

"repaired" = captures converted to ok/check **after** repair. "honest terminals" =
repairable failures the loop recorded as a first-class STOP rather than a silent
empty.

## Aggregate: ok/check-after-repair by bucket (the headline)

Of **15 repairable captures** entering the loop across the three sites:

| failure bucket | entered loop | converted (ok/check after-repair) |
|---|---|---|
| occlusion | 7 | **5** |
| hidden_not_visible | 4 | **3** |
| inert_representative | 4 | **1** |
| **total** | **15** | **9** |

- **Honest terminals: 6** — `genuinely_absent` ×1 (the flowfest drift, §7),
  `genuinely_inert` ×3, `needs_human` ×2.
- Dominant winning actions: `retarget_selector` (4/4 converged), `precondition_action`
  (1/1, enerblock carousel), `scroll_into_view` (1, enerblock pretitle),
  `use_other_instance` (mixed).

### Honest caveat — row count vs. *distinct new* animations

The 9 converted rows are not 9 new animations. The planner proposes redundant hover
"representatives" that the repair correctly resolves to a **shared** underlying
element, so several wins land on a selector that was *already captured first-try*:

- flowfest: both repairs (`primary-button-hover`/`btn__bar` and `css-hover-button-btn`)
  converged on `a.btn.w-inline-block` — the same Buy-Tickets button that
  `css-hover-a-btn-w-inline-block` already captured first-try. So flowfest's repair
  value was **0 new distinct animations** — its win was the 4 honest terminals.
- ashley: `nav-link-chars` duplicates `nav-link-hover` (both → the is-home nav link);
  `link-hover` duplicates `primary-button-hover` (both → the ABOUT US button wrapper).

Counting distinct new animations the loop actually added: **enerblock 2** (split-text
pretitle reveal, carousel-arrow icons), **flowfest 0**, **ashley 3** (nav-link char
effect, button char-stagger, chapters word-reveal) ≈ **5 distinct new captures**.
`assembleSpec` dedups by target, so the final spec is not double-counted. This lands
squarely in the design's ~5–7 projection (`docs/PART-5-repair-loop-design.md` §9).

## The honesty gate (every win is engine-measured, no number from a model)

Spot-checked one repaired timeline per site — all timing/easing/from-to is the
engine's per-frame sampling; the diagnosis subagents emit no measurement fields:

- enerblock `arrow-row-hover` (precondition): `div.carousel__arrow__icon x 23.38→33.77px
  — 0.6s cubic-bezier(0.53,0,0,1)`.
- enerblock `pretitle-content` (scroll_into_view): 121 layers, `div.char opacity 1→0`,
  `div.char::after opacity 0→1 — 0.45s (measured)`.
- flowfest `btn__bar` (use_other_instance): `a.btn.w-inline-block y 0→3.56px — 0.25s
  cubic-bezier(0.625,0.05,0,1)`.
- ashley `nav-link-hover` (retarget): staggered 5-item, `each item y 0→-41.6px,
  ~16.8ms apart, 0.6s cubic-bezier(0.625,0.05,0,1)`.

An unfocused/headless browser cannot produce that motion, which is itself a check
(see the focus note below).

## §7 drift case — terminates honestly, no budget burn

flowfest `split-reveal-0-div-speakers-grid-lines` is bucketed `occlusion` but is
**site drift** (the motion no longer exists). The loop:
1. Attempt 1 retargeted to the sibling `speakers__row` → the engine re-measured
   **empty** (0 moved).
2. Attempt 2 subagent, weighing `animatableHere` (all-false) + two engine empties,
   returned `terminal_give_up(genuinely_absent)`.

Two bounded attempts, then an honest STOP — no unbounded hunt. The companion
`community-grid-lines` reached `genuinely_inert` in **one** attempt (no recapture).
This is exactly the §7 requirement, and the precise `genuinely_absent` label came
from provider judgment on `animatableHere`, as the Part 6 amendment predicted.

## M1 — state isolation holds

Every stateful repair (enerblock carousel `precondition_action`,
`scroll_into_view`s) ran as its own fresh single capture: the apply sub-run's page
provenance is `{strategy:"fresh", opened:true}` with `fresh:true` on the cloned
capture, started from rest. Because each repair is an isolated `capture` invocation,
there is no subsequent capture to leak into — M1 holds by construction, and the
fresh flag is set besides.

## Findings worth carrying forward

1. **Browser-visibility is load-bearing for screenshots, less so for sampling.**
   ashley's first run was backgrounded while the session lost focus; 4/7 repair
   *screenshots* failed (`Browser command failed`). A clean foreground re-run
   produced **identical first-try statuses** (4 empty / 4 check / 4 ok / 3 error,
   0 changed) — the engine's per-frame sampling was robust to the focus loss that
   broke the screenshot primitive. Still, capture should always be foreground/visible;
   the diagnosis subagents reasoned fine from the structural `repairContext` even
   when the screenshot was missing, which is a useful resilience property.
2. **Provider prompt iteration (1):** one subagent emitted `precondition_action`
   steps in an object form (`{verb,ms}`) that `validateRepairOutput` rejects. The
   skill normalized them to the supported string form (`"click .sel"`, `"wait 400"`).
   The diagnosis prompt now states the verb set + string form explicitly; consider
   also widening `validRecipeStep` to accept a `{verb}` alias, or keep the normalize
   step. Logged so the Part 7 `--repair-cmd` provider prompt inherits the fix.
3. **`use_other_instance` can converge on an already-captured element** (the dup
   caveat above). Not wrong — the engine measured real motion — but the loop's
   *headline* should always be ok_first_try; ok_after_repair is the increment, and
   distinct-new is the honest read of its value.

## Verdict

The repair loop is **worth its complexity**, with the design's framing intact:

- ~5 distinct new captures the deterministic planner structurally could not author
  (a state-gated carousel via `precondition_action`; hidden-affordance and
  occluded-representative retargets), plus
- 6 honest terminal verdicts that turn the inert/drift/needs-human tail into
  recorded STOPs instead of ambiguous empties — including the §7 drift case.

Across the three sites, usable-rate after repair was 100% / 60% / 87%. The invariant
held end to end: every measured number came from the engine, machine-checked against
each repair's `successCriterion`; the subagents only ever named selectors, actions,
and terminal verdicts.
