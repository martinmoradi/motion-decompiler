# The skill-driven repair loop

Run this only when `capture --repair-dump` left captures with a `repairInput`
field in `<run>/capture-results.json`.

The agent still supplies local subscription reasoning through Codex subagents,
but `repair-loop.js` owns workflow state in `<run>/repair/loop-state.json`.
Do not track budget, retries, pending captures, or repeated-identical handling
manually in prose.

Authoritative contracts: `references/repair-contracts.md` (§2/§3/§6) and, for
historical rationale,
`docs/archive/legacy-capture-pipeline/PART-5-repair-loop-design.md`.

## 1. Initialize coordinator state

```bash
bun skill/codex/scripts/repair-loop.js init \
  --run <run> --manifest <manifest-you-captured-with>
```

This reads `<run>/capture-results.json`, discovers repairable rows, snapshots
their original `(status, cause, occludedBy)` triples, computes
`budget=min(2×repairableCount, 24)`, and writes
`<run>/repair/loop-state.json`.

Use `--force` only when intentionally discarding an existing repair loop state.

## 2. Generate diagnosis prompts

```bash
bun skill/codex/scripts/repair-loop.js next-prompts --run <run>
```

The command writes batch input and prompt files under `<run>/repair/` and prints
the worker batches to run. It defaults to at most 10 capture inputs per wave,
grouped 3 captures per worker, with at most 6 workers. A 10-capture residual
therefore prints 4 worker prompts, not 10. Each prompt is filled from
`references/diagnosis-subagent.md`.

For attempt 1, the prompt points at the original
`<run>/repair/<id>.attempt-1.input.json` written by `capture --repair-dump`.
For attempt 2, the coordinator writes a derived
`<run>/repair/<id>.attempt-2.input.json` with `attemptHistory`, reuses the
screenshot, and appends a no-repeat retry note to the prompt.

Each printed item has `{ batchId, prompt, input, captures }`. Spawn one local
Codex worker per printed batch when a subagent tool is available. If no subagent
tool is available, run the same prompts serially in the current agent. The
worker's entire final message must be the batched JSON array: one item per
`captureId`, with `primary`, `fallback`, and `terminal` hypotheses.

## 3. Save subagent outputs

Pipe each worker's final JSON array through the coordinator:

```bash
printf '%s\n' "$SUBAGENT_FINAL_JSON" | \
  bun skill/codex/scripts/repair-loop.js save-output \
    --run <run> --batch <batchId>
```

You can also use `--file <json>` for an output saved on disk. The legacy
single-capture form remains available for manual use:

```bash
bun skill/codex/scripts/repair-loop.js save-output \
  --run <run> --id <id> --attempt <attempt> --file <single-output.json>
```

`save-output` keeps a raw copy, delegates schema validation to
the same §3 validation helper used by `repair-step.js`, and records valid or
invalid output in `loop-state.json`. Do not hand-edit rejected output files.
Invalid primary output is still routed through `apply-ready`, where it spends one
budget unit and becomes a safe `terminal_give_up(provider_error)` through
`repair-step.js apply`.

## 4. Apply ready outputs

```bash
bun skill/codex/scripts/repair-loop.js apply-ready --run <run>
```

This serially applies saved outputs while budget remains. It spends one budget
unit per ready actionable or invalid-provider attempt. For batched ranked output,
only the active hypothesis is applied on each call: primary first, then fallback
on a later `apply-ready` call if the engine says primary did not converge.

Actual repair application and re-measurement are delegated to
`repair-step.js apply`. For actionable repairs, `repair-step.js` clones the
capture, runs a fresh isolated single capture when required, asks the engine to
measure, machine-checks success, promotes repaired timelines, and writes §6
provenance into `capture-results.json`.

If an actionable re-measure reproduces a triple already seen for that capture,
the coordinator first checks whether a queued fallback from the same diagnosis
batch exists. If so, it queues that fallback instead of terminalizing. Once there
is no fallback, a ranked `terminal` hypothesis is recorded with
`repair-step.js terminal`; otherwise the repeated-identical terminalization
applies. The automatic repeated-identical terminal uses `genuinely_inert` when
the diagnosis input says nothing nearby is animatable and the verdict has no
occluder; otherwise it uses `needs_human`.

If attempt 1 fails with a distinct triple and there is no queued fallback, the
record becomes eligible for an attempt 2 prompt. Never go past attempt 2. A
ranked terminal condition is a stop condition after action hypotheses fail, not a
third browser re-measure.

## 5. Repeat until idle, then summarize

Repeat:

```bash
bun skill/codex/scripts/repair-loop.js next-prompts --run <run>
# run local subagents and save their final JSON arrays by --batch
bun skill/codex/scripts/repair-loop.js apply-ready --run <run>
```

Stop when `next-prompts` prints no prompts and `summary` shows no pending or
ready work:

```bash
bun skill/codex/scripts/repair-loop.js summary --run <run>
```

Use the summary counts when reporting the run:

- **captured first-try**: `origin: first-try`, status `ok`/`check`
- **captured after-repair**: `origin: after-repair`, `repair.outcome:
  ok-after-repair`
- **honest terminal / unrepaired**: `repair.outcome: terminal | unrepaired`
- **pending / budget-exhausted**: coordinator state that still explains why no
  repair was applied

If you want the per-bucket repair tally the SCOREBOARD uses, run
`./bin/calib-metrics <run> --site <slug>` and read `metrics.repair`.

## The invariant, restated for this loop

Status, findings, durations, easings, and from/to values in the final spec come
only from the engine's re-measure. The subagent names a selector, state action,
or terminal verdict. `repair-loop.js` tracks local workflow state.
`repair-step.js` applies the action and asks the engine. If a repaired capture
shows a measured number, that number was sampled by the engine after the repair,
never asserted by the model.
