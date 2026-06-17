# Repair contracts (condensed)

The runtime-facing shapes for the repair loop. The historical rationale is
`docs/archive/legacy-capture-pipeline/PART-5-repair-loop-design.md` (§2 input,
§3 output, §6 accounting); this is
the operational summary. All three are produced/consumed by the tool — you rarely
hand-write them, but you read them to drive the loop and to brief the subagent.

## §2 — diagnosis input (written by `capture --repair-dump`)

`<run>/repair/<id>.attempt-1.input.json`. What the subagent reads. Key fields:

- `captureId`, `attempt`, `url`, `viewport`
- `failure`: `{ status, reason, cause, causeSignals }` — Part 1's verdict. **Consume,
  don't re-derive.** `causeSignals` carries `occludedBy`, visibility, pseudo flags.
- `failedRecipe`: `{ type, selector, root, action, arm, beforeAction, waitMs }` —
  the recipe as run (structural echo, no measurement).
- `screenshot`: run-relative PNG path of the failed viewport state (targeting only).
- `mapSubtree`: the slice of `map.json` this capture came from (group, section,
  split-reveal, hover-candidate membership).
- `repairContext`: the rich structural probe — `matches[]`, `ancestors[]`,
  `siblings[]`, `candidateTriggers[]` (aria-* first), and `animatableHere`
  `{ selfHover, pseudoHover, childAnimated, scrollTriggerBound }`. This is what every
  repair shape keys on, and the gate for an honest terminal verdict.
- `attemptHistory`: `[]` on attempt 1; on a retry you brief the subagent with what
  was tried (see `repair-loop.md`).

## §3 — repair output (the subagent returns this; `repair-step.js` validates it)

The coordinator asks diagnosis workers for a small batch. The worker returns a
JSON array keyed by `captureId`; each item contains ranked hypotheses:

```jsonc
[
  {
    "captureId": "cap-1",
    "primary": { /* §3 repair object, actionable */ },
    "fallback": { /* §3 repair object, actionable */ },
    "terminal": { /* §3 repair object with terminal_give_up */ }
  }
]
```

`primary` is applied first. If the engine says it did not converge, the
coordinator queues `fallback` without spawning another worker. `terminal` is
recorded after action hypotheses fail; it is not a third browser re-measure.

Each hypothesis is still the same repair object:

```jsonc
{
  "diagnosis": "<why this fixes it>",
  "rootCause": "<Part 1 bucket | ambiguous>",
  "confidence": 0.0,                       // < 0.4 → loop skips it (a guess)
  "action": { "kind": "<see below>", ...kind-specific },
  "successCriterion": { "expect": "moved", "onSelector": "<optional>" },
  "abortCriterion": "<optional>"
}
```

Action kinds (closed enum) and required fields — these are what
`validateRepairOutput` enforces:

| kind | required | stateful (forces fresh re-run) |
|---|---|---|
| `retarget_selector` | `selector` (non-blank) | no |
| `use_other_instance` | `selector` (non-blank) | no |
| `scroll_into_view` | `selector` | **yes** |
| `precondition_action` | `actions[]` (recipe verbs only) | **yes** |
| `retarget_iframe` | `url` (frameSelector-only is rejected) | **yes** |
| `terminal_give_up` | `terminalCause` | n/a |

`precondition_action.actions[]` steps use only:
`click · dblclick · hover · focus · scrollintoview · wait · scroll · press · mouse ·
eval` (string `"click .sel"` or object `{command, selector}` / `{waitMs}` / `{eval}`).

`successCriterion`:
- `expect: "moved"` (the default) — any element moved (status ok/check). Use this;
  motion often lives in child layers, so don't pin `onSelector` to the armed root.
- `expect: "status_ok_or_check"` — same bar when no `onSelector`.
- `onSelector` (optional) — require that a *specific* element moved. Matched on
  parsed tag/id/classes (so `.nav` ≠ `.navigation`); extra state classes allowed.

`terminalCause` ∈ `genuinely_inert · genuinely_absent · cross_origin_iframe ·
needs_human · provider_error`. Drift (no occluder + nothing animatable) →
`genuinely_absent`. The model weighs `animatableHere` to pick the precise label;
the loop only guarantees termination.

## §6 — provenance (written by `repair-step.js` into capture-results.json)

Per result:

```jsonc
{
  "id": "...",
  "status": "ok",                 // ALWAYS the engine-measured verdict
  "origin": "after-repair",       // "first-try" | "after-repair"
  "repair": {
    "attempted": true,
    "failureCause": "occlusion",  // the ORIGINAL Part 1 bucket, for metrics
    "attempts": [ { "action": "...", "params": {...}, "confidence": 0.8,
                    "resultStatus": "ok", "resultCause": null } ],
    "winningAction": "precondition_action",   // null if unrepaired/terminal
    "outcome": "ok-after-repair",             // ok-after-repair | unrepaired | terminal
    "terminalCause": null
  }
}
```

`status` is the engine's; `repair` is metadata about *how* it was reached and never
overrides it. `calib-metrics` reads this to split `ok` → `ok_first_try` +
`ok_after_repair` and to tally `repair.by_action` / `by_bucket` / `terminal`.
