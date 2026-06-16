# The skill-driven repair loop

You (the agent running the skill) own this loop: which failures to diagnose, when
to retry, when to stop. The **engine** still does every measurement — you only ever
move selectors/state around and let it re-measure. This file is the exact
procedure. Run it only when `capture --repair-dump` left captures with a
`repairInput` field in `<run>/capture-results.json`.

Authoritative contracts: `references/repair-contracts.md` (§2/§3/§6) and, for the
full rationale, `docs/PART-5-repair-loop-design.md`.

## Setup

1. Let `R` = the list of results in `capture-results.json` (in order). Each result's
   **index** in `R` is also its index in the capture manifest you ran
   (`manifest.proposed.json` or `manifest.targeted.json`) — the arrays are parallel.
2. `repairable` = the results with a `repairInput`. If none, skip repair entirely.
3. `budget = min(2 × repairable.length, 24)`. Spend **one** budget unit per apply
   attempt (including a terminal or low-confidence attempt — diagnosis isn't free).
   When `budget` hits 0, stop launching attempts; leave the rest as honest
   first-try soft-fails and say so.
4. `maxRetries = 2`, `confidenceFloor = 0.4` (these are enforced inside
   `repair-step.js`; you enforce the budget, the retry count, and repeated-identical).

## Phase A — diagnose, in parallel (no browser)

For **every** repairable result, spawn one diagnosis subagent — all in a single
batch so they run concurrently. Build each prompt from
`references/diagnosis-subagent.md`, filling:

- `{INPUT_JSON_PATH}` → `<run>/<result.repairInput>`
- `{SCREENSHOT_PATH}` → `<run>/repair/<id>.attempt-1.png` (the input's `screenshot`
  field; may be absent if the screenshot failed — then tell the subagent to reason
  from `repairContext` alone).

Save each subagent's final message verbatim to
`<run>/repair/<id>.attempt-1.output.json`. (Subagents return raw JSON — that IS the
file content.)

## Phase B — apply + re-measure, serial per site (headed)

For each repairable result, in order, if `budget > 0`:

```bash
node skill/claude/scripts/repair-step.js apply \
  --run <run> --manifest <manifest-you-captured-with> \
  --index <result index in R> --id <id> \
  --output <run>/repair/<id>.attempt-1.output.json --attempt 1
```

Decrement `budget`. The script routes the output and prints a one-line verdict JSON:

- `outcome: "terminal"` → an honest STOP (provider-chosen give-up, invalid output,
  or a sub-run failure). Recorded. Done with this capture.
- `outcome: "unrepaired"`, `lowConfidence: true` → skipped a guess. Done.
- `outcome: "ok-after-repair"`, `converged: true` → the **engine** re-measured and
  it moved. Recorded with the repaired timeline promoted into the run. Done.
- `outcome: "unrepaired"`, `measured: true`, `converged: false` → an actionable
  repair that didn't converge → eligible for **one** retry (Phase C). Keep its
  verdict (note its `resultTriple` and `occludedBy`).

Serial, not parallel: these drive the one real browser, and stateful repairs must
not interleave. (Each apply is its own fresh isolated single capture — M1 holds by
construction — but running two headed captures at once would still collide.)

## Phase C — one retry for the unconverged actionable repairs

For each Phase-B verdict that is `unrepaired / measured / not converged`, and only
if `attempt < maxRetries` and `budget > 0`:

1. Spawn one more diagnosis subagent. Reuse the **same** attempt-1 input + screenshot
   (the failed state is structurally unchanged), and append an attempt-history note
   to the prompt, e.g.:

   > ATTEMPT HISTORY: attempt 1 used `<kind>` (`<params>`) and the engine measured
   > `<status>` (occludedBy: `<occludedBy>`); it did not converge. Do not repeat it
   > unchanged — refine it (a different instance, an extra precondition step, a
   > parent target), or give an honest `terminal_give_up` if nothing here animates.

   Save to `<run>/repair/<id>.attempt-2.output.json`.

2. Apply attempt 2:

   ```bash
   node skill/claude/scripts/repair-step.js apply \
     --run <run> --manifest <manifest> --index <i> --id <id> \
     --output <run>/repair/<id>.attempt-2.output.json --attempt 2
   ```

   Decrement `budget`. Read the verdict:
   - `converged` → done (ok/check-after-repair).
   - **repeated-identical**: the attempt-2 `resultTriple` equals attempt 1's → it's
     not converging. Stop and record an honest terminal:

     ```bash
     node skill/claude/scripts/repair-step.js terminal --run <run> --id <id> --attempt 2 \
       --cause <genuinely_inert|needs_human> --diagnosis "repeated-identical; not converging"
     ```

     Choose `genuinely_inert` when the attempt-1 input's
     `repairContext.animatableHere` is all false **and** the verdict has no
     `occludedBy`; otherwise `needs_human`. (This mirrors the in-tool loop's
     terminal labeling — termination is structural, the precise label is judgment.)
   - distinct triple but attempt 2 was the last → leave as `unrepaired` (an honest
     "the loop couldn't fix it", with the diagnosis attached for a human).

Never go past attempt 2, and never re-run a capture whose outcome is already
`terminal` or `ok-after-repair`.

## After the loop

`repair-step.js` has already written `origin` + the `repair{}` provenance block
into `capture-results.json` (§6 schema), and promoted converged timelines into
`<run>/timelines/`. Proceed to `assemble` + `report`. When you summarize for the
user, split the count three ways and be honest:

- **captured first-try** (`origin: first-try`, status ok/check),
- **captured after-repair** (`origin: after-repair`, `repair.outcome:
  ok-after-repair`) — name the winning action,
- **honest terminal / unrepaired** (`repair.outcome: terminal | unrepaired`) — name
  the terminal cause; this is the tool correctly saying "nothing to capture here"
  or "this needs a human", not a silent empty.

If you want the per-bucket repair tally the SCOREBOARD uses, run
`./bin/calib-metrics <run> --site <slug>` and read `metrics.repair`.

## The invariant, restated for this loop

Status, findings, durations, easings, and from/to values in the final spec come
**only** from the engine's re-measure. The subagent named a selector or an action;
`repair-step.js` applied it and asked the engine. If a "repaired" capture shows a
number, that number was sampled by the engine after the repair — never asserted by
the model. That is the whole point.
