# Part 5 — Capture-repair loop (DESIGN)

Status: design only. No capture-behavior change in this part. Part 6 builds it.

This document specifies the agentic diagnose-and-retry loop that handles the
residual of failed captures the deterministic classifier (Part 1) can label but
no fixed rule can resolve. It is written against the **exact failed rows** from
the post-Parts-1-4 re-baseline (commit 615f1c3), not against abstractions.

---

## 0. The one invariant, stated first

**The LLM decides WHAT to capture, HOW to reach it, and how to REPAIR a failure.
It never measures motion.** Durations, easings, from/to values, frame counts,
and the ok/check/empty verdict are produced *only* by the engine's per-frame
sampler (`extension/capture-animation.js`) and the engine's
measured-vs-verify logic. A repaired recipe is always re-measured by the engine.

This is enforced structurally, not by good intentions:

- The diagnosis **input** the LLM receives contains a screenshot + DOM/CSS
  structural signals + the failed recipe. It contains **no frame data, no
  timeline, no durations** — there is nothing to copy.
- The repair **output** schema (§3) has **no measurement fields**. The LLM
  cannot emit a duration or an easing because the contract has nowhere to put
  one. It emits selectors, action sequences, and a terminal verdict.
- Whether a repair "worked" is decided by re-running the **same**
  `settle → arm → trigger → wait → dump` recipe and reading the engine's
  `status` / `elementsMoved` — the success criterion (§3) is machine-checked
  against engine output, never self-reported by the model.

If a future change to this design would let a number flow from the model into
the spec, that change is wrong.

---

## 1. Where the loop hooks in

The hook is a single, well-bounded point already present in the capture stage.

`runCapture()` (`bin/yoinkit:1002-1157`) iterates captures. For each
one it runs the recipe, builds `result` via `timelineResult()` (which sets
`status` ∈ `ok|check|empty|error` from the engine), then calls **`attachCause()`**
(`:969-997`) which runs the live `failureProbe` and stamps `result.cause` from
the fixed vocabulary. The page is **still open** at this point — the same place
the probe reads it.

The repair loop slots in immediately after `attachCause`, before the result is
pushed:

```
run recipe → timelineResult() → status ok/check ──────────────► push (origin: first-try)
                              └→ status empty/error → attachCause()
                                                          │
                                            cause repairable?  ──no──► push (unrepaired)
                                                          │yes
                                                   ┌──────▼─────────────────────────┐
                                                   │ REPAIR LOOP (≤ maxRetries)      │
                                                   │ 1. snapshot diagnosis input     │
                                                   │    (screenshot + repairContext) │
                                                   │ 2. ask repair provider          │
                                                   │ 3. validate output contract     │
                                                   │ 4. terminal? → stop, record     │
                                                   │ 5. apply repair to a cloned     │
                                                   │    capture; re-run SAME recipe   │
                                                   │ 6. check success criterion vs    │
                                                   │    engine output → stop or loop │
                                                   └──────┬──────────────────────────┘
                                                          ▼
                                              push (origin: after-repair | unrepaired | terminal)
```

Key properties of the hook:

- **Reuses the existing recipe verbatim.** A repair never invents a capture
  path. It mutates a *cloned* capture object (new selector, or an injected
  `beforeAction`/`setupAction` sequence) and feeds it back through the same
  `defaultAction → scrollintoview/settle → defaultArm (\`__cap.scan\`) →
  runAction → wait → \`__cap.dump\`` flow at `:1079-1102`. The engine arms and
  dumps exactly as before. No second measurement path exists.
- **The precondition action sequence is not a new mechanism.** The capture loop
  already runs `runMaybeAction(capture.setupAction || capture.beforeAction)` at
  `:1077` and supports `resetAction` at `:1112`. A "open the modal / advance the
  carousel / scroll the stack, *then* capture" repair is expressed as a
  `beforeAction` array of the same primitives `runAction()` already understands
  (`click`, `hover`, `scroll`, `scrollintoview`, `wait`, `{eval}`). The recipe
  then arms and triggers unchanged. Nothing in the engine learns about modals.
- **Off by default.** If no repair provider is configured the loop is inert and
  the current soft-fail behavior is byte-identical. Repair is opt-in via
  `--repair-cmd <cmd>` / manifest `repair: {...}` (§5), so plain runs and the
  smoke suite are unaffected.

### Why the LLM is an injected *provider*, not a baked-in API client

The engine and planner are deliberately **dependency-free and framework/driver-
agnostic** (`CLAUDE.md`). Embedding an LLM SDK + API key + network assumption in
`bin/yoinkit` would break all three. So the loop follows the same
pattern as `runBrowser` (which shells out to whatever driver is configured): the
repair provider is an **external command (or in-harness callback)** that the
tool invokes with a diagnosis-input file and reads a repair-response file back
from. The "LLM" is supplied by the driving harness — the Claude skill, Codex, or
a minimal script. The tool core stays a pure measurement instrument; the
intelligence lives at the adapter boundary, exactly as "script measures, agent
judges" (Part 0) already establishes.

This also means the design is testable without a model: the smoke suite can
register a deterministic stub provider that returns canned repairs.

---

## 2. Diagnosis input contract

Written by the tool to `runs/<run>/repair/<captureId>.attempt-<n>.input.json`
right after a repairable failure, while the failed page is still open. One file
per attempt (so attempt history is on disk, and a re-run is reproducible).

```jsonc
{
  "captureId": "flowfest-modal-yt-card",
  "attempt": 1,                 // 1-based; bounded by maxRetries
  "url": "https://www.flowfest.co.uk/",
  "viewport": [1280, 800],

  // ── what the engine already determined (do NOT re-derive) ──
  "failure": {
    "status": "empty",          // or "error"
    "reason": "selector matched no visible elements",   // human string
    "cause": "hidden_not_visible",                      // Part 1 fixed vocab
    "causeSignals": {           // from failureProbe(), verbatim
      "found": true, "visible": false, "zeroBox": false,
      "occludedBy": null,
      "hoverSelfAnimatable": false, "hoverPseudoAnimatable": false,
      "pseudoHasTransition": false
    }
  },

  // ── the recipe that failed, as run ──
  "failedRecipe": {
    "type": "hover",
    "selector": "div.modal-yt__card",
    "root": null,
    "action": "hover div.modal-yt__card",
    "arm": "window.__cap.scan(\"div.modal-yt__card\", {trigger:\"hover\"})",
    "beforeAction": null,
    "waitMs": 1200
  },

  // ── a live PNG of the page at the failed state ──
  "screenshot": "repair/flowfest-modal-yt-card.attempt-1.png",

  // ── the relevant slice of map.json this capture came from ──
  "mapSubtree": {
    "fromHoverCandidateGroup": "modal-yt",
    "siblingsInMap": ["a.modal-yt__trigger", "div.modal-yt__overlay"],
    "section": "speakers",
    "splitReveal": null
  },

  // ── a fresh structural probe of the target's neighborhood (read-only) ──
  "repairContext": {
    "matches": [                // every element matching the failed selector
      { "nth": 0, "visible": false, "rect": [0,0,0,0],
        "display": "none", "occludedBy": null }
    ],
    "ancestors": [              // parent chain: tag + classes + role/aria + pointer
      { "tag": "div", "classes": ["modal-yt"], "role": null,
        "cursorPointer": false, "ariaHidden": "true" }
    ],
    "siblings": [ /* same shape as matches */ ],
    "candidateTriggers": [      // nearby clickable affordances (cursor:pointer,
                                // role=button, <button>/<a>, aria-controls, etc.)
      { "selector": "a.modal-yt__trigger", "text": "Watch",
        "rect": [120,300,180,44], "opensTarget": "guessed" }
    ],
    "animatableHere": {         // does the target/pseudos/children carry any
                                // hover/transition/@keyframes/ST tween at all?
      "selfHover": false, "pseudoHover": false,
      "childAnimated": false, "scrollTriggerBound": false
    }
  },

  // ── what was already tried for THIS capture (empty on attempt 1) ──
  "attemptHistory": [
    // { "action": "retarget_selector", "params": {...},
    //   "resultStatus": "empty", "resultCause": "hidden_not_visible" }
  ]
}
```

Notes:

- `failure.cause` / `causeSignals` are taken straight from Part 1's classifier
  and probe. The loop **does not re-diagnose** what the classifier already
  settled — it consumes it.
- `repairContext` is the new, richer signal the residual actually needs. It is a
  single read-only `evalJson` probe (same shape and cost class as the existing
  `failureProbe`), surfacing the three things every repair shape keys on:
  *other instances* of the selector (each with its own visibility/occluder),
  *candidate triggers* (for precondition repairs), and *whether anything here is
  animatable at all* (the gate for an honest terminal verdict — see §6).
- `animatableHere` is what separates "repairable" from "genuinely inert/absent":
  if nothing self/pseudo/child/ST-bound is animatable anywhere near the target
  and no occluder is present, the only correct output is `terminal_give_up`.
  This is what stops the loop from burning retries on the flowfest
  `speakers-grid-lines` drift case (§7).
- `screenshot` uses the `screenshot <path>` primitive (agent-browser has it;
  every driver adapter already can — see §8).

---

## 3. Structured output contract

The provider returns `runs/<run>/repair/<captureId>.attempt-<n>.output.json`.
The tool validates it; an invalid or unparseable response is treated as
`terminal_give_up(provider_error)` (fail safe, never loops on garbage).

```jsonc
{
  "diagnosis": "Card only exists in the DOM once its lightbox is opened; the opener is a.modal-yt__trigger.",
  "rootCause": "hidden_not_visible",   // MUST be one of the Part 1 buckets,
                                        // or "ambiguous". No parallel vocab.
  "confidence": 0.78,                   // 0..1; below floor (§4) → no retry spent

  "action": {
    "kind": "precondition_action",      // one of the fixed set below
    // ── fields depend on kind ──
    "actions": [                        // precondition_action only
      "click a.modal-yt__trigger",
      "wait 400"
    ]
    // retarget_selector / use_other_instance: { "selector": "...", "nth": <int?> }
    // scroll_into_view:                        { "selector": "..." }
    // retarget_iframe:                         { "frameSelector": "..." | "url": "..." }
    // terminal_give_up:                        { "terminalCause": "...", "rationale": "..." }
  },

  "successCriterion": {                 // machine-checked vs ENGINE output
    "expect": "moved",                  // "moved" | "status_ok_or_check"
    "onSelector": "div.modal-yt__card"  // optional: require this selector moved
  },
  "abortCriterion": "If still empty with no occluder after this, give up — inert."
}
```

### The fixed repair-action set (closed enum)

| kind | what it changes | maps to | covers residual shape |
|---|---|---|---|
| `retarget_selector` | replace `selector`/`root`/`target`/`action` | recipe re-run | hidden inner affordance → visible parent |
| `use_other_instance` | pick a different match (`selector` or `nth`) of the same pattern | recipe re-run | occluded-but-present; inert representative → animating sibling |
| `scroll_into_view` | scroll a *specific* element into view before arm | extra `scrollintoview` step | element below fold / different scroll anchor |
| `precondition_action` | prepend an `actions[]` sequence as `beforeAction`, then capture unchanged | `runMaybeAction(beforeAction)` at `:1077` | state-gated: open modal / advance carousel / scroll stack |
| `retarget_iframe` | re-point at a frame's document/URL | map re-target path (`:929-945`) | nested/non-dominant frame (rare; Part 1 covers the dominant case) |
| `terminal_give_up` | nothing — stop and record | terminal verdict | genuinely inert / genuinely absent-drifted / cross-origin |

Every non-terminal action reduces to **selector edits + the existing
`runAction` primitive vocabulary**. No action introduces a measurement, a new
browser primitive, or a per-site literal. `terminal_give_up.terminalCause` ∈
`{ genuinely_inert, genuinely_absent, cross_origin_iframe, needs_human,
provider_error }`.

`rootCause` is constrained to the **Part 1 bucket vocabulary** (or `ambiguous`)
— the loop deliberately reuses the eight buckets and invents no parallel
diagnosis language. The LLM *may* override the classifier's bucket (e.g.
re-read a mislabeled `occlusion` as `genuinely_absent`), and that override,
combined with `repairContext.animatableHere`, is exactly how the drift case
reaches a terminal verdict the classifier alone could not.

---

## 4. Retry policy

**`maxRetries = 2` per capture** (worst case 3 recipe executions per failed
capture). Justification:

- The residual shapes each need at most one *structural* correction (a
  re-target, or one precondition sequence). Attempt 1 makes that correction.
- Attempt 2 exists for *one* observed refinement: the first repair's engine
  result is fed back as `attemptHistory`, so the model can fix a wrong-instance
  pick or add the one missing precondition step (e.g. carousel needed two
  advances). Beyond that, marginal yield collapses and per-capture cost (a full
  page open + recipe ≈ several seconds, plus one screenshot + one model call per
  attempt) dominates across ~15 residual captures × 4 calibration sites.

**Hard terminal-give-up conditions (any one stops the loop):**

1. Provider returns `terminal_give_up` → record terminal cause, stop.
2. `confidence < 0.4` (floor) → do not spend a retry on a guess; record
   `unrepaired` with the low-confidence diagnosis attached for the human.
3. **Repeated-identical-failure**: a repair produces the same
   `(status, cause, occludedBy)` triple as a prior attempt on this capture →
   the loop is not converging, stop.
4. `attempt > maxRetries`.
5. **Success**: engine output meets `successCriterion` (machine-checked) →
   record `ok-after-repair`, stop.
6. **Per-run repair budget** (`--repair-budget`, default `2 × repairable-count`):
   a global ceiling on total repair attempts across the run, so a pathological
   site cannot blow up cost/time even if every capture wants 2 retries.

**Why this cannot infinite-loop or blow up cost:**

- Per-capture bound (`maxRetries`) × per-run bound (`--repair-budget`) ×
  repeated-identical detection are three independent ceilings.
- The success/abort criteria are **machine-checked against engine output**, so a
  hallucinated "fixed!" from the model cannot keep the loop alive — only a real
  `elementsMoved ≥ 1` (or the model's explicit terminal) ends it.
- `attemptHistory` is passed back every attempt, so the model is told what
  already failed and is steered away from repeating it.
- Provider errors / invalid JSON fail safe to terminal, never to retry.

---

## 5. Configuration surface (no behavior change when absent)

```jsonc
// manifest.json (optional block) or CLI flags
"repair": {
  "command": "scripts/repair-provider.sh",  // or --repair-cmd
  "maxRetries": 2,                            // or --repair-max-retries
  "budget": null,                             // null → 2 × repairableCount
  "confidenceFloor": 0.4,
  "repairableCauses": [                       // which buckets enter the loop
    "occlusion", "hidden_not_visible", "inert_representative"
  ]
}
```

`repairableCauses` defaults to the three residual buckets the re-baseline
identified (`occlusion` 7, `inert_representative` 5, `hidden_not_visible` 3 — the
~15 target). `pseudo_element` and `wrong_trigger_boot_vs_scroll` are **excluded**
— Parts 2 and 4 already fixed those deterministically; routing them to the LLM
would be wasted spend. `wrong_document_iframe` is excluded at the dominant level
(Part 1 handles same-origin re-target and flags cross-origin as terminal);
`retarget_iframe` remains in the action set only for nested/non-dominant frames.

The provider command contract is dead simple (mirrors `runBrowser`):

```
$ <command> <input.json path>   →   writes <output.json> (path printed on stdout)
```

So the Claude skill, Codex, or a minimal harness each supply their own
provider; the tool does not care which.

---

## 6. Accounting (so we can measure what the loop buys)

The whole point is to later answer "how much did the loop add, per bucket, via
which action?". So every result carries repair provenance.

On each result in `capture-results.json`:

```jsonc
{
  "id": "flowfest-modal-yt-card",
  "status": "ok",               // ALWAYS the engine-measured status, never the LLM's
  "origin": "after-repair",     // "first-try" | "after-repair"
  "repair": {
    "attempted": true,
    "attempts": [
      { "action": "precondition_action",
        "params": { "actions": ["click a.modal-yt__trigger", "wait 400"] },
        "confidence": 0.78,
        "resultStatus": "ok", "resultCause": null }
    ],
    "winningAction": "precondition_action",   // null if unrepaired/terminal
    "outcome": "ok-after-repair",             // "ok-after-repair" |
                                              // "unrepaired" | "terminal"
    "terminalCause": null                     // set when outcome == "terminal"
  }
}
```

Invariants:

- `status` and the spec content come from the engine. `repair` is metadata
  *about* how that status was reached; it never overrides it.
- A `terminal` outcome with `terminalCause: genuinely_absent` is a **first-class
  honest result**, recorded as such — not a silent empty (this is the drift
  case, §7).

`bin/calib-metrics` extension (mechanical, no model judgment):

- Split `captures.ok` → `ok_first_try` + `ok_after_repair`; same for `check`.
- New `repair` block:
  ```jsonc
  "repair": {
    "attempted": <n>, "succeeded": <n>,
    "by_action": { "precondition_action": {att,ok}, "use_other_instance": {att,ok}, ... },
    "by_bucket": { "occlusion": {att,ok}, "hidden_not_visible": {att,ok}, ... },
    "terminal": { "genuinely_inert": <n>, "genuinely_absent": <n>, "needs_human": <n> }
  }
  ```
- `SCOREBOARD.md` gains a repair sub-table: per bucket, `+N ok via <action>`,
  plus a terminal-verdict tally. That is the number that proves (or disproves)
  the loop's value, per bucket, run over run.

This keeps the existing hit%/usable% comparable (an `ok-after-repair` still
counts as `ok`) while making the loop's marginal contribution explicit and
auditable.

---

## 7. The drift / absent case is a design requirement, not an afterthought

flowfest `split-reveal-0-div-speakers-grid-lines` is bucketed `occlusion` by the
classifier but is actually **site drift — the motion no longer exists on the
page**. The loop must reach a TERMINAL "nothing to capture here" verdict and not
burn retries.

How the design guarantees this:

1. The diagnosis input carries `repairContext.animatableHere` (self/pseudo/child
   hover, transition, `@keyframes`, ScrollTrigger binding) **and** the live
   occluder check across the target's instances. For a drifted element all of
   those read false / null.
2. The provider is instructed (and structurally enabled, via the `rootCause`
   override) to emit `terminal_give_up(genuinely_absent)` when there is no
   occluder *and* nothing animatable anywhere near the target — even though the
   classifier said `occlusion`. The LLM correcting a misbucket *toward terminal*
   is the intended use of its judgment.
3. Even if the model first tries a re-target/scroll, the success criterion is
   machine-checked: a re-measure that still finds `elementsMoved == 0` with no
   occluder converges (via repeated-identical detection) to terminal within
   `maxRetries`, not an unbounded hunt.

"Repairable vs genuinely-absent/inert" is thus decided by **structural evidence
in the input + machine-checked re-measurement**, not by the model's optimism.

---

## 8. Driver-agnosticism

The loop adds **exactly one** primitive to the driver contract beyond the
existing six (`open`, `evalJS`, `realHover`, `realScroll`, `realClick`, `wait`):

- `screenshot <path>` — for the diagnosis input. agent-browser has it natively;
  claude-in-chrome exposes a screenshot/`computer` capability; a minimal
  CDP/Playwright headed adapter has `Page.captureScreenshot` /
  `page.screenshot`. Document it in `skill/references/drivers/` alongside the
  six.

Everything else is already driver-mapped:

- All repair **actions** reduce to selector edits + the `runAction` vocabulary
  (`click`/`hover`/`scroll`/`scrollintoview`/`wait`/`{eval}`), which every
  adapter already implements for the normal recipe. A `precondition_action` is
  just an ordinary `beforeAction` array — the carousel-advance, modal-open, and
  stack-scroll repairs are the *same* primitives a planner-authored capture
  uses, in a different order.
- `repairContext` is one read-only `evalJS` probe — driver-agnostic by
  construction (same as the Part 1 `failureProbe`).
- The repair **provider** is an external command, so the model/harness is
  whatever the driver environment supplies. The tool core is unchanged across
  drivers.

No adapter needs to learn about modals, carousels, or repair — only `evalJS`,
the six action primitives, and `screenshot`.

---

## 9. Row-by-row: honest fixability estimate

The residual, by repair shape, with the action the loop would use and a candid
verdict. "Fixable" means the loop plausibly converts it to `ok-after-repair`;
"terminal-win" means the loop's value is an honest STOP, not a capture gained.

### Shape 1 — precondition / state-gated

| row | cause | repair action | verdict |
|---|---|---|---|
| flowfest `div.modal-yt__card` | hidden_not_visible | `precondition_action`: click modal opener → wait → capture | **Fixable IF** a stable opener selector is in `repairContext.candidateTriggers` (e.g. `a.modal-yt__trigger`). **Not fixable** if the lightbox is JS-synthesized from a gallery click with no stable opener, or the card only exists transiently. Medium-high confidence. |
| enerblock `div.carousel__arrow--prev` | occlusion | `precondition_action`: click `.carousel__arrow--next` (1–2×) → capture prev | **Fixable, high confidence.** The next arrow is an obvious sibling; advancing activates prev. Attempt 2 covers "needed two advances". Caveat: if prev's only motion is enabled-state styling (not a transition), engine may still read it as `check` not `ok` — still a usable gain. |
| flowfest `button.btn` under `div.stack-cards__card` | occlusion | `precondition_action`: scroll the stack section to the state that unstacks the card → capture | **Fixable, medium confidence.** `occludedBy` already names `.stack-cards__card`, so the target to clear is known. Risk: a pinned/scrubbed stack may have no scroll offset that fully exposes the button at rest; if so → terminal or needs-human. |

### Shape 2 — occluded-but-present

| row | cause | repair action | verdict |
|---|---|---|---|
| ashley `a.nav-link.btn-animate-chars`, `span.nav-link__label…` | occlusion | `use_other_instance` (pick a match with `occludedBy:null`) or `retarget_selector` to the parent affordance | **Fixable, high confidence** when ≥1 nav-link instance is uncovered (usual case — `repairContext.matches` exposes per-instance occluders). Drops to medium if *all* instances sit under a sticky overlay; then re-target to the occluding parent or accept terminal. |

### Shape 3 — hidden inner affordance

| row | cause | repair action | verdict |
|---|---|---|---|
| flowfest `div.btn__bar` | hidden_not_visible ("no visible elements") | `retarget_selector` to the visible parent `.btn`; `scan(root)` then captures the bar's child/pseudo motion | **Fixable, high confidence.** The bar is a 0-box decoration inside a visible button that the parent's hover drives. Parent is in `repairContext.ancestors`. |
| ashley `button.clickable_btn` | hidden_not_visible | `retarget_selector` to the visible parent or a boxed child | **Fixable, medium-high.** If it's a 0×0 wrapper, the visible sibling/parent is in the neighborhood. If it's genuinely display:none with no visible proxy → terminal. |

### Shape 4 — genuinely inert representative

| row | cause | repair action | verdict |
|---|---|---|---|
| ashley `link-hover`, `misc-hover`; flowfest `misc-hover`; enerblock `split-reveal-0-span-pretitle-content` | inert_representative | `use_other_instance` to find an animating member; **else** `terminal_give_up(genuinely_inert)` | **Mostly terminal-win, low capture gain.** These are dedupe-bucket representatives ("miscellaneous hover candidates"). Some members animate (loop tries a specific one); many do not (`animatableHere` all-false → honest terminal). The value is the honest STOP + the occasional sibling that does move, **not** a high fix rate. Realistically 1–2 of these 4 yield a capture; the rest terminate inert. |

### Cautionary — misbucketed drift (must NOT burn retries)

| row | classifier cause | reality | loop behavior |
|---|---|---|---|
| flowfest `split-reveal-0-div-speakers-grid-lines` | occlusion | site drift — motion gone | `repairContext` shows no occluder + nothing animatable → `terminal_give_up(genuinely_absent)` on attempt 1. **Correct terminal verdict is the success here**, not a capture. §7 guarantees convergence. |

### Bottom line for the PM

Of the ~15 residual captures:

- **Realistically converted to `ok`/`check`-after-repair (~5–7):** the
  precondition rows (carousel-prev high, modal-card and stack-button
  conditional on a discoverable trigger / a viable scroll state), the ashley
  occluded nav-links, and the two hidden-inner-affordance re-targets
  (`btn__bar` high, `clickable_btn` medium). Dominant winning action:
  `precondition_action` and `retarget_selector`/`use_other_instance`.
- **Correct terminal verdicts (~5–6):** most of the inert `misc-hover`/
  `link-hover`/`pretitle-content` representatives, plus the
  `speakers-grid-lines` drift. The loop's value here is an *honest, recorded*
  STOP (`genuinely_inert` / `genuinely_absent`) that stops the scoreboard from
  carrying these as ambiguous empties and stops future runs re-attempting them.
- **Still need a human (~2–3):** any modal/lightbox whose opener is
  JS-synthesized with no stable selector; a pinned stack with no rest scroll
  offset that exposes the button; a nav-link where every instance is occluded.
  The loop will reach `terminal_give_up(needs_human)` with its diagnosis
  attached, which is itself useful triage.

So the loop's headline is **not** a big hit% jump (it is ~5–7 captures on this
set). Its real deliverables are: (1) those genuine repairs, dominated by
precondition actions the deterministic planner structurally cannot author, and
(2) turning the long tail of inert/absent representatives into honest, recorded
terminal verdicts — which is what lets the scoreboard finally distinguish
"the tool failed" from "there is nothing here to capture."

---

## 10. Open questions for the PM before Part 6 builds it

1. **Provider transport**: external command (proposed, dependency-free) vs an
   in-harness JS callback the skill registers. Command is cleaner for
   driver-agnosticism; callback is lower-latency. Recommend command.
2. **Screenshot scope**: full-page vs viewport. Viewport is cheaper and matches
   what the user sees at the failed state; recommend viewport, with the failed
   element scrolled into view first when it has a box.
3. **`repairableCauses` default**: ship with `occlusion + hidden_not_visible +
   inert_representative` only (the sized residual), or open it wider? Recommend
   the narrow default; widen only if a future re-baseline shows new repairable
   buckets.
4. **Budget default**: `2 × repairableCount` per run — acceptable cost ceiling,
   or set a hard absolute (e.g. ≤ 20 repair attempts/run)?

---

## 11. PM review decisions (greenlight + the one must-fix)

Reviewed 2026-06-15. **Verdict: approved to build (Part 6), conditional on M1
below.** The design is sound and grounded — the central claim was verified
against the code (`runMaybeAction(setupAction || beforeAction)` at `:1077` is
real, so a precondition repair is genuinely a `beforeAction` array through the
existing path, no new mechanism). The invariant (LLM never measures; success
machine-checked against engine output), the external-command provider, and the
first-class terminal/drift handling are all exactly right. One correctness gap.

### M1 (MUST-FIX before/within the build) — state isolation for stateful repairs

A `precondition_action` is, by definition, a page-state mutation (modal opened,
carousel advanced, stack scrolled). The design re-runs the recipe but does not
specify isolation. Two failure modes follow under the default reuse-page
strategy:

1. **Dirty start.** The repaired re-run may execute against the already-mutated
   (or failed-hover-dirtied) page rather than a clean rest state, so the
   precondition sequence does not start from where it assumes.
2. **Leak forward.** A successful precondition repair leaves the page mutated
   (modal overlay now covering everything, carousel on a different slide), which
   silently corrupts every subsequent capture that reuses the page.

The codebase already has the discipline for exactly this: stateful clicks are
isolated by default (see `bin/yoinkit:1807`, `:890`, and the
`resetAction` teardown at `:1112`). **Any repair that mutates page state
(`precondition_action`, and `scroll_into_view`/`use_other_instance` where it
changes scroll/UI state) must force a fresh/isolated page for its re-run, so it
starts from rest and cannot leak into later captures.** Make this explicit in
the action contract (e.g. stateful repair kinds set `fresh: true` on the cloned
capture). This is the only blocker; everything else is build-ready.

### Open-question rulings (§10)

1. **Provider transport → external command.** Approved as recommended.
   Dependency-free, driver-agnostic, and stub-testable in smoke without a model.
2. **Screenshot scope → viewport**, with the failed element scrolled into view
   first when it has a box. Approved.
3. **`repairableCauses` default → narrow**: `occlusion + hidden_not_visible +
   inert_representative` only. Approved. Widen only when a future re-baseline
   shows a new repairable bucket; do not pre-open it.
4. **Budget → keep `2 × repairableCount` AND add a hard absolute ceiling**
   (`min(2 × repairableCount, 24)` attempts/run). The multiplier scales with the
   residual; the absolute protects the 4-site calibration loop's wall-clock from
   a pathological site even if the count is high. Belt and suspenders.

### Build notes (non-blocking, for Part 6)

- **`candidateTriggers` discovery is the make-or-break of the precondition
  class.** Prioritize `aria-controls` / `aria-expanded` / `aria-haspopup` as the
  highest-signal opener hints, then fall back to proximity + `cursor:pointer` /
  `role=button`. Most precondition wins or misses will be decided here.
- **The `confidence < 0.4` floor is a soft heuristic** — it is model
  self-reported and uncalibrated. Fine to keep as a cost gate, but it must not
  become load-bearing: the real safety is the machine-checked `successCriterion`
  + repeated-identical detection, which the design correctly centers. Keep it
  that way.
- **Scoreboard:** keep `ok_first_try` as the primary headline (the engine's
  unaided floor = the honest "tool quality" signal); `ok_after_repair` is the
  visible increment, never folded silently into a single hit% that hides the
  floor.

### Accepted framing

The headline is correctly **not** a hit% leap (~5–7 captures here). The two real
deliverables — precondition repairs the deterministic planner structurally
cannot author, and converting the inert/absent long tail into honest recorded
terminal verdicts — are accepted as the goal. Part 6 is greenlit to build to
this doc once M1 is folded in.

### Post-build amendment (after Part 6, PR #1)

Two things the build surfaced that refine this doc:

- **§3 successCriterion default.** The criterion should default to
  `expect: moved`, not pin `onSelector` to the armed root. Motion frequently
  lives in child layers (the enerblock carousel icons move under the armed
  wrapper), so a root-pinned criterion false-negatives a real repair. Fixed in
  the build (commit `30aa982`); the real provider prompt (Part 7) must default to
  `expect: moved`.
- **§7 is structural for *termination*, not for the *label*.** §7 implies "no
  occluder AND nothing animatable → terminal `genuinely_absent`" is a structural
  guarantee. In reality the flowfest grid-lines drift case *has* a cursor-wrap
  occluder yet nothing animatable, so the structural rule alone would not fire;
  the loop's repeated-identical fallback still bounds it (it always terminates),
  but it would label it `needs_human`. The honest `genuinely_absent` label came
  from the provider weighing `animatableHere`. So: **termination is structural;
  the precise terminal label is provider judgment.** That is acceptable (both are
  honest terminals, neither burns budget), and Part 7's provider prompt is
  instructed to weight `animatableHere` for the label.
