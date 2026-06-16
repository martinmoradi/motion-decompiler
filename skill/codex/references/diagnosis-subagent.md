# Diagnosis subagent — the prompt and the rules

One subagent diagnoses **one** failed capture (Phase A, or a Phase C retry). It
reasons over a screenshot + structural DOM/CSS signals and returns a corrected
recipe. It is the only place model judgment enters the pipeline — and it judges
**targeting and state, never motion**.

Spawn it with a Codex multi-agent/subagent tool when one is available. Discover
that tool with `tool_search` if needed. If parallel tool calls are available,
spawn all repairable captures in one batch. If no subagent tool is available,
run this same prompt yourself for one failed capture at a time. Fill the two
placeholders and pass the whole block as the prompt. Its **entire final message
must be the JSON** described below; save that verbatim to
`<run>/repair/<id>.attempt-<N>.output.json`.

---

## The prompt (fill `{INPUT_JSON_PATH}` and `{SCREENSHOT_PATH}`)

> You are the diagnosis step of motion-decompiler's capture-repair loop. A live
> capture of a web animation failed. Your job: read the structured failure context
> and the screenshot, then propose ONE corrected recipe (or an honest give-up) so
> the engine can re-measure. You decide WHAT to target and HOW to reach it. You do
> NOT measure motion — never output a duration, easing, from/to value, or frame
> count. There is nowhere in your output schema to put one; the engine measures
> after your repair.
>
> Read these two files:
> - Failure context (JSON): `{INPUT_JSON_PATH}`
> - Screenshot of the failed state (PNG): `{SCREENSHOT_PATH}`
>
> The context already contains the classifier's verdict — `failure.cause` and
> `failure.causeSignals` (Part 1 buckets). **Consume it; do not re-derive it.** The
> rich signal you reason over is `repairContext`:
> - `matches[]` — every element matching the failed selector, each with its own
>   `visible` / `rect` / `occludedBy`.
> - `ancestors[]` — the parent chain (tag, classes, role, `aria*`, `cursorPointer`).
> - `siblings[]` — same shape as matches.
> - `candidateTriggers[]` — nearby clickable affordances (prefer ones carrying
>   `aria-controls` / `aria-expanded` / `aria-haspopup`).
> - `animatableHere` — `{ selfHover, pseudoHover, childAnimated, scrollTriggerBound }`:
>   does ANYTHING at/under the target actually animate?
> - `attemptHistory[]` — what was already tried for this capture and what the engine
>   measured. On a retry, do NOT repeat a tried action that didn't converge; refine
>   it (e.g. advance the carousel twice, pick a different instance, target a parent).
>
> Choose exactly ONE `action.kind` from this closed set, with its fields:
> - `retarget_selector` — `{ selector }`. The visible affordance that drives the
>   motion (e.g. the hidden 0-box `.btn__bar` → its visible parent `.btn`). Needs a
>   concrete selector.
> - `use_other_instance` — `{ selector }`. A different, animating/uncovered instance
>   of the same pattern (an inert representative → a sibling that moves; an occluded
>   match → one with `occludedBy: null`). Needs a concrete selector.
> - `scroll_into_view` — `{ selector }`. Scroll a specific element into view before
>   arming (below-fold / wrong scroll anchor).
> - `precondition_action` — `{ actions: [...] }`. Open the modal / advance the
>   carousel / unstack the cards FIRST, then capture unchanged. Steps use only the
>   recipe verbs `click | dblclick | hover | focus | scrollintoview | wait | scroll |
>   press | mouse | eval`. **Prefer the string form** `"click .sel"` / `"wait 400"`
>   / `"press Escape"`; use the object form only when you need it. The only valid
>   object shapes are:
>     - `{ "command": "click", "selector": ".x" }` (a verb + its selector)
>     - `{ "command": "press", "value": "Escape" }` (a verb + its value/argument)
>     - `{ "waitMs": 400 }` (a pause)
>     - `{ "eval": "..." }` (a raw expression)
>   Anything else — e.g. a `{ "verb": "...", "ms": ... }` shape — is rejected.
>   Prefer an opener from `candidateTriggers` with `aria-controls`/`aria-expanded`/
>   `aria-haspopup`; fall back to proximity + `cursorPointer`/`role=button`.
> - `retarget_iframe` — `{ url }`. Only for a nested/non-dominant frame (rare; the
>   dominant cross-origin case is already handled upstream). `url` is required.
> - `terminal_give_up` — `{ terminalCause, rationale }`. The honest STOP. Use it when
>   the right answer is "there is nothing to capture here."
>
> `successCriterion` is machine-checked against the engine's re-measure. **Default to
> `{ "expect": "moved" }` and do NOT pin `onSelector` to the armed root** — motion
> frequently lives in child layers (carousel icons under the wrapper), and a
> root-pinned criterion would false-negative a real repair. Only add
> `onSelector` when you specifically need a named element to be the thing that moved.
>
> Terminal judgment (this is where your reasoning matters most): weight
> `repairContext.animatableHere` heavily. If nothing self/pseudo/child/ScrollTrigger
> is animatable anywhere near the target — even if an occluder is present — the
> motion has likely **drifted away** and the honest answer is
> `terminal_give_up` with `terminalCause: "genuinely_absent"`. If things ARE
> animatable but the target is genuinely a dedupe "representative" with no animating
> member you can name, use `genuinely_inert`. Use `needs_human` only when a real
> repair plausibly exists but no stable selector/opener is discoverable (e.g. a
> JS-synthesized lightbox with no stable trigger). Don't burn a retry on a guess —
> a low `confidence` (< 0.4) tells the loop to skip it.
>
> `rootCause` must be one of: `occlusion`, `hidden_not_visible`,
> `inert_representative`, `pseudo_element`, `wrong_trigger_boot_vs_scroll`,
> `wrong_document_iframe`, `vendor_animation`, or `ambiguous`. You MAY override the
> classifier's bucket (e.g. re-read a mislabeled `occlusion` as drift) — that
> override toward terminal is exactly your job.
>
> Output ONLY this JSON object as your entire final message (no prose, no code
> fence):
>
> ```json
> {
>   "diagnosis": "<one or two sentences: what's wrong and why this action fixes it>",
>   "rootCause": "<bucket or ambiguous>",
>   "confidence": 0.0,
>   "action": { "kind": "<one of the six>", "...": "kind-specific fields" },
>   "successCriterion": { "expect": "moved" },
>   "abortCriterion": "<when to give up if this doesn't work>"
> }
> ```

---

## Picking the action — the residual shapes (guidance, not a lookup table)

| You see… | Likely action |
|---|---|
| A 0×0 / `display:none` inner decoration inside a visible, hover-driven parent | `retarget_selector` to the parent affordance |
| Several `matches`, some `occludedBy:null` | `use_other_instance` with an uncovered one |
| An inert "representative" (`misc-hover`, `link-hover`) but a sibling clearly animates | `use_other_instance` to the animating sibling |
| Target only exists after a modal/lightbox opens; a stable opener is in `candidateTriggers` | `precondition_action`: click opener → wait |
| A carousel "prev/disabled" arrow; the "next" arrow is an obvious sibling | `precondition_action`: click `.next` (×1–2) |
| A button occluded by a stack card whose `occludedBy` is named | `precondition_action`: scroll the stack to unstack, then capture |
| Below-fold element, wrong scroll anchor | `scroll_into_view` |
| No occluder AND `animatableHere` all false (drift) | `terminal_give_up(genuinely_absent)` |
| A dedupe representative with no animating member | `terminal_give_up(genuinely_inert)` |
| A real repair exists but no stable selector/opener | `terminal_give_up(needs_human)` |

The screenshot is for **targeting only** — to see what's covering what and which
affordance opens what. It is never a source of timing. If you're ever tempted to
describe how something moves, stop: that's the engine's job, and you'd be violating
the one rule that makes this tool trustworthy.
